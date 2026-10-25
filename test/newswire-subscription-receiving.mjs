// Native supplier/consumer contract assay. The argument names the original
// Newswire module selected by its owner; no selector or renderer is copied here.
// Run: node test/newswire-subscription-receiving.mjs /absolute/path/query.mjs /absolute/path/knowledge-base.mjs /absolute/path/newsletter-issue.mjs
// Source and contract approvals are explicit fixtures, not commercial grants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createNewswireReleaseStore } from '../src/newswire-release-store.mjs';
import { createNewswireSubscriptionQueryHandlers } from '../src/newswire-subscription.mjs';

const modulePath = process.argv[2];
const craftPath = process.argv[3];
const newsletterPath = process.argv[4];
if (!modulePath || !isAbsolute(modulePath)) throw new Error('provide the exact original Newswire query module path');
if (!craftPath || !isAbsolute(craftPath)) throw new Error('provide the exact original SignCraft knowledge-base module path');
if (!newsletterPath || !isAbsolute(newsletterPath)) throw new Error('provide the exact original newsletter renderer module path');
const {admitNewswireQuery, queryPublicNewswire} = await import(pathToFileURL(modulePath));
const {KnowledgeBase} = await import(pathToFileURL(craftPath));
const {validateIssue,renderMarkdown,renderPasteHtml} = await import(pathToFileURL(newsletterPath));
assert.equal(typeof admitNewswireQuery,'function');
assert.equal(typeof queryPublicNewswire,'function');
assert.equal(typeof KnowledgeBase.fromRelationalValues,'function');
assert.equal(typeof validateIssue,'function');
assert.equal(typeof renderMarkdown,'function');
assert.equal(typeof renderPasteHtml,'function');

function issueFor(delivery) {
  return {
    title:'Received source updates',dek:'An assay of the same admitted Newswire release.',
    sections:delivery.result.items.map((item,index)=>({heading:item.headline,'body-markdown':item.summary,sources:['source'+index]})),
    references:Object.fromEntries(delivery.result.items.map((item,index)=>['source'+index,{id:'source'+index,type:'dataset',title:item.headline,URL:item.url}])),
  };
}

test('original SignCraft source graph, Newswire query, release custody and subscription scope retain one exact snapshot',async()=>{
  const root=await mkdtemp(join(tmpdir(),'newswire-original-receiving-'));
  try {
    const at='2026-10-25T12:00:00Z';
    const wireUri='https://filum.example.org/policy';
    const custody=createNewswireReleaseStore({root,now:()=>at,verifyRelease:async()=>true});
    const publicItems=[1,2,3].map(index=>({
      subject:'urn:news:'+index,url:wireUri+'/'+index,headline:'Admitted source '+index,
      summary:'A fixture received at the original source boundary.',keywords:['policy'],
      isPublic:true,kind:'data-bulletin',published:at,data:{count:index},
      provenance:{
        canonicalSubjectUri:'urn:news:'+index,editionUri:'urn:news-edition:'+index,
        processingActivityUri:'urn:processing:'+index,processingActorUri:'urn:processor:one',
        publicationActivityUri:'urn:publication:'+index,publicationActorUri:'urn:editor:one',
        publicationReceiptUri:'urn:publication-receipt:'+index,releasedAt:at,
        sources:[{uri:'https://source.example.org/'+index,digest:'sha256:'+String(index).repeat(64),
          licenseUri:'https://source.example.org/license',rightsEvidenceUri:'https://rights.example.org/source',observedAt:at}],
      },
    }));
    const released=await custody.publish({wire:{masthead:{siteUrl:wireUri},public:publicItems}});
    // The upstream knowledge owner ingests this one custody snapshot. The
    // merchant consumes its original release and does not own another graph.
    const held=await custody.read({digest:released.digest});
    const knowledge=KnowledgeBase.fromRelationalValues([{value:held,resource:wireUri,revision:released.digest}]);
    const roots=knowledge.queryToldClaims({predicate:'relational-value:root'},{limit:128});
    assert.equal(roots.total,1);
    const sourceRoot=roots.entries[0].cell;
    assert.ok(sourceRoot.for.some(witness=>witness.resource===wireUri && witness.revision===released.digest));
    const digestField=knowledge.queryToldClaims({token:sourceRoot.object,predicate:'field:digest'},{limit:128});
    assert.equal(digestField.total,1);
    const digestValue=knowledge.queryToldClaims({token:digestField.entries[0].cell.object,predicate:'relational-value:lexical'},{limit:128});
    assert.equal(digestValue.entries[0].cell.object,released.digest);
    const grant={
      admitted:true,subscriptionId:'urn:subscription:receiving',subscriber:'urn:customer:receiving',
      revision:'urn:contract-edition:receiving',contractRef:'urn:contract:receiving',status:'active',
      notBefore:'2026-10-01T00:00:00Z',expiresAt:'2026-11-01T00:00:00Z',wireUri,
      profiles:[{id:'policy-data',channels:['machine-data','newsletter','social'],query:{topics:['policy'],withData:true,withProvenance:true},maxPageSize:2,maxOffset:10,maxResponseBytes:65536}],
    };
    const handlers=createNewswireSubscriptionQueryHandlers({
      snapshotStore:custody,verifySnapshot:custody.verifySnapshot,
      admitQuery:admitNewswireQuery,queryReleased:queryPublicNewswire,now:()=>Date.parse(at),
      qualifyRights:async()=>({admitted:true,evidenceUri:'https://rights.example.org/source',expiresAt:grant.expiresAt}),
      authorizeRequest:async()=>({admitted:true}),
      authenticateSubscriber:async()=>grant.subscriber,resolveSubscription:async()=>grant,
      renderRendition:async({channel,delivery})=>({
        snapshotDigest:delivery.snapshotDigest,subjects:delivery.result.items.map(item=>item.subject),
        editionUri:'urn:assay-editorial-edition:'+channel,publicationReceiptUri:'urn:assay-editorial-receipt:'+channel,
        mediaType:channel==='newsletter'?'text/html':'text/markdown',
        body:channel==='newsletter'?renderPasteHtml(issueFor(delivery)):renderMarkdown(issueFor(delivery)),
      }),
      verifyRendition:async({channel,rendition,delivery})=>{
        const issue=issueFor(delivery);
        return validateIssue(issue).valid && rendition.body===(channel==='newsletter'?renderPasteHtml(issue):renderMarkdown(issue));
      },
    });
    const first=await handlers.execute({request:{body:{snapshotDigest:released.digest,subscriptionId:grant.subscriptionId,profileId:'policy-data',channel:'machine-data'}}});
    const next=await handlers.execute({request:{body:{snapshotDigest:released.digest,subscriptionId:grant.subscriptionId,profileId:'policy-data',channel:'machine-data',offset:first.result.nextOffset}}});
    assert.equal(first.result.returnedCount,2);
    assert.equal(next.result.returnedCount,1);
    assert.equal(first.result.totalMatched,3);
    assert.equal(next.result.hasMore,false);
    assert.equal(first.result.items[0].data.count,1);
    assert.equal(next.result.items[0].data.count,3);
    assert.equal(first.snapshotDigest,next.snapshotDigest);
    assert.equal(new Set([...first.result.items,...next.result.items].map(item=>item.subject)).size,3);
    const subjectFields=knowledge.queryToldClaims({predicate:'field:subject'},{limit:128});
    const sourceSubjects=subjectFields.entries.map(entry=>knowledge.queryToldClaims({token:entry.cell.object,predicate:'relational-value:lexical'},{limit:128}).entries[0].cell.object).sort();
    assert.deepEqual([...first.result.items,...next.result.items].map(item=>item.subject).sort(),sourceSubjects);
    assert.equal(first.snapshotDigest,sourceRoot.for[0].revision);
    assert.ok(first.result.provenance['@graph'].some(node=>node['@id']==='https://source.example.org/1'));
    for (const channel of ['newsletter','social']) {
      const human=await handlers.execute({request:{body:{snapshotDigest:released.digest,subscriptionId:grant.subscriptionId,profileId:'policy-data',channel}}});
      assert.equal(human.snapshotDigest,first.snapshotDigest);
      assert.equal(human.qualifiedRightsEvidence,first.qualifiedRightsEvidence);
      assert.deepEqual(human.rendition.subjects,first.result.items.map(item=>item.subject));
      assert.ok(human.rendition.body.includes('Admitted source 1'));
      assert.ok(human.rendition.body.includes('https://filum.example.org/policy/1'));
    }
    await assert.rejects(handlers.execute({request:{body:{snapshotDigest:released.digest,subscriptionId:grant.subscriptionId,profileId:'private',channel:'social'}}}),/profile\/channel/);
    grant.status='revoked';
    await assert.rejects(handlers.execute({request:{body:{snapshotDigest:released.digest,subscriptionId:grant.subscriptionId,profileId:'policy-data',channel:'machine-data'}}}),/inactive/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
