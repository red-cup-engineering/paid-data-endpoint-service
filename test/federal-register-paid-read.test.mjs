import assert from "node:assert/strict";
import test from "node:test";
import { federalRegisterInventoryLot, deriveFederalRegisterInventory } from "../src/federal-register-inventory.mjs";
import { createFederalRegisterPaidReadActor, createFederalRegisterPaidReadHandlers, federalRegisterLotReadRequest } from "../src/federal-register-paid-read.mjs";

const observedAt = "2026-10-21T23:00:00.000Z";
const NOW = Date.parse("2026-10-22T00:00:00.000Z");
const source = {
  results: [
    { document_number: "2026-22101", title: "Public comment period", type: "Notice", publication_date: "2026-10-21", comments_close_on: "2026-11-17", abstract: "Stakeholders may comment", agencies: [{ name: "Environmental Protection Agency" }], html_url: "https://www.federalregister.gov/documents/2026/10/21/2026-22101/public-comment" },
  ],
  count: 1, next_page_url: null,
};
const lot = federalRegisterInventoryLot({
  response: source,
  sourceUrl: "https://www.federalregister.gov/api/v1/documents.json?per_page=1",
  observedAt,
});

function durableStore(initial = lot) {
  let current = initial;
  let reads = 0;
  return {
    get reads() { return reads; },
    setCurrent(next) { current = next; },
    async read({ digest }) { reads += 1; return digest === lot.digest ? current : undefined; },
  };
}

test("request identity is one canonical digest, never buyer-controlled price, lot data or endpoint", () => {
  assert.deepEqual(federalRegisterLotReadRequest({ lotDigest: lot.digest }), { lotDigest: lot.digest });
  for (const request of [null, {}, { lotDigest: "not-a-digest" }, { lotDigest: lot.digest, price: "0" }, { lotDigest: lot.digest, records: source.results }]) {
    assert.throws(() => federalRegisterLotReadRequest(request), /exactly one canonical/);
  }
});

test("the admission gate checks available, fresh, source-and-hash-valid pinned inventory before x402 challenge", async () => {
  const lotStore = durableStore();
  const { admit } = createFederalRegisterPaidReadHandlers({ lotStore, now: () => NOW, maxAgeMs: 3600_001 });
  const passed = await admit({ request: { body: { lotDigest: lot.digest } } });
  assert.deepEqual(passed, { admitted: true, lotDigest: lot.digest, records: 1 });
  assert.equal(lotStore.reads, 1);
  await assert.rejects(admit({ request: { body: { lotDigest: `sha256:${"f".repeat(64)}` } } }), /unavailable/);
  await assert.rejects(createFederalRegisterPaidReadHandlers({ lotStore, now: () => NOW + 30 * 3600_000 }).admit({ request: { body: { lotDigest: lot.digest } } }), /freshness/);
  await assert.rejects(createFederalRegisterPaidReadHandlers({ lotStore, now: () => NOW - 7200_000 }).admit({ request: { body: { lotDigest: lot.digest } } }), /freshness/);
});

test("settled read re-verifies the same content digest and does not invent external revenue", async () => {
  const lotStore = durableStore();
  const { admit, execute } = createFederalRegisterPaidReadHandlers({ lotStore, now: () => NOW });
  await admit({ request: { body: { lotDigest: lot.digest } } });
  const result = await execute({ intent: { request: { lotDigest: lot.digest } } });
  assert.equal(result.lotDigest, lot.digest);
  assert.equal(result.lot.records[0].document_number, "2026-22101");
  assert.equal(result.lot.sales.state, "no-sale-recorded");
  assert.match(result.consideration, /not exclusive ownership/);
  assert.equal(lotStore.reads, 2);
  result.lot.records[0].title = "BUYER MODIFIED THE RESPONSE";
  assert.equal(lot.records[0].title, "Public comment period");
  lotStore.setCurrent({ ...lot, records: [{ ...lot.records[0], title: "changed without new digest" }] });
  await assert.rejects(execute({ intent: { request: { lotDigest: lot.digest } } }), /digest does not verify/);
});

test("reseller's derived version may be sold as a separate exact digest without exclusive rights", async () => {
  const resale = deriveFederalRegisterInventory(lot, { filters: { commentsCloseBy: "2026-11-30" }, actorId: "actor:internal-comments-merchant", service: "Dated agency comments triage" });
  const lotStore = { async read({ digest }) { return digest === resale.digest ? resale : undefined; } };
  const seller = createFederalRegisterPaidReadHandlers({ lotStore, now: () => NOW });
  const result = await seller.execute({ intent: { request: { lotDigest: resale.digest } } });
  assert.equal(result.lot.parentDigest, lot.digest);
  assert.equal(result.lot.transformation.actorId, "actor:internal-comments-merchant");
  assert.equal(result.lot.source.rights.status, "republication-permitted");
});

test("original x402 actor receives the sole payment responsibility; no custom payment system", async () => {
  let captured;
  const actorFactory = async (options) => { captured = options; return { operation: options.operation, offer: options.offer }; };
  const priceTerms = { network: "eip155:8453", amount: "30000", asset: `0x${"11".repeat(20)}`, payTo: `0x${"22".repeat(20)}` };
  const paymentBoundaryFactory = () => ({ middleware: (_req, _res, next) => next() });
  const passed = await createFederalRegisterPaidReadActor({
    lotStore: durableStore(), sellerOffer: { seller: "561-owned-qualified-seller" }, priceTerms,
    append: async () => undefined, recoveredRecords: { intents: new Map(), terminals: new Map() },
    actorFactory, paymentBoundaryFactory, now: () => NOW,
  });
  assert.equal(passed.operation, "read-data");
  assert.strictEqual(captured.priceTerms, priceTerms);
  assert.strictEqual(captured.paymentBoundaryFactory, paymentBoundaryFactory);
  assert.equal(captured.basePath, "/x402/federal-register-inventory");
  assert.match(captured.offer.consideration, /not exclusive/);
  await assert.doesNotReject(captured.admit({ request: { body: { lotDigest: lot.digest } } }));
  const delivered = await captured.execute({ intent: { request: { lotDigest: lot.digest } } });
  assert.equal(delivered.lotDigest, lot.digest);
  assert.equal(delivered.receipt, "recorded by the original durable paid-data actor, not by this payload");
});
