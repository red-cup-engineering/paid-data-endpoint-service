import nass from "../data/records/agricultural-sources/usda-nass-quickstats.json" with { type: "json" };
import weather from "../data/records/agricultural-sources/noaa-nws-forecast-reuse.json" with { type: "json" };

/**
 * Admission and discovery for original agricultural data suppliers. No
 * merchant/ledger or Newswire copy is created here. Declaration != dataset.
 */
const SOURCES = Object.freeze([nass, weather]);
const SOURCE_SCHEMA = "561.agricultural-source.v1";
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ACCESS = new Set(["credentialed-api", "existing-provider"]);

function date(value, field) {
  if (typeof value !== "string" || !DATE.test(value) ||
      !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value) {
    throw new TypeError(field + " must be a real ISO date");
  }
  return value;
}
function https(value, field) {
  let u;
  try { u = new URL(value); } catch { throw new TypeError(field + " requires HTTPS"); }
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.search)
    throw new TypeError(field + " requires a credential-free HTTPS URL");
  return u.toString();
}
function obj(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(field + " must be a record");
  return value;
}
function words(value, field) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(field + " is required");
  return value;
}

/** Shape/rights validation of typed upstream source declarations. */
export function admitAgriculturalSourceDeclaration(declaration) {
  const source = obj(declaration, "source");
  if (source.schemaVersion !== SOURCE_SCHEMA || !ID.test(source.id ?? ""))
    throw new TypeError("unknown agricultural source schema or id");
  obj(source.publisher, "publisher");
  words(source.publisher.name, "publisher.name");
  https(source.publisher.url, "publisher.url");
  obj(source.dataset, "dataset");
  for (const field of ["title", "description", "spatialCoverage", "temporalCoverage", "measurementUnit"])
    words(source.dataset[field], "dataset." + field);
  obj(source.access, "access");
  if (!ACCESS.has(source.access.kind)) throw new TypeError("unsupported provider access kind");
  https(source.access.endpoint, "access.endpoint");
  https(source.access.documentation, "access.documentation");
  if (typeof source.access.requiresProviderKey !== "boolean" ||
      !Number.isSafeInteger(source.access.maxRecordsPerQuery) || source.access.maxRecordsPerQuery < 0)
    throw new TypeError("invalid API key or record-budget declaration");
  obj(source.rights, "rights");
  const r = source.rights;
  date(r.reviewedOn, "rights.reviewedOn");
  date(r.reviewDueOn, "rights.reviewDueOn");
  if (r.reviewDueOn < r.reviewedOn) throw new TypeError("rights review precedes evidence");
  https(r.evidenceUrl, "rights.evidenceUrl");
  words(r.attribution, "rights.attribution");
  words(r.provenanceRequirements, "rights.provenanceRequirements");
  if (!["not-yet-qualified", "qualified"].includes(r.commercialRedistribution) ||
      !["not-yet-qualified", "qualified"].includes(r.sublicensing))
    throw new TypeError("commercial redistribution and sublicensing must have explicit review state");
  if (source.status !== "source-candidate-not-published")
    throw new TypeError("agricultural source declaration cannot claim an observed publication");
  if (source.access.kind === "existing-provider") {
    obj(source.upstream, "upstream");
    words(source.upstream.repository, "upstream.repository");
  }
  return Object.freeze(structuredClone(source));
}

const CATALOG = Object.freeze(SOURCES.map(admitAgriculturalSourceDeclaration));

export const agriculturalSourceCandidates = () => structuredClone(CATALOG);

/**
 * Separate original public acquisition from resale rights. Every current
 * source is commercially held. New declarations require a fresh, independent
 * rights evidence review; even a positive review does not prove an edition.
 */
export function qualifyAgriculturalSource({ id, asOf, purpose = "public-source-read" } = {}) {
  date(asOf, "asOf");
  const source = CATALOG.find((candidate) => candidate.id === id);
  if (!source) throw new TypeError("agricultural source unknown: refuse admission");
  if (asOf < source.rights.reviewedOn || asOf > source.rights.reviewDueOn)
    throw new Error("agricultural source rights evidence is not current");
  if (purpose !== "public-source-read" && purpose !== "commercial-redistribution" &&
      purpose !== "commercial-sublicensing") throw new TypeError("unknown source purpose");
  if (purpose === "commercial-redistribution" && source.rights.commercialRedistribution !== "qualified")
    throw new Error("commercial redistribution has not been independently qualified");
  if (purpose === "commercial-sublicensing" &&
      (source.rights.sublicensing !== "qualified" || source.rights.commercialRedistribution !== "qualified"))
    throw new Error("commercial sublicensing has not been independently qualified");
  return structuredClone(source);
}

/**
 * DCAT 3 discovery of publisher-owned source *candidates*. No dcat:Distribution
 * is published because the Group has not acquired and released a source lot.
 * An endpoint is the original supplier's endpoint, never a 561 paid offer.
 */
export function agriculturalDcatCatalog({ asOf } = {}) {
  date(asOf, "asOf");
  return Object.freeze({
    "@context": {
      dcat: "http://www.w3.org/ns/dcat#",
      dct: "http://purl.org/dc/terms/",
      prov: "http://www.w3.org/ns/prov#",
      adms: "http://www.w3.org/ns/adms#"
    },
    "@type": "dcat:Catalog",
    "dct:title": "561 Group agricultural source qualification candidates",
    "dct:description": "Publisher-owned candidate source declarations. Not acquired inventory, commercial license, a live data service, or a paid Newswire offer.",
    "dct:modified": asOf,
    "dcat:dataset": CATALOG.map((source) => ({
      "@id": `https://561.group/data/source-candidates/${source.id}`,
      "@type": "dcat:Dataset",
      "dct:identifier": source.id,
      "dct:title": source.dataset.title,
      "dct:description": source.dataset.description + " Candidate metadata only: no Group-owned acquired edition or published distribution.",
      "dct:publisher": { "@id": source.publisher.url, "dct:title": source.publisher.name },
      "dct:source": { "@id": source.access.documentation },
      "dcat:theme": { "@id": source.dataset.theme },
      "adms:status": { "@id": "http://purl.org/adms/status/UnderDevelopment" },
      "dct:accessRights": source.access.requiresProviderKey ? "Original publisher API credential required; no Group-hosted data product." : "Access through the original source provider only; no Group-hosted data product.",
      "dct:rights": `Source commercial redistribution: ${source.rights.commercialRedistribution}; sublicensing: ${source.rights.sublicensing}; original rights evidence: ${source.rights.evidenceUrl}; review due: ${source.rights.reviewDueOn}; original attribution: ${source.rights.attribution}`,
      "prov:wasAttributedTo": { "@id": source.publisher.url }
    }))
  });
}
