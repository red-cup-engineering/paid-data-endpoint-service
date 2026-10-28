import { createHash } from "node:crypto";
import { qualifyAgriculturalSource } from "./agricultural-source-admission.mjs";

const NASS = "usda-nass-quickstats";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_COUNT_BYTES = 4096;
const MAX_ROWS_PER_ACQUISITION = 5000;
const SHA = /^[0-9a-f]{64}$/u;
const FIELDS = ["year", "state_alpha", "commodity_desc", "statisticcat_desc", "agg_level_desc"];
const VALUE = /^-?(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/u;

function digest(body) {
  return createHash("sha256").update(body).digest("hex");
}
function time(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/u.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new TypeError("observedAt must have an explicit timezone");
  return new Date(value).toISOString();
}
function matchText(value, regex, name) {
  if (typeof value !== "string" || !regex.test(value))
    throw new TypeError(name + " must be a bounded original NASS query term");
  return value;
}

/** Exactly one small, independently countable published-statistics query. */
export function admitNassAgriculturalQuery(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((field) => !["year","stateAlpha","commodity","statistic"].includes(field)))
    throw new TypeError("NASS requires only year, stateAlpha, commodity, statistic");
  const year = String(value.year);
  if (!/^(?:18|19|20|21)\d{2}$/u.test(year)) throw new TypeError("NASS year must be YYYY");
  const state = matchText(value.stateAlpha, /^[A-Z]{2}$/u, "stateAlpha");
  const commodity = matchText(value.commodity, /^[A-Z][A-Z0-9 ,/()&-]{1,79}$/u, "commodity");
  const statistic = matchText(value.statistic, /^[A-Z][A-Z0-9 ,/()&-]{1,79}$/u, "statistic");
  return Object.freeze({
    year, state_alpha: state, commodity_desc: commodity,
    statisticcat_desc: statistic, agg_level_desc: "STATE"
  });
}

/** Credential-free link to original search semantics: not itself an executable API request. */
export function nassQueryDescription(query) {
  const params = new URLSearchParams({ ...admitNassAgriculturalQuery(query), format: "JSON" });
  return "https://quickstats.nass.usda.gov/api/api_GET?" + params.toString();
}

function authenticatedUrl(endpoint, operation, filter, apiKey) {
  const url = new URL(operation, endpoint);
  for (const [key, value] of Object.entries(filter)) url.searchParams.set(key, value);
  url.searchParams.set("key", apiKey);
  if (operation === "api_GET") url.searchParams.set("format", "JSON");
  return url;
}
async function httpBytes({ fetchImpl, url, maxBytes, kind }) {
  let response;
  try { response = await fetchImpl(url.toString(), { method: "GET", redirect: "error" }); }
  catch { throw new Error("NASS " + kind + " network request failed (credentials redacted)"); }
  if (response?.ok !== true) throw new Error("NASS " + kind + " returned non-success status (credentials redacted)");
  if (!/^application\/json\b/iu.test(response.headers?.get("content-type") ?? ""))
    throw new TypeError("NASS " + kind + " did not return JSON");
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes)
    throw new RangeError("NASS " + kind + " exceeds acquisition byte budget");
  if (!response.body || typeof response.body.getReader !== "function")
    throw new TypeError("NASS " + kind + " requires a streamed entity body");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new TypeError("source bytes are not Uint8Array");
      size += value.byteLength;
      if (size > maxBytes) throw new RangeError("NASS " + kind + " exceeds acquisition byte budget");
      chunks.push(Buffer.from(value));
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
  if (size === 0) throw new Error("NASS " + kind + " returned no bytes");
  return Buffer.concat(chunks, size);
}
function parsedJson(bytes, kind) {
  let object;
  try { object = JSON.parse(bytes.toString("utf8")); }
  catch { throw new TypeError("NASS " + kind + " returned invalid JSON"); }
  return object;
}
function validOriginalRow(row, query) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) throw new TypeError("NASS row is not a record");
  if (String(row.year) !== query.year || row.state_alpha !== query.state_alpha ||
      row.commodity_desc !== query.commodity_desc || row.statisticcat_desc !== query.statisticcat_desc ||
      row.agg_level_desc !== query.agg_level_desc) throw new Error("NASS returned a row outside source query");
  if (typeof row.unit_desc !== "string" || !row.unit_desc.trim() || !Object.hasOwn(row, "Value"))
    throw new TypeError("NASS row lacks original units or Value");
  if (!(typeof row.Value === "string" || typeof row.Value === "number" || row.Value === null))
    throw new TypeError("NASS original Value is not a scalar");
}
function observedValue(raw) {
  if (raw === null) return Object.freeze({value:null,meaning:"publisher-null"});
  const s = String(raw).trim();
  if (!VALUE.test(s)) return Object.freeze({value:null,meaning:"publisher-suppression-or-nonnumeric"});
  const value = Number(s.replaceAll(",", ""));
  if (!Number.isFinite(value)) throw new TypeError("NASS numeric source value is non-finite");
  return Object.freeze({value,meaning:"numeric"});
}
async function retainVerified({ sourceStore, body }) {
  const stored = await sourceStore.write({body,mediaType:"application/json"});
  if (!SHA.test(stored?.sha256 ?? "") || stored.sha256 !== digest(body) || stored.byteLength !== body.byteLength)
    throw new Error("original content-addressed source writer returned inconsistent identity");
  const read = await sourceStore.read({sha256:stored.sha256});
  if (!(read?.body instanceof Uint8Array) || digest(read.body) !== stored.sha256 ||
      !Buffer.from(read.body).equals(body))
    throw new Error("original source bytes failed independent readback");
  return Object.freeze({sha256:stored.sha256,byteLength:stored.byteLength});
}

/**
 * Acquire actual published NASS data through caller-provided network and the
 * ORIGINAL content-addressed sourceStore (write/read). Both count and data
 * responses are durably witnessed; no new publisher, ledger or payment actor.
 * A returned edition is an unreleased NEWSROOM CANDIDATE, never a paid lot.
 */
export async function acquireNassAgriculturalEdition({
  apiKey, query, sourceStore, fetchImpl, asOf = new Date().toISOString().slice(0,10),
  observedAt, maxRows = 250
} = {}) {
  if (typeof apiKey !== "string" || apiKey.length < 8 || apiKey.length > 512 ||
      /\s/u.test(apiKey)) throw new TypeError("an original caller-supplied NASS API key is required");
  if (typeof fetchImpl !== "function") throw new TypeError("caller-supplied authorized fetch is required");
  if (typeof sourceStore?.write !== "function" || typeof sourceStore?.read !== "function")
    throw new TypeError("the original content-addressed source store with write/read is required");
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > MAX_ROWS_PER_ACQUISITION)
    throw new RangeError("maxRows exceeds authorized small-source budget");
  const source = qualifyAgriculturalSource({id:NASS,asOf,purpose:"public-source-read"});
  const q = admitNassAgriculturalQuery(query);
  const countBody = await httpBytes({
    fetchImpl, url:authenticatedUrl(source.access.endpoint, "get_counts", q, apiKey),
    maxBytes:MAX_COUNT_BYTES,kind:"count"
  });
  // Record even a later-refused original provider response; custody is not editorial admission.
  const countSource = await retainVerified({sourceStore,body:countBody});
  const countValue = parsedJson(countBody,"count")?.count;
  if (!/^(?:0|[1-9]\d*)$/u.test(String(countValue)) ||
      !Number.isSafeInteger(Number(countValue)))
    throw new TypeError("NASS did not provide an exact safe record count");
  const count = Number(countValue);
  if (count < 1) throw new Error("NASS query has no published source observations");
  if (count > maxRows || count > source.access.maxRecordsPerQuery)
    throw new RangeError("NASS count exceeds approved per-request rows; narrow the filters");
  const body = await httpBytes({
    fetchImpl,url:authenticatedUrl(source.access.endpoint, "api_GET", q, apiKey),
    maxBytes:MAX_RESPONSE_BYTES,kind:"data"
  });
  // Preserve the acquired source edition even when downstream normalization refuses it.
  const dataSource = await retainVerified({sourceStore,body});
  const response = parsedJson(body,"data");
  if (!Array.isArray(response?.data) || response.data.length !== count)
    throw new Error("NASS response was incomplete or changed after count");
  const seen = new Set();
  const observations = response.data.map((row) => {
    validOriginalRow(row,q);
    const rowDigest = digest(Buffer.from(JSON.stringify(row)));
    if (seen.has(rowDigest)) throw new Error("duplicate identical original NASS source row");
    seen.add(rowDigest);
    return Object.freeze({
      originalRecord: structuredClone(row),
      editionRowDigest: "sha256:" + rowDigest,
      originalValue: row.Value,
      originalUnit: row.unit_desc,
      interpreted: observedValue(row.Value)
    });
  });
  // Both original bodies were independently reread before a normalized edition is issued.
  const when = time(observedAt ?? new Date().toISOString());
  return Object.freeze({
    schemaVersion:"561.agricultural-observed-edition.v1",
    status:"observed-not-newsroom-approved-not-saleable",
    originalPublisher:source.publisher,
    sourceId:source.id,
    rawSourceDigest:"sha256:" + dataSource.sha256,
    originalCountDigest:"sha256:" + countSource.sha256,
    sourceAttribution:source.rights.attribution,
    publisherQueryWithoutCredential:nassQueryDescription({
      year:q.year,stateAlpha:q.state_alpha,commodity:q.commodity_desc,statistic:q.statisticcat_desc
    }),
    observedAt:when,rightsReviewedOn:source.rights.reviewedOn,rightsReviewDueOn:source.rights.reviewDueOn,
    commercialRedistribution:"not-qualified",sublicensing:"not-qualified",
    query:q,recordCount:count,observations,
    sourceCustody:{count:countSource,data:dataSource,store:"original-injected-content-addressed-store"},
    metrics:{networkRequests:2,sourceResponseBytes:countBody.byteLength + body.byteLength,acquiredRows:count,providerFee:null,storageCost:null,editorialCost:null,salesSettled:0},
    newsroom:{approval:"not-requested",newswireEdition:null,paidSellerReceipt:null}
  });
}
