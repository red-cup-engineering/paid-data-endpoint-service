import test from 'node:test';
import assert from 'node:assert/strict';
import { admitNewswirePaidQueryRequest, createNewswirePaidQueryHandlers, createNewswirePaidQueryActor } from '../src/paid-newswire-query.mjs';

const digest = c => 'sha256:' + c.repeat(64);
const snapshotDigest = digest('a');
const NOW = Date.parse('2026-10-22T12:00:00Z');
const validQuery = { topics: ['public-policy'], limit: 2, withProvenance: true };
const snap = () => ({
  digest: snapshotDigest,
  wireUri: 'https://filum.example.org/policy',
  verifiedAt: '2026-10-22T11:20:00Z',
  public: [
    { subject: 'data:event-1', headline: 'Document updated', isPublic: true, keywords: ['public-policy'], url: 'https://filum.example.org/policy/1' },
  ],
});

function harness(overrides = {}) {
  const calls = [];
  let snapshot = snap();
  const store = {
    async read({digest}) { calls.push(['read', digest]); return digest === snapshotDigest ? snapshot : undefined; },
    change(value) { snapshot = value; },
  };
  const functions = {
    snapshotStore: store,
    verifySnapshot: async ({snapshot: value,digest}) => {calls.push(['verify',digest]);return value.digest === snapshotDigest && digest === value.digest && value.public[0]?.isPublic === true;},
    admitQuery: query => { calls.push(['schema', query]); if (!Array.isArray(query.topics) || query.topics.length !== 1) throw new TypeError('topic query refused'); return query; },
    queryReleased: async (_wire, q) => {calls.push(['query',q]);return {kind:'query-result',items:[{subject:'data:event-1'}], returnedCount:1, totalMatched:1, truncated:false};},
    qualifyRights: async ({stage,invocationContext}) => {calls.push(['rights',stage,invocationContext]);return {admitted:true,evidenceUri:'https://example.org/rights/wire',expiresAt:'2026-10-25T00:00:00Z'};},
    authorizeRequest: async ({stage,invocationContext}) => {calls.push(['authorize',stage,invocationContext]);return {admitted:true};},
    now: () => NOW,
    maxSnapshotAgeMs: 3600_000,
    ...overrides,
  };
  return { calls, store, handlers: createNewswirePaidQueryHandlers(functions), functions };
}

const request = () => ({ snapshotDigest, query:structuredClone(validQuery) });

test('request is exact immutable snapshot plus bounded original Newswire query, no buyer-supplied payment hints', () => {
  assert.deepEqual(admitNewswirePaidQueryRequest(request()), request());
  for (const bad of [null, [], {}, {snapshotDigest}, {snapshotDigest:'none',query:validQuery},
    {...request(), fakePrice:'0'}, {...request(), query:'hack'}, {...request(), query:{q:'A'.repeat(5000)}},
    {...request(), query:[]}, {snapshotDigest:digest('b'),query:validQuery, payee:'0x123'}]) {
    assert.throws(() => admitNewswirePaidQueryRequest(bad), /exactly|object|4096/);
  }
});

test('pre-payment admission validates schema, exact snapshot, original rights and request principal', async () => {
  const {handlers,calls} = harness();
  const httpRequest = {body:request(),headers:{authorization:'Bearer example'}};
  assert.deepEqual(await handlers.admit({request:httpRequest}), {admitted:true,snapshotDigest});
  assert.deepEqual(calls.map(x=>x[0]), ['schema','read','verify','rights','authorize']);
  assert.strictEqual(calls.at(-1)[2].request,httpRequest);
  assert.equal(calls.some(x=>x[0]==='query'),false, 'no expensive query before payment');
});

test('paid fulfillment re-reads exact signed request, requalifies rights, passes settlement for authorization', async () => {
  const {handlers,calls} = harness();
  await handlers.admit({request:{body:request()}});
  const settlement = {transaction:'0xsettled',verified:true};
  const delivered = await handlers.execute({intent:{request:request()}, settlement});
  assert.equal(delivered.type,'NewswirePaidQueryDelivery');
  assert.equal(delivered.snapshotDigest,snapshotDigest);
  assert.equal(delivered.result.items[0].subject,'data:event-1');
  assert.equal(delivered.qualifiedRightsEvidence,'https://example.org/rights/wire');
  assert.equal(delivered.paymentReceipt,null);
  assert.deepEqual(calls.map(x=>x[0]), ['schema','read','verify','rights','authorize','schema','read','verify','rights','authorize','query']);
  assert.strictEqual(calls.at(-2)[2].settlement,settlement);
});

test('source revocation between pre-payment and settlement prevents delivery', async () => {
  let allowed=true;
  const {handlers,calls} = harness({
    qualifyRights:async()=> allowed ? {admitted:true,evidenceUri:'https://example.org/rights',expiresAt:'2026-10-25T00:00:00Z'} : {admitted:false},
  });
  await handlers.admit({request:{body:request()}});
  allowed=false;
  await assert.rejects(handlers.execute({intent:{request:request()}}),/distribution has not been authorized/);
  assert.equal(calls.some(c=>c[0]==='query'),false);
});

test('content substitution between admission and execution prevents delivery', async () => {
  const {handlers,store,calls} = harness();
  await handlers.admit({request:{body:request()}});
  store.change({...snap(), public:[{subject:'made-up',isPublic:false}]});
  await assert.rejects(handlers.execute({intent:{request:request()}}),/unverified/);
  assert.equal(calls.some(c=>c[0]==='query'),false);
});

test('no rights, no original merchant grant, missing source or expiration fail closed', async () => {
  for (const overrides of [
    {qualifyRights: async () => ({admitted:false})},
    {qualifyRights: async () => ({admitted:true,evidenceUri:'http://insecure.example/rights',expiresAt:'2026-10-25T00:00:00Z'})},
    {qualifyRights: async () => ({admitted:true,evidenceUri:'https://example.org/rights',expiresAt:'2026-10-22T11:00:00Z'})},
    {authorizeRequest: async () => ({admitted:false})},
    {snapshotStore: {read:async()=>undefined}},
    {verifySnapshot:async()=>false},
    {now:()=> NOW+86_400_000},
    {now:()=> NOW-3600_000},
  ]) {
    const {handlers} = harness(overrides);
    await assert.rejects(handlers.admit({request:{body:request()}}));
  }
});

test('the original Newswire defines the allowed query, never another seller-side selector', async () => {
  const {handlers,calls}=harness();
  await assert.rejects(handlers.admit({request:{body:{...request(),query:{arbitrary:true}}}}),/topic query refused/);
  assert.deepEqual(calls.map(x=>x[0]),['schema']);
});

test('the original Newswire output must be bounded and structurally consistent', async () => {
  for (const result of [
    {items:[],returnedCount:1},
    {items:[],returnedCount:101},
    {items:'not-an-array',returnedCount:1},
    {items:Array.from({length:101},(_,i)=>({subject:'s'+i})),returnedCount:101},
  ]) {
    const {handlers} = harness({queryReleased: async()=>result});
    await assert.rejects(handlers.execute({intent:{request:request()}}),/unbounded or inconsistent/);
  }
});

test('a separate original merchant controls x402 quote, payee, rails, journal and receipt', async () => {
  let captured;
  const priceTerms = {network:'eip155:8453',amount:'50000',asset:'0x'+ 'a'.repeat(40),payTo:'0x'+ 'b'.repeat(40)};
  const paymentBoundaryFactory = ()=>({middleware:()=>{}});
  const {functions} = harness();
  const append = async () =>{};
  const recoveredRecords={intents:new Map(),terminals:new Map()};
  const actor = await createNewswirePaidQueryActor({
    ...functions,
    sellerOffer:{merchant:'original-seller'}, priceTerms, append, recoveredRecords,
    actorFactory:async opt => {captured=opt;return {operation:opt.operation, basePath:opt.basePath}},
    paymentBoundaryFactory,
  });
  assert.deepEqual(actor,{operation:'read-data',basePath:'/x402/newswire/query'});
  assert.strictEqual(captured.priceTerms,priceTerms);
  assert.strictEqual(captured.append,append);
  assert.strictEqual(captured.recoveredRecords,recoveredRecords);
  assert.strictEqual(captured.paymentBoundaryFactory,paymentBoundaryFactory);
  assert.match(captured.offer.consideration,/Value-added/);
  assert.equal(captured.offer.noExclusiveRightsToPublicFacts,true);
  await assert.deepEqual(await captured.admit({request:{body:request()}}),{admitted:true,snapshotDigest});
});

test('missing source seller, journal, merchant policies or bounds refuse at construction', async () => {
  for(const props of [
    {snapshotStore:null}, {verifySnapshot:null},{admitQuery:undefined},{queryReleased:null},
    {qualifyRights:null},{authorizeRequest:undefined},{maxSnapshotAgeMs:2},
  ]) assert.throws(()=>createNewswirePaidQueryHandlers({...harness().functions,...props}));
  const fx=harness().functions;
  await assert.rejects(createNewswirePaidQueryActor({...fx,sellerOffer:null,actorFactory:async()=>({})}));
  await assert.rejects(createNewswirePaidQueryActor({...fx,sellerOffer:{},append:async()=>{},recoveredRecords:{intents:[],terminals:new Map()},actorFactory:async()=>({})}));
});
