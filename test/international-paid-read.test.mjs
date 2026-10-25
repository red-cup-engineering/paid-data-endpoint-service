import assert from 'node:assert/strict';
import test from 'node:test';
import { worldBankInventoryLot, INTERNATIONAL_SOURCES, chirpsV3AfricaAsset } from '../src/international-data-inventory.mjs';
import { createInternationalPaidReadHandlers, createInternationalPaidReadActor, internationalLotReadRequest } from '../src/international-paid-read.mjs';

const when = '2026-10-21T23:10:00Z';
const clock = Date.parse('2026-10-22T03:45:00Z');
const sourceId = 'wdi-cn-gdp';
const row = { indicator:{id:'NY.GDP.MKTP.CD'}, country:{id:'CN'}, countryiso3code:'CHN',date:'2025', value: 19498039390000 };
const lot = worldBankInventoryLot({ sourceId,fromYear:'2025',throughYear:'2025',
 response:[{page:1,pages:1,per_page:200,total:1},[row]], observedAt:when, asOf:'2026-10-21' });
function store(data = lot) { let current=data; return { async read({digest}) { return digest === current?.digest ? current : undefined }, update(x) { current=x } }; }

test('only the exact digest may be specified by a paid-read buyer', () => {
 assert.deepEqual(internationalLotReadRequest({lotDigest:lot.digest}),{lotDigest:lot.digest});
 for (const invalid of [null, {}, {lotDigest:'bad'}, {lotDigest:lot.digest,sourceUrl:'https://attacker.example'}, {lotDigest:lot.digest,price:'0.00'}]) {
  assert.throws(()=>internationalLotReadRequest(invalid),/exact canonical/);
 }
});
test('seller admits only a fresh available and source-qualified immutable World Bank lot', async()=>{
 const lotStore=store(); const handlers=createInternationalPaidReadHandlers({lotStore,now:()=>clock});
 assert.deepEqual(await handlers.admit({request:{body:{lotDigest:lot.digest}}}),{admitted:true,digest:lot.digest,sourceId,records:1});
 await assert.rejects(handlers.admit({request:{body:{lotDigest:'sha256:'+'f'.repeat(64)}}}),/unavailable/);
 await assert.rejects(createInternationalPaidReadHandlers({lotStore,now:()=>clock+60*24*3600_000}).admit({request:{body:{lotDigest:lot.digest}}}),/expired/);
 await assert.rejects(createInternationalPaidReadHandlers({lotStore,now:()=>clock-24*3600_000}).admit({request:{body:{lotDigest:lot.digest}}}),/observed/);
 await assert.rejects(createInternationalPaidReadHandlers({lotStore,now:()=>Date.parse('2027-02-01T03:00:00Z'), maxAgeMs:366*24*3600_000}).admit({request:{body:{lotDigest:lot.digest}}}),/rights review/);
});
test('execution rechecks the same lot after independently proven settlement',async()=>{
 const lotStore=store();const h=createInternationalPaidReadHandlers({lotStore,now:()=>clock});
 const returned=await h.execute({intent:{request:{lotDigest:lot.digest}}});
 assert.equal(returned.lot.sourceId,'wdi-cn-gdp');
 assert.match(returned.consideration,/no exclusive/);
 assert.equal(returned.lot.sales.payment,null);
 returned.lot.records[0].value=0;
 assert.equal(lot.records[0].value,19498039390000);
 lotStore.update({...lot,records:[{year:'2025',value:22}]});
 await assert.rejects(h.execute({intent:{request:{lotDigest:lot.digest}}}),/digest/);
});
test('raster candidates cannot pass a World Bank paid-data gate',async()=>{
 const candidate=chirpsV3AfricaAsset({day:'2025-08-01',asOf:'2026-10-21'});
 const lotStore={read:async()=>candidate};
 await assert.rejects(createInternationalPaidReadHandlers({lotStore,now:()=>clock}).admit({request:{body:{lotDigest:lot.digest}}}),/World Bank lot/);
});
test('composition delegates payment and receipts ONLY to original Red Cup x402 actor', async()=>{
 let settings;const makeActor=async opts=>{settings=opts;return {operation:opts.operation,offer:opts.offer}};
 const actor=await createInternationalPaidReadActor({
  lotStore:store(), sellerOffer:{seller:'genuine-qualified-merchant'},
  priceTerms:{network:'eip155:8453',amount:'50000',asset:'0x'+'11'.repeat(20),payTo:'0x'+'22'.repeat(20)},
  append:async()=>{},recoveredRecords:{intents:new Map(),terminals:new Map()},now:()=>clock,
  actorFactory:makeActor,paymentBoundaryFactory:()=>({middleware:()=>{}})
 });
 assert.equal(actor.operation,'read-data');
 assert.equal(settings.basePath,'/x402/international-data');
 assert.equal(settings.offer.kind,'QualifiedWorldBankIndicatorPaidRead');
 assert.equal(settings.paymentIdentity,undefined);
 assert.equal((await settings.execute({intent:{request:{lotDigest:lot.digest}}})).lot.digest,lot.digest);
});
