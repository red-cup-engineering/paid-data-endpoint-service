
import { x402SettlementEvidence } from "@red-cup-engineering/x402-services-section/x402-settlement-evidence";
import { createPricedCapabilityBoundary } from "@red-cup-engineering/x402-services-section/priced-capability-boundary";
import { sha256Digest, sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

const OPERATIONS = new Set(["read-data", "write-data", "trade-data-rights"]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function decodePaymentHeader(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 65_536) {
    throw new TypeError("one bounded x402 payment-signature header is required");
  }
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch (error) {
    throw new TypeError("payment-signature is not an x402 JSON payload", { cause: error });
  }
}

export function x402InvocationIdentity(value) {
  const payload = typeof value === "string" ? decodePaymentHeader(value) : value;
  if (payload?.x402Version !== 2) throw new TypeError("one x402 v2 payment payload is required");
  return sha256Digest(canonical(payload));
}

/**
 * The kernel's settlement evidence, identified with this actor's legacy
 * `sha256:` invocation identity so durable records recorded before the
 * kernel owned the projection stay recoverable.
 */
export function exactSettlementEvidence(context) {
  return x402SettlementEvidence(context, { identify: x402InvocationIdentity });
}

function legacyPublicReference({ invocation }) {
  if (typeof invocation !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(invocation)) {
    throw new TypeError("paid-data public references require one SHA-256 invocation");
  }
  return invocation.slice("sha256:".length);
}

function projectPaidDataPublicResult({ phase, status, invocation, terminal, result }) {
  if (phase === "invocation") {
    return { ok: true, invocation, status, result };
  }
  if (status === "pending") {
    return { ok: true, invocation, status: "pending", terminal: null };
  }
  return { ok: true, invocation, status: "terminal", terminal };
}

/**
 * Form exactly one autonomous priced endpoint actor. A deployment chooses one
 * operation, one price, one durable append capability, and one endpoint effect.
 * Read, write, and rights-trade actors therefore remain separately addressable
 * and independently priced while sharing the same x402 causal law.
 */
export function createPaidDataEndpointActor({
  operation,
  basePath,
  offer,
  priceTerms,
  admit,
  append,
  execute,
  recoveredRecords,
  facilitatorUrl,
  facilitatorClient,
  paymentBoundaryFactory,
  paymentIdentity = x402InvocationIdentity,
  settlementProjection = exactSettlementEvidence,
} = {}) {
  if (!OPERATIONS.has(operation)) {
    throw new TypeError("operation must be read-data, write-data, or trade-data-rights");
  }
  if (typeof basePath !== "string" || !/^\/\S+$/u.test(basePath)) {
    throw new TypeError("basePath must be one absolute HTTP path");
  }
  return createPricedCapabilityBoundary({
    operation,
    resourcePath: `${basePath}/invoke`,
    offerPath: `${basePath}/offer`,
    resultPath: `${basePath}/result`,
    offer,
    priceTerms,
    admit,
    append,
    execute,
    recoveredRecords,
    facilitatorUrl,
    facilitatorClient,
    paymentBoundaryFactory,
    paymentIdentity,
    settlementProjection,
    createPublicReference: legacyPublicReference,
    recoverPublicReference: ({ invocation, intent }) => intent.publicReference ?? legacyPublicReference({ invocation }),
    projectPublicResult: projectPaidDataPublicResult,
    createIntent: ({ invocation, request, publicReference }) => ({
      type: "PaidDataEndpointIntent",
      invocation,
      publicReference,
      operation,
      request,
    }),
    createReceipt: ({ invocation, settlement, result }) => ({
      type: "PaidDataEndpointReceipt",
      invocation,
      operation,
      settlement,
      result,
    }),
    createRefusal: ({ invocation, settlement, error }) => ({
      type: "PaidDataEndpointRefusal",
      invocation,
      operation,
      settlement,
      refusal: {
        type: "PaidDataEndpointExecutionRefusal",
        reason: error instanceof Error ? error.message : String(error),
      },
    }),
  });
}
