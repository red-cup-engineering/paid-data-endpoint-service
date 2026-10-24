import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createContentAddressedDirectory } from "./content-addressed-directory.mjs";
import {
  federalRegisterSearchURL, federalRegisterInventoryLot,
  verifyFederalRegisterInventoryLot, deriveFederalRegisterInventory,
} from "./federal-register-inventory.mjs";

const MAX_BYTES = 4 * 1024 * 1024;
const sha256 = bytes => "sha256:" + createHash("sha256").update(bytes).digest("hex");
const str = (s, limit=1024) => typeof s === "string" && s.length <= limit ? s : null;
function requireTimestamp(at) {
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at)) ||
      !/^\d{4}-\d{2}-\d{2}T/u.test(at)) throw new TypeError("source observation requires an actual timestamp");
  return new Date(at).toISOString();
}

// Read the actual original HTTP payload in bounded chunks, retaining exact
// bytes rather than trusting a later reserialization of parsed JSON.
async function boundedResponseBytes(response, limit = MAX_BYTES) {
  if (!Number.isSafeInteger(limit) || limit < 1024 || limit > 16 * 1024 * 1024) {
    throw new RangeError("source byte budget must be between 1KiB and 16MiB");
  }
  const reported = response.headers?.get?.("content-length");
  if (reported !== null && reported !== undefined &&
      (!/^\d+$/u.test(reported) || Number(reported) > limit)) throw new RangeError("source Content-Length exceeds byte budget");
  if (!response.body?.getReader) {
    if (typeof response.arrayBuffer !== "function") throw new TypeError("HTTP response has no readable original bytes");
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > limit) throw new RangeError("HTTP response exceeded byte budget");
    return body;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new TypeError("HTTP source returned non-byte stream chunk");
      total += value.byteLength;
      if (total > limit) throw new RangeError("HTTP source exceeded exact byte budget");
      chunks.push(Buffer.from(value));
    }
  } catch(error) {
    await reader.cancel().catch(()=>{});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function originalFederalRegisterWitnessStore({root}={}) {
  return createContentAddressedDirectory({root});
}

// The original Federal Register provider still owns URL/search semantics and
// canonical record normalization. This upgrades a genuine acquisition to
// byte-addressed evidence in the already-existing immutable custody service.
export async function acquireWitnessedFederalRegisterInventory({
  search, root, byteStore, fetchImpl = fetch,
  observedAt = new Date().toISOString(), maxBytes = MAX_BYTES,
}={}) {
  const store = byteStore ?? originalFederalRegisterWitnessStore({root});
  if (typeof store.write !== "function" || typeof store.read !== "function") {
    throw new TypeError("source acquisition requires durable original byte custody");
  }
  const sourceUrl = federalRegisterSearchURL(search);
  const at = requireTimestamp(observedAt);
  const response = await fetchImpl(sourceUrl, {
    method:"GET", redirect:"error", headers:{accept:"application/json"},
  });
  if (!response?.ok || response.status !== 200) {
    throw new Error("original Federal Register API did not deliver HTTP 200");
  }
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) throw new TypeError("official source did not return JSON");
  const finalUrl = response.url || sourceUrl;
  if (new URL(finalUrl).origin !== "https://www.federalregister.gov" ||
      new URL(finalUrl).pathname !== "/api/v1/documents.json") {
    throw new Error("official source response changed origin or endpoint");
  }
  const bytes = await boundedResponseBytes(response, maxBytes);
  const originalDigest = sha256(bytes);
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch { throw new TypeError("official source returned invalid JSON"); }
  const lot = federalRegisterInventoryLot({response:parsed,sourceUrl,observedAt:at});
  const receipt = await store.write({body:bytes,mediaType:"application/json"});
  if (receipt.sha256 !== originalDigest.slice(7) || receipt.byteLength !== bytes.byteLength) {
    throw new Error("immutable source custody did not receive exact original HTTP bytes");
  }
  const acquisition = {
    requestedUrl: sourceUrl,
    finalUrl,
    observedAt: at,
    responseDigest: originalDigest,
    responseBytes: bytes.byteLength,
    httpStatus: 200,
    mediaType: "application/json",
    sourceContentType: str(contentType,256),
    etag: str(response.headers?.get?.("etag")),
    lastModified: str(response.headers?.get?.("last-modified")),
    sourceDate: str(response.headers?.get?.("date")),
    witnessLevel: "original HTTP response bytes custodied and reproducible; not official-source signature",
  };
  return Object.freeze({
    ...lot,
    source: Object.freeze({...lot.source,acquisition:Object.freeze(acquisition)}),
  });
}

// Resale/Newsroom acceptance must re-read the original exact HTTP bytes and
// verify that the normalized rows ACTUALLY follow from that response.
// Publisher statements and their current rights remain independently reviewable.
export async function verifyWitnessedFederalRegisterInventory({lot, root, byteStore}={}) {
  const store = byteStore ?? originalFederalRegisterWitnessStore({root});
  verifyFederalRegisterInventoryLot(lot);
  const witness = lot?.source?.acquisition;
  if (!witness || witness.httpStatus !== 200 || witness.mediaType !== "application/json" ||
      witness.observedAt !== lot.observedAt || witness.requestedUrl !== lot.source.apiUrl ||
      typeof witness.responseDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(witness.responseDigest) ||
      !Number.isSafeInteger(witness.responseBytes) || witness.responseBytes < 1 || witness.responseBytes > 16 * 1024 * 1024) {
    throw new TypeError("original raw HTTP witness required for resale source receiving");
  }
  const saved = await store.read({sha256:witness.responseDigest.slice(7)});
  const bytes = Buffer.from(saved.body);
  if (bytes.byteLength !== witness.responseBytes || sha256(bytes) !== witness.responseDigest) {
    throw new Error("original HTTP source bytes were not independently reverified");
  }
  const original = federalRegisterInventoryLot({
    response:JSON.parse(bytes.toString("utf8")),
    sourceUrl:witness.requestedUrl,
    observedAt:witness.observedAt,
  });
  const projected = lot.kind === "derived-federal-register-documents"
    ? deriveFederalRegisterInventory(original, {
        filters:lot.transformation.filters,
        actorId:lot.transformation.actorId,
        service:lot.transformation.service,
      })
    : original;
  if ((lot.kind === "derived-federal-register-documents" && lot.parentDigest !== original.digest) ||
      projected.digest !== lot.digest || !isDeepStrictEqual(projected.records, lot.records) ||
      original.source.totalResultsReported !== lot.source.totalResultsReported ||
      original.source.pageComplete !== lot.source.pageComplete) {
    throw new Error("source inventory does not follow from custodied official HTTP bytes");
  }
  return Object.freeze({
    verified:true,normalizedDigest:projected.digest,
    parentDigest:original.digest,
    originalResponseDigest:witness.responseDigest,recordCount:projected.recordCount,
    rights:original.source.rights,
  });
}
