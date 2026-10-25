import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admitNewswireSubscriptionRequest, createNewswireSubscriptionQueryHandlers } from '../src/newswire-subscription.mjs';
import { createNewswireCommerce } from '../src/newswire-commerce.mjs';

const digest = character => 'sha256:' + character.repeat(64);
const NOW = Date.parse('2026-10-25T12:00:00Z');
const WIRE = 'https://filum.example.org/policy';
const snapshot = () => ({
  digest: digest('a'), wireUri: WIRE, verifiedAt: '2026-10-25T11:00:00Z',
  public: [{subject:'urn:news:one',url:WIRE+'/one',headline:'An admitted update',summary:'Source-qualified summary.',keywords:['policy'],isPublic:true}],
});
const entitlement = () => ({
  admitted:true, subscriptionId:'urn:subscription:one', subscriber:'urn:customer:one',
  revision:digest('b'), contractRef:'urn:contract:one', status:'active',
  notBefore:'2026-10-01T00:00:00Z', expiresAt:'2026-11-01T00:00:00Z', wireUri:WIRE,
  profiles:[{
    id:'policy', channels:['machine-data','newsletter','social'],
    query:{topics:['policy'],withProvenance:true,withData:true},
    maxPageSize:2,maxOffset:20,maxResponseBytes:16*1024,
  }],
});
const request = (channel='machine-data', changes={}) => ({
  headers:{authorization:'Bearer test-secret'},
  body:{snapshotDigest:digest('a'),subscriptionId:'urn:subscription:one',profileId:'policy',channel,...changes},
});
const queryResult = () => ({
  items:[{subject:'urn:news:one',headline:'An admitted update',summary:'Source-qualified summary.',data:{count:7}}],
  returnedCount:1,totalMatched:1,truncated:false,
});
const rendition = delivery => ({
  snapshotDigest:delivery.snapshotDigest, subjects:delivery.result.items.map(item=>item.subject),
  editionUri:'urn:edition:newsletter:one', publicationReceiptUri:'https://editor.example.org/receipts/one',
  mediaType:'text/plain',body:delivery.result.items.map(item=>item.headline+'\n'+item.summary).join('\n\n'),
});

function harness(overrides={}) {
  const calls=[];
  let grant=entitlement(), held=snapshot(), at=NOW;
  const functions={
    snapshotStore:{read:async({digest:requested})=>{calls.push(['read',requested]);return held;}},
    verifySnapshot:async({snapshot:row,digest:requested})=>row.digest===requested,
    admitQuery:q=>{calls.push(['admit-query',q]);assert.deepEqual(q.topics,['policy']);return q;},
    queryReleased:async(wire,q)=>{calls.push(['query',q,wire]);return queryResult();},
    qualifyRights:async context=>{calls.push(['rights',context.stage,context.invocationContext.channel]);return {admitted:true,evidenceUri:'https://rights.example.org/one',expiresAt:'2026-11-01T00:00:00Z'};},
    authorizeRequest:async context=>{calls.push(['merchant',context.stage,context.invocationContext.channel]);return {admitted:true};},
    authenticateSubscriber:async({request:incoming})=>{calls.push(['authenticate']);assert.equal(incoming.headers.authorization,'Bearer test-secret');return 'urn:customer:one';},
    resolveSubscription:async args=>{calls.push(['subscription',args.stage]);return structuredClone(grant);},
    renderRendition:async({channel,delivery})=>{calls.push(['render',channel,delivery.snapshotDigest]);return rendition(delivery);},
    verifyRendition:async({channel})=>{calls.push(['editor',channel]);return true;},
    now:()=>at,
    ...overrides,
  };
  return {
    calls, functions, handlers:createNewswireSubscriptionQueryHandlers(functions),
    grant:()=>grant, changeGrant:value=>{grant=value;}, changeSnapshot:value=>{held=value;}, advance:value=>{at=value;},
  };
}

test('subscriber requests select bounded products without supplying identity, predicates or grants',()=>{
  const admitted=admitNewswireSubscriptionRequest(request().body);
  assert.equal(admitted.offset,0);
  for(const changes of [
    {query:{topics:['private']}},{subscriber:'urn:customer:other'}, {grant:entitlement()},
    {channel:'all'}, {snapshotDigest:'latest'}, {limit:0}, {offset:-1}, {offset:null}, {offset:10_001},
  ]) assert.throws(()=>admitNewswireSubscriptionRequest({...request().body,...changes}));
});

test('machine delivery uses original query and rechecks current subscription and rights without payment',async()=>{
  const h=harness();
  const delivered=await h.handlers.execute({request:request('machine-data',{limit:1,offset:2})});
  assert.equal(delivered.type,'NewswireSubscriptionDelivery');
  assert.equal(delivered.snapshotDigest,digest('a'));
  assert.equal(delivered.result.items[0].data.count,7);
  assert.equal(delivered.paymentReceipt,null);
  assert.deepEqual(h.calls.filter(row=>row[0]==='subscription').map(row=>row[1]),['subscription-query','subscription-delivery']);
  assert.deepEqual(h.calls.filter(row=>row[0]==='rights').map(row=>row.slice(1)),[['subscription-query','machine-data'],['subscription-delivery','machine-data']]);
  assert.equal(h.calls.filter(row=>row[0]==='authenticate').length,2);
  const query=h.calls.find(row=>row[0]==='query')[1];
  assert.deepEqual(query,{topics:['policy'],withProvenance:true,withData:true,limit:1,offset:2});
  assert.equal(h.calls.some(row=>row[0]==='render'),false);
  assert.equal(JSON.stringify(delivered).includes('test-secret'),false);
  assert.equal(JSON.stringify(delivered).includes('urn:customer:one'),false);
});

test('newsletter and social forms receive the same release and source identities through original editorial owners',async()=>{
  const h=harness();
  const machine=await h.handlers.execute({request:request()});
  for(const channel of ['newsletter','social']) {
    const human=await h.handlers.execute({request:request(channel)});
    assert.equal(human.snapshotDigest,machine.snapshotDigest);
    assert.deepEqual(human.rendition.subjects,machine.result.items.map(item=>item.subject));
    assert.equal(human.rendition.body,'An admitted update\nSource-qualified summary.');
    assert.equal(Object.hasOwn(human,'result'),false);
    assert.equal(human.subscriptionRevision,machine.subscriptionRevision);
  }
  assert.deepEqual(h.calls.filter(row=>row[0]==='editor').map(row=>row[1]),['newsletter','social']);
});

test('one current subscription reads later immutable releases without minting another contract',async()=>{
  const h=harness();
  const original=await h.handlers.execute({request:request()});
  h.changeSnapshot({...snapshot(),digest:digest('c')});
  const later=await h.handlers.execute({request:request('machine-data',{snapshotDigest:digest('c')})});
  assert.equal(later.subscriptionRevision,original.subscriptionRevision);
  assert.notEqual(later.snapshotDigest,original.snapshotDigest);
});

test('wrong customer, inactive subscription, resource and unscoped notification contract refuse before query',async()=>{
  for(const change of [
    {subscriber:'urn:customer:other'},{admitted:false},{status:'revoked'},
    {wireUri:'https://other.example.org/wire'},{profiles:undefined},
    {notBefore:'2026-10-26T00:00:00Z'},{expiresAt:'2026-10-25T12:00:00Z'},
    {expiresAt:'2026-02-30T00:00:00Z'},{contractRef:'https://user:secret@example.org/contract'},
  ]) {
    const h=harness();h.changeGrant({...entitlement(),...change});
    await assert.rejects(h.handlers.execute({request:request()}));
    assert.equal(h.calls.some(row=>row[0]==='query'),false);
  }
});

test('the exact profile controls channels, pagination and a nonempty explicit query',async()=>{
  for(const changedRequest of [{profileId:'private'},{limit:3},{offset:21}]) {
    const h=harness();await assert.rejects(h.handlers.execute({request:request('machine-data',changedRequest)}));
    assert.equal(h.calls.some(row=>row[0]==='query'),false);
  }
  for(const change of [{channels:['machine-data']},{query:{topics:['policy'],limit:1}},{maxPageSize:0},{maxOffset:10001},{maxResponseBytes:0}]) {
    const h=harness();const grant=entitlement();Object.assign(grant.profiles[0],change);h.changeGrant(grant);
    await assert.rejects(h.handlers.execute({request:request('newsletter')}));
  }
});

test('cancellation during rendering prevents delivery after the original work completes',async()=>{
  const h=harness({renderRendition:async({delivery})=>{
    h.changeGrant({...entitlement(),status:'revoked'});return rendition(delivery);
  }});
  await assert.rejects(h.handlers.execute({request:request('newsletter')}),/inactive/);
  assert.equal(h.calls.some(row=>row[0]==='editor'),true);
});

test('expiry during rendering refuses even when a cached grant still says active',async()=>{
  const h=harness({renderRendition:async({delivery})=>{h.advance(Date.parse('2026-11-01T00:00:00Z'));return rendition(delivery);}});
  await assert.rejects(h.handlers.execute({request:request('newsletter')}),/expired|validity/);
});

test('renewal or changed scope during rendering requires a fresh request',async()=>{
  for(const change of [grant=>{grant.revision=digest('c');},grant=>{grant.profiles[0].maxPageSize=1;}]) {
    const h=harness({renderRendition:async({delivery})=>{const grant=entitlement();change(grant);h.changeGrant(grant);return rendition(delivery);}});
    await assert.rejects(h.handlers.execute({request:request('newsletter')}),/revision or scope changed/);
  }
});

test('source rights and current authentication are re-observed before return',async()=>{
  let rights=true;
  const h=harness({
    qualifyRights:async()=>rights?{admitted:true,evidenceUri:'https://rights.example.org/one',expiresAt:'2026-11-01T00:00:00Z'}:{admitted:false},
    renderRendition:async({delivery})=>{rights=false;return rendition(delivery);},
  });
  await assert.rejects(h.handlers.execute({request:request('social')}),/distribution has not been authorized/);
  let authCalls=0;
  const identity=harness({authenticateSubscriber:async()=>++authCalls===1?'urn:customer:one':'urn:customer:other'});
  await assert.rejects(identity.handlers.execute({request:request()}),/subscriber changed/);
});

test('a changed immutable release cannot be substituted while a rendition is prepared',async()=>{
  const h=harness({renderRendition:async({delivery})=>{h.changeSnapshot({...snapshot(),digest:digest('c')});return rendition(delivery);}});
  await assert.rejects(h.handlers.execute({request:request('newsletter')}),/unverified/);
});

test('editorial output must preserve the exact snapshot, unique subjects and accepted publication reference',async()=>{
  for(const change of [
    {snapshotDigest:digest('c')},{subjects:['urn:news:other']},{subjects:['urn:news:one','urn:news:one']},
    {editionUri:''},{publicationReceiptUri:'https://user:secret@example.org/receipt'},
    {mediaType:'application/javascript'},{body:{text:'not a rendition'}},
  ]) {
    const h=harness({renderRendition:async({delivery})=>({...rendition(delivery),...change})});
    await assert.rejects(h.handlers.execute({request:request('newsletter')}));
    assert.equal(h.calls.some(row=>row[0]==='editor'),false);
  }
  await assert.rejects(harness({verifyRendition:async()=>false}).handlers.execute({request:request('social')}),/editorial authority/);
});

test('bounded response includes envelope overhead and ignores private renderer metadata',async()=>{
  const h=harness({renderRendition:async({delivery})=>({...rendition(delivery),credential:'provider-private-secret'})});
  const delivered=await h.handlers.execute({request:request('newsletter')});
  assert.equal(JSON.stringify(delivered).includes('provider-private-secret'),false);
  const big=harness({renderRendition:async({delivery})=>({...rendition(delivery),body:'x'.repeat(1024)})});
  const grant=entitlement();grant.profiles[0].maxResponseBytes=1024;big.changeGrant(grant);
  await assert.rejects(big.handlers.execute({request:request('newsletter')}),/response byte budget/);
});

test('absent editorial owners preserve machine access and refuse human renditions',async()=>{
  const h=harness({renderRendition:undefined,verifyRendition:undefined});
  assert.equal((await h.handlers.execute({request:request()})).result.returnedCount,1);
  await assert.rejects(h.handlers.execute({request:request('newsletter')}),/not configured/);
  assert.throws(()=>harness({verifyRendition:undefined}),/verifyRendition/);
  for(const change of [{resolveSubscription:undefined},{authenticateSubscriber:undefined},{authorizeRequest:undefined}])
    assert.throws(()=>harness(change),/original injected/);
});

test('an overproducing query cannot enlarge the subscriber page or editorial source count',async()=>{
  const h=harness({queryReleased:async()=>({items:[{subject:'urn:news:one'},{subject:'urn:news:two'}],returnedCount:2,totalMatched:2,truncated:false})});
  h.changeSnapshot({...snapshot(),public:[...snapshot().public,{...snapshot().public[0],subject:'urn:news:two'}]});
  await assert.rejects(h.handlers.execute({request:request('newsletter',{limit:1})}),/page limit/);
  assert.equal(h.calls.some(row=>row[0]==='render'),false);
});

test('policy callbacks cannot enlarge the owned contract projection or change the delivery channel',async()=>{
  const h=harness({authorizeRequest:async({invocationContext:context})=>{
    assert.equal(Reflect.set(context,'channel','social'),false);
    assert.equal(Reflect.set(context.subscription.selected,'maxPageSize',100),false);
    assert.equal(Reflect.set(context.subscription.selected.channels,'0','private'),false);
    assert.equal(Reflect.set(context.subscription.selected.query.topics,'0','private'),false);
    return {admitted:true};
  }});
  const delivered=await h.handlers.execute({request:request()});
  assert.equal(delivered.channel,'machine-data');
  assert.equal(delivered.result.returnedCount,1);
});

test('commerce composes real create-only release custody with both subscription and original x402 handlers',async()=>{
  const root=await mkdtemp(join(tmpdir(),'newswire-subscription-'));
  try {
    const h=harness();let paid;
    const commerce=await createNewswireCommerce({
      ...h.functions,releaseRoot:root,verifyEditorialRelease:async()=>true,now:()=>new Date(NOW).toISOString(),
      sellerOffer:{merchant:'original-seller'},priceTerms:{amount:'source-owned'},append:async()=>{},
      recoveredRecords:{intents:new Map(),terminals:new Map()},
      actorFactory:async options=>{paid=options;return {operation:options.operation};},paymentBoundaryFactory:()=>({}),
      subscriptionAccess:{
        authenticateSubscriber:h.functions.authenticateSubscriber,resolveSubscription:h.functions.resolveSubscription,
        renderRendition:h.functions.renderRendition,verifyRendition:h.functions.verifyRendition,
        // The composition must not allow replacing its original release store.
        snapshotStore:{read:async()=>{throw new Error('substituted subscription store');}},
      },
    });
    const wire={masthead:{siteUrl:WIRE},public:[{
      ...snapshot().public[0],kind:'data-bulletin',data:{count:7},
      provenance:{editionUri:'urn:edition:one',publicationReceiptUri:'https://editor.example.org/receipt',
        sources:[{uri:'https://source.example.org/one',digest:digest('d'),licenseUri:'https://source.example.org/license',
          rightsEvidenceUri:'https://rights.example.org/one',observedAt:'2026-10-25T11:00:00Z'}]},
    }]};
    const released=await commerce.onRelease(wire);
    assert.deepEqual(await commerce.snapshotStore.read({digest:released.digest}),released);
    const subscribed=await commerce.subscriptions.execute({request:request('machine-data',{snapshotDigest:released.digest})});
    const paidDelivery=await paid.execute({intent:{request:{snapshotDigest:released.digest,query:{topics:['policy'],limit:2}}},settlement:{verified:true}});
    assert.equal(subscribed.snapshotDigest,paidDelivery.snapshotDigest);
    assert.deepEqual(subscribed.result,paidDelivery.result);
    assert.equal(commerce.seller.operation,'read-data');
  } finally { await rm(root,{recursive:true,force:true}); }
});
