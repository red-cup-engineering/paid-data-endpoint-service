/**
 * First consumer of the general qualified short-text sampler.
 * The live seller invokes this through the existing x402 market compute
 * binding; this module creates no payment route, merchant, ledger, or wallet.
 */
import originalPack from "../data/fortunes/561-original-october-2026.json" with { type: "json" };
import {
  qualifyShortTextPack, createQualifiedShortTextShelf,
} from "./qualified-short-text-inventory.mjs";

const qualifiedPack = qualifyShortTextPack(originalPack);
const shelf = createQualifiedShortTextShelf({ packs: [qualifiedPack] });
const sourceRequest = (query = {}) => {
  if (query === null || typeof query !== "object" || Array.isArray(query) ||
      Object.keys(query).some(key => key !== "tag"))
    throw new TypeError("fortune request permits only an optional tag filter");
  return {
    packId: qualifiedPack.packId,
    edition: qualifiedPack.edition,
    packDigest: qualifiedPack.digest,
    ...(Object.hasOwn(query, "tag") ? { tag: query.tag } : {}),
  };
};

/** Cheap, side-effect-free pre-402 request admission by the original seller. */
export async function admitRandomFortuneQuery(query = {}) {
  const admitted = await shelf.admit(sourceRequest(query), "before-payment");
  return Object.freeze({
    admitted: true, packId: qualifiedPack.packId,
    edition: qualifiedPack.edition,
    packDigest: qualifiedPack.digest,
    eligibleCount: admitted.eligibleCount,
    tag: admitted.tag,
  });
}

/** One bounded market compute invocation after ordinary x402 settlement. */
export async function drawRandomFortune(query = {}) {
  const sample = await shelf.draw(sourceRequest(query));
  return Object.freeze({
    ...sample,
    interpretation: "A playful aphorism, not a prediction or factual oracle.",
    commercialScope: "One selection, curation and delivery operation; not exclusive rights to the underlying words.",
    paymentReceipt: null, // The original x402 merchant owns payment evidence.
  });
}

/** A free discoverable source snapshot, not a payment or sale claim. */
export function fortuneProductManifest() {
  return Object.freeze({
    product: "random-fortune",
    sourceKind: qualifiedPack.sourceKind,
    edition: qualifiedPack.edition,
    packDigest: qualifiedPack.digest,
    entryCount: qualifiedPack.entryCount,
    tags: [...new Set(qualifiedPack.entries.flatMap(entry => entry.tags))].sort(),
    source: qualifiedPack.source.name,
    provenance: qualifiedPack.source.provenance,
    rightsBasis: qualifiedPack.rights.basis,
    paymentEvidence: null, // Only the original market can attest to settlement.
    deploymentEvidence: null, // Source inclusion cannot attest to runtime.
  });
}
