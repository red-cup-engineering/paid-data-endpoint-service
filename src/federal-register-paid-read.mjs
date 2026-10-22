/**
 * An adapter from a content-addressed public-data lot to the original
 * Red Cup durable x402 paid-data actor, not a replacement payment system.
 *
 * This module never signs a payment, chooses a wallet, advertises a made-up
 * merchant, or records a purchase absent settlement by the original actor.
 */
import { FEDERAL_REGISTER_REUSE, verifyFederalRegisterInventoryLot } from "./federal-register-inventory.mjs";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function federalRegisterLotReadRequest(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== 1 || !Object.hasOwn(value, "lotDigest") ||
      typeof value.lotDigest !== "string" || !SHA256.test(value.lotDigest)) {
    throw new TypeError("paid read requires exactly one canonical sha256 lotDigest");
  }
  return Object.freeze({ lotDigest: value.lotDigest });
}

/**
 * The customer-supplied store must be an immutable, durable content-addressed
 * store that returns the actual saved JSON lot for the exact digest. A digest
 * is a version reference, not a seller authorization or source signature.
 */
export function createFederalRegisterPaidReadHandlers({ lotStore, maxAgeMs = DEFAULT_MAX_AGE_MS, now = Date.now } = {}) {
  if (typeof lotStore?.read !== "function") throw new TypeError("seller's durable lotStore.read is required");
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 60_000 || maxAgeMs > 365 * 24 * 3600 * 1000) {
    throw new RangeError("maxAgeMs must be a bounded positive freshness window");
  }
  if (typeof now !== "function") throw new TypeError("now must be an observed clock function");

  async function loadPinned(request) {
    const { lotDigest } = federalRegisterLotReadRequest(request);
    const supplied = await lotStore.read({ digest: lotDigest });
    if (supplied === undefined || supplied === null) throw new Error("requested immutable inventory lot is unavailable");
    // Never deliver a mutable store reference directly: validate the snapshot
    // and return exactly the bytes it committed to at this read boundary.
    const lot = structuredClone(supplied);
    verifyFederalRegisterInventoryLot(lot);
    if (lot.digest !== lotDigest) throw new Error("store returned a different inventory digest");
    return lot;
  }

  async function admit({ request } = {}) {
    // Express exposes parsed JSON in request.body. The existing actor calls
    // this before issuing an x402 payment challenge to the buyer.
    const lot = await loadPinned(request?.body);
    const age = now() - Date.parse(lot.observedAt);
    if (!Number.isFinite(age) || age < -300_000 || age > maxAgeMs) {
      throw new Error("inventory lot is outside the seller's declared freshness window");
    }
    return Object.freeze({ admitted: true, lotDigest: lot.digest, records: lot.recordCount });
  }

  async function execute({ intent } = {}) {
    // Called by the existing actor ONLY when its x402 settlement projection
    // succeeds. Re-read the exact signed request and hash before delivering.
    const lot = await loadPinned(intent?.request);
    return Object.freeze({
      kind: "FederalRegisterInventoryPaidDelivery",
      schemaVersion: "561.public-data-paid-delivery.v1",
      lotDigest: lot.digest,
      lot,
      consideration: "seller's curation, freshness verification and delivery service, not exclusive ownership of public information",
      rights: FEDERAL_REGISTER_REUSE,
      // The original PaidDataEndpointReceipt owns settlement evidence. The
      // delivery payload alone does not evidence an accepted purchase.
      receipt: "recorded by the original durable paid-data actor, not by this payload",
    });
  }

  return Object.freeze({ admit, execute });
}

/**
 * Join the original `read-data` x402 actor with this SKU's admission and
 * execution logic. Sender must supply a genuine authorized original seller
 * offer, priceTerms/payee/asset/network, a durable store, and a durable append
 * + recoveredRecords pair. The original x402 service remains the sole holder
 * of payment verification and settlement behavior.
 *
 * Factories are injectable solely for bounded contract tests. In production,
 * omitted factories resolve the original Red Cup source-owned implementations.
 */
export async function createFederalRegisterPaidReadActor({
  lotStore,
  sellerOffer,
  priceTerms,
  append,
  recoveredRecords,
  basePath = "/x402/federal-register-inventory",
  maxAgeMs,
  now,
  facilitatorUrl,
  facilitatorClient,
  paymentBoundaryFactory,
  actorFactory,
  paymentIdentity,
  settlementProjection,
} = {}) {
  if (sellerOffer === null || typeof sellerOffer !== "object" || Array.isArray(sellerOffer)) {
    throw new TypeError("an independently authorized sellerOffer object is required");
  }
  if (typeof append !== "function" || !(recoveredRecords?.intents instanceof Map) ||
      !(recoveredRecords?.terminals instanceof Map)) {
    throw new TypeError("the original durable append and recoveredRecords are required");
  }
  const handlers = createFederalRegisterPaidReadHandlers({ lotStore, maxAgeMs, now });
  const makeActor = actorFactory ?? (await import("./paid-data-endpoint.mjs")).createPaidDataEndpointActor;
  const makePaymentBoundary = paymentBoundaryFactory ??
    (await import("@red-cup-engineering/x402-services-section/server")).createExactEvmPaymentBoundary;
  if (typeof makeActor !== "function" || typeof makePaymentBoundary !== "function") {
    throw new TypeError("original priced-data actor and payment boundary factories are required");
  }
  const offer = {
    ...sellerOffer,
    kind: "FederalRegisterInventoryPaidReadOffer",
    requestSchema: { type: "object", required: ["lotDigest"], additionalProperties: false,
      properties: { lotDigest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" } } },
    source: "https://www.federalregister.gov/api/v1/documents.json",
    sourceRights: FEDERAL_REGISTER_REUSE,
    consideration: "sale of verified acquisition/derivation/delivery service, not exclusive public-data rights",
  };
  return makeActor({
    operation: "read-data",
    basePath,
    offer,
    priceTerms,
    admit: handlers.admit,
    append,
    execute: handlers.execute,
    recoveredRecords,
    ...(facilitatorUrl === undefined ? {} : { facilitatorUrl }),
    ...(facilitatorClient === undefined ? {} : { facilitatorClient }),
    paymentBoundaryFactory: makePaymentBoundary,
    ...(paymentIdentity === undefined ? {} : { paymentIdentity }),
    ...(settlementProjection === undefined ? {} : { settlementProjection }),
  });
}
