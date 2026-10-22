import assert from "node:assert/strict";
import test from "node:test";
import { acquireFederalRegisterInventory, deriveFederalRegisterInventory, federalRegisterInventoryLot, federalRegisterSearchURL, inventoryDigest } from "../src/federal-register-inventory.mjs";

const search = { since: "2026-10-01", until: "2026-10-21", agency: "environmental-protection-agency", perPage: 20 };
const url = federalRegisterSearchURL(search);
const observedAt = "2026-10-21T23:00:00Z";
const rows = [
  { document_number: "2026-14501", title: "Comment request on watershed data", type: "Notice", publication_date: "2026-10-20", comments_close_on: "2026-11-03", agencies: [{ name: "Environmental Protection Agency" }], abstract: "Input sought on watersheds", html_url: "https://www.federalregister.gov/documents/2026/10/20/2026-14501/comment-request" },
  { document_number: "2026-14300", title: "Water-quality standards", type: "Proposed Rule", publication_date: "2026-10-16", comments_close_on: "2026-12-04", agencies: [{ name: "Environmental Protection Agency" }, { name: "Environmental Protection Agency" }], abstract: null, html_url: "https://www.federalregister.gov/documents/2026/10/16/2026-14300/water-quality-standards" },
];
const source = { count: 48, results: rows, next_page_url: "https://www.federalregister.gov/api/v1/documents.json?page=2" };
const lot = () => federalRegisterInventoryLot({ response: source, sourceUrl: url, observedAt });

test("builds bounded official keyless API URLs, not arbitrary seller-controlled sources", () => {
  const got = new URL(url);
  assert.equal(got.origin, "https://www.federalregister.gov");
  assert.equal(got.searchParams.get("conditions[publication_date][gte]"), search.since);
  assert.equal(got.searchParams.get("conditions[agencies][]"), search.agency);
  assert.equal(got.searchParams.get("order"), "newest");
  assert.throws(() => federalRegisterSearchURL({ since: "2026-02-30" }), /real YYYY-MM-DD/);
  assert.throws(() => federalRegisterSearchURL({ since: "2026-10-01", until: "2026-09-01" }), /precede/);
  assert.throws(() => federalRegisterSearchURL({ since: "2026-10-01", perPage: 101 }), /perPage/);
  assert.throws(() => federalRegisterSearchURL({ since: "2026-10-01", page: 21, perPage: 100 }), /pagination/);
  assert.throws(() => federalRegisterSearchURL({ since: "2026-10-01", agency: "../evil" }), /slug/);
});

test("source lot retains no fake sale, official links, reuse disclosure, stable content address", () => {
  const published = lot();
  assert.equal(published.recordCount, 2);
  assert.match(published.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(published.source.totalResultsReported, 48);
  assert.equal(published.source.pageComplete, false);
  assert.match(published.source.rights.nonexclusivity, /No exclusive/);
  assert.equal(published.sales.payment, null);
  assert.deepEqual(published.records.map((r) => r.document_number), ["2026-14300", "2026-14501"]);
  const reversed = federalRegisterInventoryLot({ response: { ...source, results: [...rows].reverse() }, sourceUrl: url, observedAt });
  assert.equal(published.digest, reversed.digest);
  assert.equal(inventoryDigest(published.records), published.digest);
  assert.equal(published.records[0].agency_names.length, 1);
});

test("a reseller can merchandise a deadline view without losing its upstream provenance", () => {
  const root = lot();
  const derived = deriveFederalRegisterInventory(root, { filters: { commentsCloseBy: "2026-11-10", commentsCloseOnOrAfter: "2026-10-21" }, actorId: "actor:561-public-comment-merchant", service: "Checks comment windows and ships dated subsets" });
  assert.equal(derived.recordCount, 1);
  assert.equal(derived.records[0].document_number, "2026-14501");
  assert.equal(derived.parentDigest, root.digest);
  assert.equal(derived.source.apiUrl, root.source.apiUrl);
  assert.equal(derived.sales.state, "no-sale-recorded");
  assert.notEqual(derived.digest, root.digest);
  const downstream = deriveFederalRegisterInventory(derived, { filters: { agencyContains: "EPA" }, actorId: "actor:561-epa-comment-watch", service: "Agency-specific follow-up" });
  assert.equal(downstream.recordCount, 0);
  assert.equal(downstream.parentDigest, derived.digest);
});

test("rejects unverified malformed source rows, insecure identifiers and duplicated inventory", () => {
  assert.throws(() => federalRegisterInventoryLot({ response: source, sourceUrl: "https://example.org/api/v1/documents.json", observedAt }), /Federal Register/);
  assert.throws(() => federalRegisterInventoryLot({ response: { results: [rows[0], rows[0]] }, sourceUrl: url, observedAt }), /repeats/);
  assert.throws(() => federalRegisterInventoryLot({ response: { results: [{ ...rows[0], html_url: "https://attacker.example/documents/2026-14501" }] }, sourceUrl: url, observedAt }), /official published/);
  assert.throws(() => federalRegisterInventoryLot({ response: { results: [{ ...rows[0], document_number: "invalid" }] }, sourceUrl: url, observedAt }), /document_number/);
  assert.throws(() => federalRegisterInventoryLot({ response: { results: [] }, sourceUrl: url, observedAt: "2026-99-12" }), /observedAt/);
  assert.throws(() => deriveFederalRegisterInventory(lot(), { filters: {}, actorId: "actor:seller", service: "filter" }), /supported filter/);
  assert.throws(() => deriveFederalRegisterInventory({ ...lot(), records: rows }, { filters: { commentsCloseBy: "2026-11-10" }, actorId: "actor:seller", service: "filter" }), /digest does not verify/);
  assert.throws(() => deriveFederalRegisterInventory(lot(), { filters: { commentsCloseBy: "2026-10-01", commentsCloseOnOrAfter: "2026-11-01" }, actorId: "actor:seller", service: "filter" }), /inverted/);
  assert.throws(() => deriveFederalRegisterInventory(lot(), { filters: { fictitiousQuery: "anything" }, actorId: "actor:seller", service: "filter" }), /supported filter/);
});

test("source acquisition refuses upstream failures and malformed media types before recording inventory", async () => {
  const admitted = await acquireFederalRegisterInventory({ search, observedAt, fetchImpl: async (requested, options) => {
    assert.equal(requested, url);
    assert.equal(options.redirect, "error");
    return { ok: true, status: 200, headers: { get: () => "application/json; charset=utf-8" }, json: async () => source };
  }});
  assert.equal(admitted.digest, lot().digest);
  await assert.rejects(acquireFederalRegisterInventory({ search, observedAt, fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  await assert.rejects(acquireFederalRegisterInventory({ search, observedAt, fetchImpl: async () => ({ ok: true, headers: { get: () => "text/html" } }) }), /did not return JSON/);
});
