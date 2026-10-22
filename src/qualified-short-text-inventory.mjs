/**
 * Qualified, content-addressed short-text merchandise, independent of payment.
 *
 * A Unix fortune database's availability or software license is NOT evidence
 * that its independently authored quotations can be sold. Third-party entries
 * need item-level commercial-delivery clearance, not a blanket repo badge.
 * The existing market's x402 payment/compute binder owns prices and receipts.
 */
import { createHash, randomBytes } from "node:crypto";

const TOKEN = /^[a-z0-9][a-z0-9-]{1,63}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_ENTRY_BYTES = 2048;
const MAX_ENTRIES = 10000;
const UINT32_SPACE = 0x100000000;

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(label + " must be an object");
  }
  return value;
}
function token(value, label) {
  if (typeof value !== "string" || !TOKEN.test(value)) {
    throw new TypeError(label + " must be one lowercase slug");
  }
  return value;
}
function boundedText(value, label, max = 500) {
  if (typeof value !== "string" || value.trim() !== value ||
      !value || Buffer.byteLength(value, "utf8") > max ||
      value.includes("\u0000")) {
    throw new TypeError(label + " must be a nonempty bounded UTF-8 string");
  }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k =>
      JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
export function qualifiedTextDigest(value) {
  return "sha256:" + createHash("sha256").update(canonical(value)).digest("hex");
}

/**
 * Parse the classic fortune/strfile input: percent signs on their own lines
 * separate entries; .dat offset files are derived indexes, never rights proof.
 * Parsing does not license or publish a single entry.
 */
export function parseUnixFortuneData(source) {
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > MAX_INPUT_BYTES ||
      source.includes("\u0000")) throw new TypeError("fortune text must be bounded UTF-8");
  const segments = [];
  let lines = [];
  const flush = () => {
    const item = lines.join("\n").trim();
    if (!item) throw new TypeError("empty or whitespace-only fortune");
    if (Buffer.byteLength(item, "utf8") > MAX_ENTRY_BYTES)
      throw new RangeError("fortune exceeds 2048 UTF-8 bytes");
    segments.push(item);
    if (segments.length > MAX_ENTRIES) throw new RangeError("too many fortunes");
    lines = [];
  };
  const normalized = source.replace(/\r\n/gu, "\n");
  for (const line of normalized.split("\n")) {
    if (line === "%") flush();
    else lines.push(line);
  }
  if (lines.join("").trim()) flush();
  if (segments.length === 0) throw new TypeError("no fortunes found");
  return segments;
}

function clearedRights(sourceKind, rights, entries) {
  const r = requireObject(rights, "rights");
  if (r.commercialDelivery !== true || r.redistribution !== true)
    throw new Error("corpus has no affirmative commercial delivery and redistribution clearance");
  if (sourceKind === "seller-original") {
    if (r.basis !== "seller-originated-text" || r.sellerAuthorized !== true)
      throw new Error("original text requires the seller's express commercial authorization");
  } else {
    if (r.basis !== "item-by-item-license-review" ||
        typeof r.reviewedBy !== "string" || !r.reviewedBy ||
        !/^https:\/\//u.test(r.sourceLicenseEvidence ?? "") ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(r.reviewedOn ?? "")) {
      throw new Error("imported corpus needs a dated, identified, evidenced rights review");
    }
    if (entries.some(e => e.rights?.commercialDelivery !== true ||
        e.rights?.redistribution !== true ||
        !/^https:\/\//u.test(e.rights?.evidenceUrl ?? ""))) {
      throw new Error("every imported fortune needs individual commercial-delivery rights evidence");
    }
  }
  if (r.expiresOn !== undefined &&
      (!/^\d{4}-\d{2}-\d{2}$/u.test(r.expiresOn) || r.expiresOn < new Date().toISOString().slice(0, 10)))
    throw new Error("corpus rights expired or have an invalid expiry");
  return structuredClone(r);
}

/** Form an immutable, exact-edition lot; omit sales claims entirely. */
export function qualifyShortTextPack({ packId, edition, sourceKind, source, rights, entries } = {}) {
  token(packId, "packId");
  token(edition, "edition");
  if (!["seller-original", "third-party"].includes(sourceKind))
    throw new TypeError("sourceKind must distinguish seller-original from third-party");
  const origin = requireObject(source, "source");
  boundedText(origin.name, "source.name", 200);
  if (sourceKind === "third-party" &&
      (typeof origin.url !== "string" || !/^https:\/\//u.test(origin.url)))
    throw new TypeError("third-party source needs a source URL");
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > MAX_ENTRIES)
    throw new TypeError("pack needs 2–10000 entries");
  const items = entries.map((raw, i) => {
    const entry = requireObject(raw, "entry");
    token(entry.id, "entry.id");
    const value = boundedText(entry.text, "entry.text", MAX_ENTRY_BYTES);
    if (value === "%") throw new TypeError("separator is not an entry");
    if (!Array.isArray(entry.tags) || entry.tags.length > 12)
      throw new TypeError("entries require at most 12 tags");
    const tags = [...new Set(entry.tags.map(t => token(t, "entry tag")))].sort();
    if (sourceKind === "third-party" && !entry.rights)
      throw new Error("imported entry is missing rights evidence");
    return {
      id: entry.id,
      text: value,
      tags,
      ...(sourceKind === "third-party" ? {
        attribution: boundedText(entry.attribution, "entry.attribution", 300),
        rights: structuredClone(entry.rights),
      } : {}),
    };
  });
  if (new Set(items.map(e => e.id)).size !== items.length ||
      new Set(items.map(e => e.text)).size !== items.length)
    throw new Error("duplicate fortune ID or text");
  const authorizedRights = clearedRights(sourceKind, rights, items);
  const body = {
    schemaVersion: "561.qualified-short-text-pack.v1",
    packId, edition, sourceKind,
    source: structuredClone(origin),
    rights: authorizedRights,
    entryCount: items.length,
    entries: items,
  };
  const digest = qualifiedTextDigest(body);
  const lot = { ...body, digest };
  return deepFreeze(lot);
}
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
export function verifyQualifiedShortTextPack(lot) {
  const p = requireObject(lot, "qualified pack");
  if (typeof p.digest !== "string" || !SHA.test(p.digest))
    throw new Error("qualified pack is missing SHA-256 identity");
  const { digest, ...rest } = p;
  const rebuilt = qualifyShortTextPack(rest);
  if (rebuilt.digest !== digest || p.schemaVersion !== rebuilt.schemaVersion ||
      p.entryCount !== rebuilt.entryCount || canonical(rest) !== canonical({
        schemaVersion: rebuilt.schemaVersion, packId: rebuilt.packId,
        edition: rebuilt.edition, sourceKind: rebuilt.sourceKind,
        source: rebuilt.source, rights: rebuilt.rights,
        entryCount: rebuilt.entryCount, entries: rebuilt.entries,
      })) throw new Error("qualified pack identity or content changed");
  return true;
}
export function admitShortTextSelection(query = {}, lot) {
  verifyQualifiedShortTextPack(lot);
  const q = requireObject(query, "selection query");
  if (Object.keys(q).some(k => k !== "tag")) throw new TypeError("only a tag filter is allowed");
  const tag = q.tag === undefined ? null : token(q.tag, "tag");
  const eligible = lot.entries.filter(e => tag === null || e.tags.includes(tag));
  if (eligible.length === 0) throw new RangeError("no qualified entries for requested tag");
  return Object.freeze({ tag, eligible });
}

/**
 * Rejection sampling avoids modulo bias. Caller supplies no entropy.
 * Injecting the word source is only for testing; production uses CSPRNG.
 */
export function uniformRandomIndex(count, drawWord = () => randomBytes(4).readUInt32BE(0)) {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_ENTRIES)
    throw new RangeError("selection count out of bounds");
  if (typeof drawWord !== "function") throw new TypeError("random source must be a function");
  const ceiling = UINT32_SPACE - (UINT32_SPACE % count);
  for (let attempts = 0; attempts < 128; attempts += 1) {
    const value = drawWord();
    if (!Number.isInteger(value) || value < 0 || value >= UINT32_SPACE)
      throw new TypeError("random source must return uint32 words");
    if (value < ceiling) return value % count;
  }
  throw new Error("random source failed to supply unbiased sample");
}
export function selectQualifiedShortText(lot, query = {}, { drawWord } = {}) {
  const admitted = admitShortTextSelection(query, lot);
  const selected = admitted.eligible[uniformRandomIndex(admitted.eligible.length, drawWord)];
  return Object.freeze({
    kind: "561.qualified-short-text-sample.v1",
    packId: lot.packId, edition: lot.edition, packDigest: lot.digest,
    entryId: selected.id, entryDigest: qualifiedTextDigest(selected),
    text: selected.text, tags: [...selected.tags],
    sourceName: lot.source.name, sourceKind: lot.sourceKind,
    attribution: selected.attribution ?? "Original 561 Group service corpus",
    rightsBasis: lot.rights.basis,
    selectionMethod: "uniform-csprng-rejection-sampling",
  });
}
