import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INTERNATIONAL_SOURCES, admitInternationalSourceDeclarations } from '../src/international-source-declarations.mjs';
import { worldBankIndicatorURL, worldBankInventoryLot, verifyWorldBankInventoryLot, acquireWorldBankSeries, internationalLotDigest } from '../src/international-data-inventory.mjs';
import { createInternationalPaidReadHandlers, createInternationalPaidReadActor, internationalLotReadRequest } from '../src/international-paid-read.mjs';
import { loadInternationalSourceDeclarationsFile } from '../src/international-data-inventory-cli.mjs';
import legacy from './fixtures/international-v1-compatibility.json' with { type: 'json' };
import publisherResponse from '../data/international/wdi-gb-population-2020-2024-20261026.source.json' with { type: 'json' };
import acquiredLot from '../data/international/wdi-gb-population-2020-2024-20261026.lot.json' with { type: 'json' };

const sourceId = 'wdi-gb-population';
const asOf = '2026-10-26';
const options = { sourceId, fromYear: '2020', throughYear: '2024', response: publisherResponse,
  observedAt: acquiredLot.observedAt, asOf };
const declarations = () => ({ [sourceId]: structuredClone(INTERNATIONAL_SOURCES[sourceId]) });
const response = () => ({ ok: true, status: 200, headers: { get: () => 'application/json' },
  text: async () => JSON.stringify(publisherResponse) });

test('original China URLs, digests and complete lot JSON remain byte-identical', () => {
  for (const fixture of legacy) {
    assert.equal(worldBankIndicatorURL(fixture.input), fixture.url);
    const lot = worldBankInventoryLot(fixture.input);
    assert.equal(JSON.stringify(lot), JSON.stringify(fixture.lot));
    assert.equal(verifyWorldBankInventoryLot(lot, { asOf: fixture.input.asOf }), lot);
  }
});

test('a data-only GB population declaration receives the actual publisher series as v2', () => {
  const sourceDeclarations = declarations();
  const lot = worldBankInventoryLot({ ...options, sourceDeclarations });
  assert.equal(JSON.stringify(lot), JSON.stringify(acquiredLot));
  assert.equal(lot.schemaVersion, '561.international-inventory.v2');
  assert.equal(lot.metadata.countryISO3, 'GBR');
  assert.equal(lot.metadata.indicator, 'SP.POP.TOTL');
  assert.deepEqual(lot.records.map(({ year }) => year), ['2020', '2021', '2022', '2023', '2024']);
  assert.equal(verifyWorldBankInventoryLot(lot, { asOf, sourceDeclarations }), lot);
  const wrong = structuredClone(publisherResponse);
  wrong[1][0].countryiso3code = 'CHN';
  assert.throws(() => worldBankInventoryLot({ ...options, response: wrong, sourceDeclarations }), /country/);
});

test('new-ID digests bind the full non-rights dataset definition and enforce their version', () => {
  for (const field of ['title', 'unit', 'sourceCredit', 'coverage']) {
    const sourceDeclarations = declarations();
    sourceDeclarations[sourceId][field] = 'changed dataset ' + field;
    const changed = worldBankInventoryLot({ ...options, sourceDeclarations });
    assert.notEqual(changed.digest, acquiredLot.digest, field);
    assert.throws(() => verifyWorldBankInventoryLot(acquiredLot, { asOf, sourceDeclarations }), /definition|digest/);
  }
  const sourceDeclarations = declarations();
  const substituted = structuredClone(acquiredLot);
  substituted.schemaVersion = '561.international-inventory.v1';
  delete substituted.metadata.countryISO3;
  substituted.metadata.sourceObservation = 'one API response processed by the seller; not independently signed by the World Bank';
  substituted.digest = internationalLotDigest({ sourceId, ...substituted.request, records: substituted.records,
    rights: sourceDeclarations[sourceId].rights });
  substituted.lotId = 'urn:561:international-inventory:' + substituted.digest.slice(7);
  assert.throws(() => verifyWorldBankInventoryLot(substituted, { asOf, sourceDeclarations }), /version/);
  assert.throws(() => verifyWorldBankInventoryLot({ ...legacy[0].lot, schemaVersion: '561.international-inventory.v2' },
    { asOf: legacy[0].input.asOf }), /version/);
});

test('reserved dataset identities stay fixed while legitimate rights editions change their digest', () => {
  const original = structuredClone(INTERNATIONAL_SOURCES['wdi-cn-gdp']);
  for (const field of ['country', 'countryISO3', 'indicator', 'title', 'unit', 'sourceCredit']) {
    const declaration = structuredClone(original);
    declaration[field] = { country: 'GB', countryISO3: 'GBR', indicator: 'SP.POP.TOTL' }[field] ?? 'Changed ' + field;
    assert.throws(() => admitInternationalSourceDeclarations({ [declaration.id]: declaration }), /reserved source ID/);
  }
  const renewed = structuredClone(original);
  renewed.rights.checkedOn = asOf; renewed.rights.reviewBy = '2027-01-26';
  const fixture = legacy[0];
  const lot = worldBankInventoryLot({ ...fixture.input, asOf, sourceDeclarations: { [renewed.id]: renewed } });
  assert.equal(lot.schemaVersion, '561.international-inventory.v1');
  assert.notEqual(lot.digest, fixture.lot.digest);
  assert.equal(verifyWorldBankInventoryLot(lot, { asOf, sourceDeclarations: { [renewed.id]: renewed } }), lot);
});

test('declarations enforce primitive country codes and capture deeply immutable JSON', () => {
  for (const [field, value] of [['country', ['GB']], ['countryISO3', ['GBR']], ['indicator', ['SP.POP.TOTL']],
    ['countryISO3', undefined], ['sourceCredit', undefined]]) {
    const sourceDeclarations = declarations();
    sourceDeclarations[sourceId][field] = value;
    assert.throws(() => admitInternationalSourceDeclarations(sourceDeclarations), /country|indicator|sourceCredit/);
  }
  const held = structuredClone(INTERNATIONAL_SOURCES['sse-market-data']);
  for (const [field, value] of [['country', ['CN']], ['countryISO3', ['CHN']], ['indicator', ['x']]]) {
    assert.throws(() => admitInternationalSourceDeclarations({ [held.id]: { ...held, [field]: value } }), /country|indicator/);
  }
  const caller = declarations();
  const admitted = admitInternationalSourceDeclarations(caller);
  assert.equal(admitInternationalSourceDeclarations(admitted), admitted);
  caller[sourceId].title = 'caller changed title';
  caller[sourceId].rights.obligations.push('caller changed obligations');
  assert.equal(admitted[sourceId].title, INTERNATIONAL_SOURCES[sourceId].title);
  assert.equal(Object.isFrozen(admitted), true);
  assert.equal(Object.isFrozen(admitted[sourceId].rights.obligations), true);
  assert.throws(() => admitted[sourceId].rights.obligations.push('later mutation'), TypeError);
});

test('acquisition keeps the same admitted definition across an awaited publisher response', async () => {
  const caller = declarations();
  const lot = await acquireWorldBankSeries({ ...options, sourceDeclarations: caller, fetchImpl: async (url) => {
    assert.match(url, /country\/GB\/indicator\/SP.POP.TOTL/);
    caller[sourceId].country = 'US'; caller[sourceId].countryISO3 = 'USA';
    caller[sourceId].rights.license = 'CC0';
    await Promise.resolve();
    return response();
  } });
  assert.equal(lot.digest, acquiredLot.digest);
  assert.equal(lot.metadata.country, 'GB');
  assert.equal(lot.metadata.rights.license, 'CC-BY-4.0');
});

test('paid handlers capture operator declarations before asynchronous store reads and reject buyer overrides', async () => {
  const caller = declarations();
  const lotStore = { async read() {
    caller[sourceId].country = 'US'; caller[sourceId].countryISO3 = 'USA';
    caller[sourceId].rights.license = 'CC0';
    await Promise.resolve();
    return acquiredLot;
  } };
  const now = () => Date.parse(acquiredLot.observedAt) + 1000;
  const handlers = createInternationalPaidReadHandlers({ lotStore, sourceDeclarations: caller, now });
  const request = { lotDigest: acquiredLot.digest };
  assert.equal((await handlers.admit({ request: { body: request } })).digest, acquiredLot.digest);
  assert.equal((await handlers.execute({ intent: { request } })).lot.digest, acquiredLot.digest);
  assert.throws(() => internationalLotReadRequest({ ...request, sourceDeclarations: declarations() }), /exact canonical/);
  let settings;
  await createInternationalPaidReadActor({
    lotStore: { read: async () => acquiredLot }, sourceDeclarations: declarations(), now,
    sellerOffer: { seller: 'existing-seller' }, priceTerms: {},
    append: async () => {}, recoveredRecords: { intents: new Map(), terminals: new Map() },
    actorFactory: async (value) => { settings = value; return value; }, paymentBoundaryFactory: () => ({}),
  });
  assert.deepEqual(Object.keys(settings.offer.requestSchema.properties), ['lotDigest']);
  assert.equal((await settings.execute({ intent: { request } })).lot.metadata.countryISO3, 'GBR');
});

test('operator source files are bounded regular JSON and produce the same admitted declarations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'international-source-declarations-'));
  try {
    const file = join(directory, 'sources.json');
    await writeFile(file, JSON.stringify(declarations()));
    const sourceDeclarations = await loadInternationalSourceDeclarationsFile(file);
    assert.equal(worldBankInventoryLot({ ...options, sourceDeclarations }).digest, acquiredLot.digest);
    assert.equal(Object.isFrozen(sourceDeclarations[sourceId].rights), true);
    const tooLarge = join(directory, 'too-large.json');
    const handle = await open(tooLarge, 'w');
    await handle.truncate(32 * 1024 * 1024 + 1); await handle.close();
    await assert.rejects(loadInternationalSourceDeclarationsFile(tooLarge), /32 MiB/);
    await writeFile(file, '{"invalid":');
    await assert.rejects(loadInternationalSourceDeclarationsFile(file), SyntaxError);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

