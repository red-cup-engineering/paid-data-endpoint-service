/** World Bank data products inherit the original durable x402 paid-data actor. */
import { verifyWorldBankInventoryLot } from './international-data-inventory.mjs';
import { INTERNATIONAL_SOURCES, admitInternationalSourceDeclarations } from './international-source-declarations.mjs';
const SHA = /^sha256:[a-f0-9]{64}$/u;
const DEFAULT_AGE = 30 * 24 * 3600_000;

export function internationalLotReadRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 1 || typeof value.lotDigest !== 'string' ||
      !SHA.test(value.lotDigest)) {
    throw new TypeError('exact canonical sha256 lotDigest is required for an international paid read');
  }
  return Object.freeze({ lotDigest: value.lotDigest });
}

export function createInternationalPaidReadHandlers({ lotStore, now = Date.now, maxAgeMs = DEFAULT_AGE,
  sourceDeclarations = INTERNATIONAL_SOURCES } = {}) {
  if (typeof lotStore?.read !== 'function') throw new TypeError('seller-owned immutable lotStore.read is required');
  if (typeof now !== 'function') throw new TypeError('seller clock is required');
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 60_000 || maxAgeMs > 366 * 24 * 3600_000) {
    throw new TypeError('seller freshness window is not bounded');
  }
  const sources = admitInternationalSourceDeclarations(sourceDeclarations);
  async function pinned(request) {
    const { lotDigest } = internationalLotReadRequest(request);
    const supplied = await lotStore.read({ digest: lotDigest });
    if (supplied === undefined || supplied === null) throw new Error('requested international inventory lot is unavailable');
    const lot = structuredClone(supplied);
    const millis = now();
    if (!Number.isSafeInteger(millis)) throw new Error('seller clock must provide epoch milliseconds');
    verifyWorldBankInventoryLot(lot, { asOf: new Date(millis).toISOString().slice(0, 10), sourceDeclarations: sources });
    if (lot.digest !== lotDigest) throw new Error('seller returned a different lot digest');
    const age = millis - Date.parse(lot.observedAt);
    if (!Number.isFinite(age) || age < -300_000 || age > maxAgeMs) {
      throw new Error('international inventory has expired or has not yet been observed');
    }
    return lot;
  }
  async function admit({ request } = {}) {
    const lot = await pinned(request?.body);
    return Object.freeze({ admitted: true, digest: lot.digest, sourceId: lot.sourceId, records: lot.recordCount });
  }
  async function execute({ intent } = {}) {
    const lot = await pinned(intent?.request);
    return Object.freeze({
      kind: 'WorldBankIndicatorPaidDelivery',
      schemaVersion: '561.international-data-paid-delivery.v1',
      digest: lot.digest,
      lot,
      consideration: 'seller normalization, freshness review, quality control and delivery; no exclusive claim over public facts',
      paymentEvidence: 'the original durable x402 actor records settlement independently of this delivered data',
    });
  }
  return Object.freeze({ admit, execute });
}

export async function createInternationalPaidReadActor({
  lotStore, sellerOffer, priceTerms, append, recoveredRecords,
  basePath = '/x402/international-data', now, maxAgeMs,
  facilitatorUrl, facilitatorClient, actorFactory, paymentBoundaryFactory,
  paymentIdentity, settlementProjection,
  sourceDeclarations = INTERNATIONAL_SOURCES,
} = {}) {
  if (!sellerOffer || typeof sellerOffer !== 'object' || Array.isArray(sellerOffer)) {
    throw new TypeError('source-qualified original sellerOffer is required');
  }
  if (typeof append !== 'function' || !(recoveredRecords?.intents instanceof Map) ||
      !(recoveredRecords?.terminals instanceof Map)) {
    throw new TypeError('the original durable append and recovered invocation Maps are required');
  }
  const handlers = createInternationalPaidReadHandlers({ lotStore, now, maxAgeMs, sourceDeclarations });
  const makeActor = actorFactory ?? (await import('./paid-data-endpoint.mjs')).createPaidDataEndpointActor;
  const makePaymentBoundary = paymentBoundaryFactory ??
    (await import('@red-cup-engineering/x402-services-section/server')).createExactEvmPaymentBoundary;
  if (typeof makeActor !== 'function' || typeof makePaymentBoundary !== 'function') {
    throw new TypeError('original x402 paid-data actor and payment boundary factories are required');
  }
  const offer = {
    ...sellerOffer,
    kind: 'QualifiedWorldBankIndicatorPaidRead',
    requestSchema: { type: 'object', additionalProperties: false, required: ['lotDigest'],
      properties: { lotDigest: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' } } },
    consideration: 'derived data processing and verified delivery, not ownership or exclusive rights in public data',
    rightsNotice: 'World Bank CC BY 4.0 indicator license is checked per approved SKU; source and origin attribution travels with every lot',
  };
  return makeActor({
    operation: 'read-data', basePath, offer, priceTerms,
    admit: handlers.admit, execute: handlers.execute,
    append, recoveredRecords, paymentBoundaryFactory: makePaymentBoundary,
    ...(facilitatorUrl === undefined ? {} : { facilitatorUrl }),
    ...(facilitatorClient === undefined ? {} : { facilitatorClient }),
    ...(paymentIdentity === undefined ? {} : { paymentIdentity }),
    ...(settlementProjection === undefined ? {} : { settlementProjection }),
  });
}
