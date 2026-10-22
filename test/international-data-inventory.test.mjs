import assert from 'node:assert/strict';
import test from 'node:test';
import {
 INTERNATIONAL_SOURCES, qualifyInternationalSource, worldBankIndicatorURL,
 worldBankInventoryLot, verifyWorldBankInventoryLot, acquireWorldBankSeries,
 chirpsV3AfricaAsset,
} from './international-data-inventory.mjs';
const asOf = '2026-10-21';
const observedAt = '2026-10-21T22:30:00-05:00';
const sourceId = 'wdi-cn-inflation';
const fromYear = '2023', throughYear = '2025';
const expected = [
 { country: { id: 'CN', value: 'China' }, countryiso3code: 'CHN', indicator: { id: 'FP.CPI.TOTL.ZG', value: 'Inflation' }, date: '2025', value: 0.1 },
 { country: { id: 'CN', value: 'China' }, countryiso3code: 'CHN', indicator: { id: 'FP.CPI.TOTL.ZG', value: 'Inflation' }, date: '2024', value: null },
 { country: { id: 'CN', value: 'China' }, countryiso3code: 'CHN', indicator: { id: 'FP.CPI.TOTL.ZG', value: 'Inflation' }, date: '2023', value: -0.3 },
];
const apiResponse = [{ page: 1, pages: 1, per_page: 200, total: 3 }, expected];
const sourceArgs = { sourceId, fromYear, throughYear, response: apiResponse, observedAt, asOf };
test('admission accepts only specifically licensed datasets, expires rights, never assumes national permissions', () => {
 assert.equal(qualifyInternationalSource('wdi-cn-inflation', { asOf }).rights.license, 'CC-BY-4.0');
 assert.equal(qualifyInternationalSource('chirps3-africa-rainfall', { asOf }).family, 'climate-hazards-archive');
 assert.throws(() => qualifyInternationalSource('china-nbs-website', { asOf }), /not been qualified/);
 assert.throws(() => qualifyInternationalSource('tahmo-stations', { asOf }), /not been qualified/);
 assert.throws(() => qualifyInternationalSource('some-new-source', { asOf }), /unlisted/);
 assert.throws(() => qualifyInternationalSource('wdi-cn-inflation', { asOf: '2027-02-01' }), /expired/);
 assert.throws(() => qualifyInternationalSource('wdi-cn-inflation', { asOf: '2025-01-01' }), /future/);
 assert.equal(INTERNATIONAL_SOURCES['china-nbs-website'].rights.state, 'commercial-resale-held');
});
test('World Bank URLs are strict, narrow, source-qualified, budgeted', () => {
 const url = new URL(worldBankIndicatorURL({ sourceId, fromYear, throughYear, asOf }));
 assert.equal(url.origin, 'https://api.worldbank.org');
 assert.equal(url.pathname, '/v2/country/CN/indicator/FP.CPI.TOTL.ZG');
 assert.equal(url.searchParams.get('date'), '2023:2025');
 assert.equal(url.searchParams.get('format'), 'json');
 assert.throws(() => worldBankIndicatorURL({ sourceId: 'china-nbs-website', fromYear, throughYear, asOf }), /qualified/);
 assert.throws(() => worldBankIndicatorURL({ sourceId, fromYear: '2027', throughYear, asOf }), /inverted/);
 assert.throws(() => worldBankIndicatorURL({ sourceId, fromYear, throughYear, asOf, perPage: 1000 }), /budget/);
 assert.throws(() => worldBankIndicatorURL({ sourceId, fromYear: '2025%2e%2e', throughYear, asOf }), /year/);
});
test('China series forms reproducible content-addressed inventory with explicit nulls and attribution', () => {
 const lot = worldBankInventoryLot(sourceArgs);
 assert.equal(lot.records.length, 3);
 assert.deepEqual(lot.records, [{ year:'2023', value:-0.3 },{ year:'2024', value:null },{ year:'2025', value:0.1 }]);
 assert.match(lot.digest, /^sha256:[a-f0-9]{64}$/);
 assert.equal(lot.sourceId, 'wdi-cn-inflation');
 assert.match(lot.metadata.attribution, /IMF/);
 assert.match(lot.metadata.rights.obligations.join(' '), /attribution/);
 assert.equal(lot.sales.payment, null);
 assert.equal(verifyWorldBankInventoryLot(lot, { asOf }), lot);
 const reordered = worldBankInventoryLot({ ...sourceArgs, response: [apiResponse[0], [...expected].reverse()] });
 assert.equal(reordered.digest, lot.digest);
 assert.throws(() => verifyWorldBankInventoryLot({ ...lot, records: [{...lot.records[0],value:22}, ...lot.records.slice(1)] }, { asOf }), /digest/);
 assert.throws(() => verifyWorldBankInventoryLot({ ...lot, metadata: { ...lot.metadata, rights: {...lot.metadata.rights, license:'CC0'} } }, { asOf }), /license/);
 assert.throws(() => verifyWorldBankInventoryLot({ ...lot, sales: {...lot.sales, state:'settled' } }, { asOf }), /fabricate/);
});
test('rejects incomplete, mismatched, duplicate or non-finite foreign indicator data', () => {
 assert.throws(() => worldBankInventoryLot({ ...sourceArgs, response: [{ page:1,pages:2,total:100 },expected] }), /incomplete/);
 assert.throws(() => worldBankInventoryLot({ ...sourceArgs, response: [apiResponse[0],[{...expected[0],country:{id:'US'}}]] }), /country/);
 assert.throws(() => worldBankInventoryLot({ ...sourceArgs, response: [apiResponse[0],[{...expected[0],indicator:{id:'not-it'}}]] }), /indicator/);
 assert.throws(() => worldBankInventoryLot({ ...sourceArgs, response: [apiResponse[0],[expected[0],expected[0]]] }), /duplicate/);
 assert.throws(() => worldBankInventoryLot({ ...sourceArgs, response: [apiResponse[0],[{...expected[0],value:Infinity}]] }), /finite/);
 assert.throws(() => worldBankInventoryLot({ ...sourceArgs, response: [apiResponse[0],[{...expected[0],date:'2022'}]] }), /range/);
});
test('source fetch measures byte limit and rejects failed or non-JSON responses', async () => {
 const get = async (url, init) => {
  assert.equal(url, worldBankIndicatorURL({ sourceId, fromYear, throughYear, asOf }));
  assert.equal(init.redirect,'error');
  return { ok:true, status:200, headers:{ get:()=> 'application/json; charset=utf-8' }, text:async()=>JSON.stringify(apiResponse) };
 };
 const got = await acquireWorldBankSeries({ sourceId, fromYear, throughYear, observedAt, asOf, fetchImpl:get });
 assert.equal(got.records[0].year,'2023');
 await assert.rejects(acquireWorldBankSeries({ sourceId, fromYear, throughYear, observedAt, asOf, fetchImpl:async()=>({ok:false,status:503}) }), /HTTP 503/);
 await assert.rejects(acquireWorldBankSeries({ sourceId, fromYear, throughYear, observedAt, asOf, fetchImpl:async()=>({ok:true,headers:{get:()=> 'text/html'}}) }), /did not supply JSON/);
 await assert.rejects(acquireWorldBankSeries({ sourceId, fromYear, throughYear, observedAt, asOf, fetchImpl:async()=>({ok:true,headers:{get:()=> 'application/json'},text:async()=> ' '.repeat(1_000_001)}) }), /byte limit/);
});
test('Africa-targeted rainfall discovery is NOT falsely promoted to purchased or fetched inventory', () => {
 const asset = chirpsV3AfricaAsset({ day:'2025-08-01',asOf });
 assert.equal(asset.state, 'not-acquired-not-saleable');
 assert.equal(asset.observedRasterHash, null);
 assert.equal(asset.observedBytes, null);
 assert.equal(asset.format, 'GeoTIFF');
 assert.ok(asset.sourceUrl.endsWith('/2025/chirps-v3.0.rnl.2025.08.01.tif'));
 assert.ok(asset.rights.attribution.includes('Climate Hazards Center'));
 assert.throws(() => chirpsV3AfricaAsset({ day:'2026-12-01', asOf }), /future/);
 assert.throws(() => chirpsV3AfricaAsset({ day:'2025-08-01', asOf, variant:'../../../private' }), /variant/);
});
