import { createHash } from "node:crypto";
import { createContentAddressedDirectory } from "./content-addressed-directory.mjs";

// Original Newswire source/edition identity is retained in a release of only
// independently approved PUBLIC items. All internal Newsroom algebra is omitted.
// Seller authorization, per-source rights and actual x402 settlement stay with
// their existing owners. This is immutable release custody, not a new merchant.
const SHA = /^sha256:[a-f0-9]{64}$/u;
const MAX_ITEMS = 10_000;
const MAX_BYTES = 8 * 1024 * 1024;
const sha256 = body => "sha256:" + createHash("sha256").update(body).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function url(value, label) {
  let u;
  try { u = new URL(value); } catch { throw new TypeError(label + " requires an HTTPS URL"); }
  if (u.protocol !== "https:" || u.username || u.password) throw new TypeError(label + " requires uncredentialed HTTPS");
  return u.href;
}
function instant(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new TypeError(label + " requires an RFC3339 instant");
  return new Date(value).toISOString();
}
function boundedText(value, label, max = 8192) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(label + " requires bounded text");
  return value;
}

// The public query view is source-identical whether read by a Filum consumer
// or the existing seller; it includes real source provenance, not a "trust" label.
// Every item must already be Newsroom-released: this boundary refuses drafts.
export function publicNewswireReleaseView(wire) {
  if (!object(wire) || !object(wire.masthead) || !Array.isArray(wire.public) ||
      wire.public.length === 0 || wire.public.length > MAX_ITEMS) {
    throw new TypeError("a nonempty original Newsroom-released Newswire is required");
  }
  const wireUri = url(wire.masthead.siteUrl, "publisher wire");
  const seen = new Set();
  const pub = wire.public.map((item, i) => {
    const label = "release item " + i;
    if (!object(item) || item.isPublic !== true || !object(item.provenance)) {
      throw new TypeError(label + " is not accepted source-qualified publication");
    }
    const subject = boundedText(item.subject, label + ".subject", 1024);
    if (seen.has(subject)) throw new TypeError("original release repeats a canonical subject");
    seen.add(subject);
    const provenance = structuredClone(item.provenance);
    if (!Array.isArray(provenance.sources) || provenance.sources.length < 1 ||
        provenance.sources.length > 64 || typeof provenance.editionUri !== "string" ||
        typeof provenance.publicationReceiptUri !== "string") {
      throw new TypeError(label + " lacks immutable source edition or editorial receipt");
    }
    for (const source of provenance.sources) {
      if (!object(source) || !SHA.test(source.digest) || typeof source.observedAt !== "string") {
        throw new TypeError(label + " lacks a source digest/observation");
      }
      url(source.uri, label + " source URI");
      url(source.licenseUri, label + " license evidence");
      url(source.rightsEvidenceUri, label + " rights evidence");
      instant(source.observedAt, label + " observedAt");
    }
    if (!Array.isArray(item.keywords) || item.keywords.length > 128 ||
        item.keywords.some(k => typeof k !== "string" || !k || k.length > 2048)) {
      throw new TypeError(label + " has unbounded topics");
    }
    return Object.freeze({
      subject,
      url: url(item.url, label + " public page"),
      headline: boundedText(item.headline, label + " headline"),
      summary: typeof item.summary === "string" ? item.summary.slice(0, 30000) : "",
      keywords: [...new Set(item.keywords)],
      isPublic: true,
      kind: item.kind === "data-bulletin" ? "data-bulletin" : "news-article",
      ...(item.published === undefined ? {} : {published: instant(item.published, label + " published")}),
      ...(item.updated === undefined ? {} : {updated: instant(item.updated, label + " updated")}),
      provenance,
    });
  });
  pub.sort((a, b) => a.subject.localeCompare(b.subject));
  return Object.freeze({wireUri, public: Object.freeze(pub)});
}
const serialize = snapshot => Buffer.from(JSON.stringify(snapshot), "utf8");

export function verifyNewswireReleaseSnapshot({snapshot, digest}) {
  if (!SHA.test(digest ?? "") || !object(snapshot) || snapshot.digest !== digest) return false;
  try {
    if (Object.keys(snapshot).sort().join("|") !== "digest|public|verifiedAt|wireUri") return false;
    const body = serialize({wireUri:snapshot.wireUri,verifiedAt:snapshot.verifiedAt,public:snapshot.public});
    if (body.byteLength > MAX_BYTES || sha256(body) !== digest) return false;
    instant(snapshot.verifiedAt, "release verifiedAt");
    const admitted = publicNewswireReleaseView({
      masthead:{siteUrl:snapshot.wireUri},public:snapshot.public,
    });
    return JSON.stringify(admitted.public) === JSON.stringify(snapshot.public);
  } catch { return false; }
}

// Reuse existing content-addressed byte directory; no parallel catalog/ledger.
// An independent original Newsroom verifier MUST approve the release before
// publication to custody. A caller saying isPublic=true is insufficient.
export function createNewswireReleaseStore({root, byteStore, verifyRelease, now=()=>new Date().toISOString()}={}) {
  const store = byteStore ?? createContentAddressedDirectory({root});
  if (typeof store.write !== "function" || typeof store.read !== "function") {
    throw new TypeError("original content-addressed byte store must implement write/read");
  }
  if (typeof verifyRelease !== "function") throw new TypeError("original Newsroom release verifier is required");
  if (typeof now !== "function") throw new TypeError("observed release clock is required");
  async function publish({wire}={}) {
    if (await verifyRelease({wire}) !== true) throw new Error("original Newsroom did not independently receive release");
    const view = publicNewswireReleaseView(wire);
    const payload = {wireUri:view.wireUri,verifiedAt:instant(now(),"verifiedAt"),public:view.public};
    const bytes = serialize(payload);
    if (bytes.byteLength > MAX_BYTES) throw new RangeError("Newswire release exceeds verified byte budget");
    const digest = sha256(bytes);
    const saved = await store.write({body:bytes,mediaType:"application/json"});
    if (saved.sha256 !== digest.slice(7) || saved.byteLength !== bytes.byteLength) {
      throw new Error("original immutable custody refused exact source bytes");
    }
    return Object.freeze({...payload,digest});
  }
  async function read({digest}={}) {
    if (!SHA.test(digest ?? "")) throw new TypeError("exact Newswire snapshot digest required");
    const held = await store.read({sha256:digest.slice(7)});
    const bytes = Buffer.from(held.body);
    if (bytes.byteLength > MAX_BYTES || sha256(bytes) !== digest) throw new Error("changed immutable Newswire release bytes");
    const snapshot = {...JSON.parse(bytes.toString("utf8")),digest};
    if (!verifyNewswireReleaseSnapshot({snapshot,digest})) throw new Error("malformed or substituted Newswire release snapshot");
    return Object.freeze(snapshot);
  }
  return Object.freeze({publish,read,verifySnapshot:verifyNewswireReleaseSnapshot});
}
