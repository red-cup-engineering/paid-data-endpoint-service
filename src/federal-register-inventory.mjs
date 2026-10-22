/**
 * Federal Register inventory as verifiable, portable merchandise.
 *
 * The U.S. Government's published Federal Register material is republishable;
 * the buyer is purchasing this publisher's collection, checking, filtering,
 * update and delivery work, never exclusivity over public material.
 *
 * The functions in this module prepare data; none assert seller authority,
 * quote a payment rail, settle money, or independently accept a purchase.
 */
import { createHash } from "node:crypto";

const ORIGIN = "https://www.federalregister.gov";
const ENDPOINT = `${ORIGIN}/api/v1/documents.json`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const DOCUMENT_RE = /^\d{4}-\d{4,7}$/u;
const MAX_RESULTS = 100;

export const FEDERAL_REGISTER_REUSE = Object.freeze({
  status: "republication-permitted",
  basis: "1 CFR 2.6, as explained by the Office of the Federal Register",
  authorityUrl: "https://www.archives.gov/federal-register/faqs",
  originUrl: "https://www.federalregister.gov/reader-aids/developer-resources/rest-api",
  officialEdition: "The government source controls; this derived inventory is not the official Federal Register.",
  brandingLimit: "Do not use official NARA or OFR logos or seals in republishing.",
  nonexclusivity: "No exclusive rights are claimed over Federal Register public material.",
  additionalMaterial: "Check separately for third-party rights in attached or incorporated material.",
});

function date(value, name) {
  if (typeof value !== "string" || !DATE_RE.test(value) ||
      Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${name} must be a real YYYY-MM-DD date`);
  }
  return value;
}

function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/u.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new TypeError("observedAt must be an ISO 8601 timestamp with timezone");
  }
  return new Date(value).toISOString();
}

function boundedText(value, name, max = 4096) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new TypeError(`${name} must be a bounded nonempty string`);
  }
  return value.trim();
}

function optionalText(value, name, max = 15000) {
  if (value === null || value === undefined || value === "") return null;
  return boundedText(value, name, max);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function inventoryDigest(value) {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function apiURL(value) {
  const parsed = new URL(value);
  if (parsed.origin !== ORIGIN || parsed.pathname !== "/api/v1/documents.json" ||
      parsed.username || parsed.password || parsed.hash) {
    throw new TypeError("inventory source must be the Federal Register published-documents API");
  }
  return parsed;
}

/** Construct ONLY the official documents API URL. No arbitrary external URLs. */
export function federalRegisterSearchURL({ since, until, term, agency, perPage = 50, page = 1 } = {}) {
  date(since, "since");
  if (until !== undefined) {
    date(until, "until");
    if (until < since) throw new RangeError("until must not precede since");
  }
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > MAX_RESULTS) {
    throw new RangeError(`perPage must be between 1 and ${MAX_RESULTS}`);
  }
  // The API only permits paging through its first 2,000 matches. Query windows
  // should be narrowed rather than claiming that page 21 is complete.
  if (!Number.isInteger(page) || page < 1 || page * perPage > 2000) {
    throw new RangeError("requested page exceeds the API 2,000-result pagination window");
  }
  const url = new URL(ENDPOINT);
  url.searchParams.set("conditions[publication_date][gte]", since);
  if (until !== undefined) url.searchParams.set("conditions[publication_date][lte]", until);
  if (term !== undefined) url.searchParams.set("conditions[term]", boundedText(term, "term", 200));
  if (agency !== undefined) {
    const slug = boundedText(agency, "agency", 150);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new TypeError("agency must be a Federal Register slug");
    url.searchParams.set("conditions[agencies][]", slug);
  }
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  url.searchParams.set("order", "newest");
  return url.toString();
}

function federalRegisterDocument(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) ||
      !DOCUMENT_RE.test(raw.document_number ?? "")) {
    throw new TypeError("document_number must be a published Federal Register document number");
  }
  const document_number = raw.document_number;
  const html_url = boundedText(raw.html_url, "html_url", 2048);
  let url;
  try { url = new URL(html_url); }
  catch { throw new TypeError("html_url must be an official published-document link"); }
  if (url.origin !== ORIGIN || !url.pathname.startsWith("/documents/") ||
      url.username || url.password || url.hash) {
    throw new TypeError("html_url must be an official published-document link");
  }
  if (!url.pathname.includes(document_number)) {
    throw new TypeError("html_url must identify the supplied document number");
  }
  const agencies = raw.agencies ?? [];
  if (!Array.isArray(agencies) || agencies.length > 40) throw new TypeError("agencies must be a bounded array");
  const agency_names = [...new Set(agencies.map((a) =>
    typeof a === "string" ? boundedText(a, "agency name", 250) : boundedText(a?.name, "agency name", 250),
  ))].sort((a, b) => a.localeCompare(b));
  return {
    document_number,
    title: boundedText(raw.title, "title", 8000),
    type: boundedText(raw.type, "type", 80),
    publication_date: date(raw.publication_date, "publication_date"),
    comments_close_on: raw.comments_close_on ? date(raw.comments_close_on, "comments_close_on") : null,
    agency_names,
    abstract: optionalText(raw.abstract, "abstract", 30_000),
    html_url,
  };
}

/** Produce a content-addressed source lot without claiming payment or sale. */
export function federalRegisterInventoryLot({ response, sourceUrl, observedAt } = {}) {
  const url = apiURL(sourceUrl);
  if (response === null || typeof response !== "object" || Array.isArray(response) ||
      !Array.isArray(response.results) || response.results.length > MAX_RESULTS) {
    throw new TypeError("response.results must be a bounded Federal Register result array");
  }
  const records = response.results.map(federalRegisterDocument);
  records.sort((a, b) => a.document_number.localeCompare(b.document_number));
  const keys = records.map((item) => item.document_number);
  if (new Set(keys).size !== keys.length) throw new TypeError("source repeats a document number");
  const digest = inventoryDigest(records);
  return {
    schemaVersion: "561.public-data-inventory.v1",
    kind: "federal-register-published-documents",
    lotId: `urn:561:public-inventory:fr:${digest.slice(7)}`,
    digest,
    observedAt: timestamp(observedAt),
    source: {
      apiUrl: url.toString(),
      publisher: "Office of the Federal Register",
      totalResultsReported: Number.isInteger(response.count) && response.count >= 0 ? response.count : null,
      pageComplete: response.next_page_url === null ? true : (typeof response.next_page_url === "string" ? false : null),
      observationLevel: "source-response-processed-by-seller; no independent cryptographic attestation",
      rights: FEDERAL_REGISTER_REUSE,
    },
    recordCount: records.length,
    records,
    sales: { state: "no-sale-recorded", quote: null, payment: null, endUserAcceptance: null },
  };
}

function filtersFrom(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("filters object required");
  const keys = Object.keys(value);
  const allowed = new Set(["agencyContains", "titleOrAbstractContains", "type", "commentsCloseBy", "commentsCloseOnOrAfter", "publishedSince"]);
  if (keys.length === 0 || keys.some((k) => !allowed.has(k))) throw new TypeError("at least one supported filter is required");
  const result = {};
  for (const key of keys.sort()) {
    result[key] = key === "commentsCloseBy" || key === "commentsCloseOnOrAfter" || key === "publishedSince"
      ? date(value[key], key) : boundedText(value[key], key, 180);
  }
  return result;
}

/** Create a reseller's genuinely differentiated set, without assuming a sale. */
export function deriveFederalRegisterInventory(lot, { filters, actorId, service } = {}) {
  if (!lot || !Array.isArray(lot.records) || !lot.digest || !lot.source?.rights ||
      (lot.kind !== "federal-register-published-documents" && lot.kind !== "derived-federal-register-documents")) {
    throw new TypeError("a supported source lot is required");
  }
  const expectedDigest = lot.kind === "federal-register-published-documents"
    ? inventoryDigest(lot.records)
    : inventoryDigest({ parent: lot.parentDigest, transform: lot.transformation, records: lot.records });
  if (lot.digest !== expectedDigest) throw new TypeError("parent inventory digest does not verify");
  apiURL(lot.source.apiUrl);
  const selected = filtersFrom(filters);
  if (selected.commentsCloseBy && selected.commentsCloseOnOrAfter &&
      selected.commentsCloseOnOrAfter > selected.commentsCloseBy) {
    throw new RangeError("comment deadline window is inverted");
  }
  const seller = boundedText(actorId, "actorId", 300);
  const valueAdd = boundedText(service, "service", 400);
  const records = lot.records.filter((r) =>
    (selected.agencyContains === undefined || r.agency_names.some((a) => a.toLowerCase().includes(selected.agencyContains.toLowerCase()))) &&
    (selected.titleOrAbstractContains === undefined || `${r.title} ${r.abstract ?? ""}`.toLowerCase().includes(selected.titleOrAbstractContains.toLowerCase())) &&
    (selected.type === undefined || r.type.toLowerCase() === selected.type.toLowerCase()) &&
    (selected.commentsCloseBy === undefined || (r.comments_close_on !== null && r.comments_close_on <= selected.commentsCloseBy)) &&
    (selected.commentsCloseOnOrAfter === undefined || (r.comments_close_on !== null && r.comments_close_on >= selected.commentsCloseOnOrAfter)) &&
    (selected.publishedSince === undefined || r.publication_date >= selected.publishedSince)
  );
  const transform = { kind: "filter", actorId: seller, service: valueAdd, filters: selected };
  const digest = inventoryDigest({ parent: lot.digest, transform, records });
  return {
    schemaVersion: lot.schemaVersion,
    kind: "derived-federal-register-documents",
    lotId: `urn:561:public-inventory:fr:${digest.slice(7)}`,
    digest,
    observedAt: lot.observedAt,
    source: lot.source,
    parentDigest: lot.digest,
    transformation: transform,
    recordCount: records.length,
    records,
    // Attribute value-added processing without claiming independent corporate
    // identity, a right to bill, real resale, a customer or external revenue.
    sales: { state: "no-sale-recorded", quote: null, payment: null, endUserAcceptance: null },
  };
}

/** All network traffic is via a caller-selected fetch capability, never a discovered arbitrary URL. */
export async function acquireFederalRegisterInventory({ search, fetchImpl = fetch, observedAt = new Date().toISOString() } = {}) {
  const sourceUrl = federalRegisterSearchURL(search);
  const result = await fetchImpl(sourceUrl, { method: "GET", redirect: "error", headers: { accept: "application/json" } });
  if (!result.ok) throw new Error(`Federal Register API HTTP ${result.status}; no inventory admitted`);
  const mediaType = result.headers?.get?.("content-type") ?? "";
  if (!/\bapplication\/json\b/ui.test(mediaType)) throw new TypeError("Federal Register API did not return JSON");
  return federalRegisterInventoryLot({ response: await result.json(), sourceUrl, observedAt });
}
