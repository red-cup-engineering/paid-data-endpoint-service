import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {refreshArxivSourceEditions} from '../scripts/refresh-arxiv-source-editions.mjs';
const OAI='http://www.openarchives.org/OAI/2.0/';
const AX='http://arxiv.org/OAI/arXiv/';
const e=(name,attrs={},...children)=>({kind:'element',name,attributes:attrs,children:children.flat()});
const t=value=>({kind:'text',value});
const x=(name,value)=>e(name,{},t(value));
const paper=(title='Sheaves and nuclei',date='2026-10-26')=>e('record',{},
  e('header',{},x('identifier','oai:arXiv.org:2610.01234'),x('datestamp',date)),
  e('metadata',{},e('arXiv',{xmlns:AX},x('id','2610.01234'),x('created','2026-10-26'),
    e('authors',{},e('author',{},x('keyname','Wang'),x('forenames','Mei'))),
    x('title',title),x('categories','math.CT'),x('abstract','Categorical closure from witnessed data.'))));
function doc({title='Sheaves and nuclei',date='2026-10-26',responseDate='2026-10-27T12:00:00Z',token=null}={}){
 const p=paper(title,date);
 const root=e('OAI-PMH',{xmlns:OAI},x('responseDate',responseDate),e('ListRecords',{},p,
   ...(token===null?[]:[e('resumptionToken',{expirationDate:'2026-10-28T00:00:00Z'},t(token))])));
 return {kind:'document',children:[root]};
}
function store(){const map=new Map();return {map,async write({body}) {const b=Buffer.from(body),sha256=createHash('sha256').update(b).digest('hex');map.set(sha256,b);return {sha256,byteLength:b.length}},async read({sha256}){return {body:map.get(sha256)}}};}
const config={set:'math:math:CT',bootstrapFrom:'2026-10-26'};
const at='2026-10-27T13:00:00Z';
async function env(fn){const dir=await mkdtemp(join(tmpdir(),'arxiv-receive-'));try{return await fn({dir,statePath:join(dir,'latest.json')})}finally {await rm(dir,{recursive:true,force:true})}}
function io({docs=[doc()],bytes=['first'],got=[]}={}) {let at=0;const held=store();return {
 store:held,rateGate:async()=>async()=>{},
 fetchImpl:async u=>{got.push(u);return new Response(Buffer.from(bytes[at]??'overflow'),{status:200,headers:{'content-type':'text/xml'}})},
 parseXmlDocument:()=>docs[at++]??doc(),
 };}

test('witnessed source page commits atomic state; next cycle replays without duplicate',async()=>env(async({statePath})=>{
 const calls=[],opts=io({got:calls});
 const first=await refreshArxivSourceEditions({statePath,source:config,observedAt:at,...opts});
 assert.equal(first.records.length,1);assert.equal(first.changes.length,1);
 assert.equal(first.changes[0].kind,'observed');
 assert.equal(first.sourceCandidates.length,1);
 assert.equal(first.sourceCandidates[0].subject,'arxiv:2610.01234');
 assert.equal(first.sourceCandidates[0].provenance.source,first.sourcePages[0].requestUrl);
 assert.equal(first.coverage.complete,true);
 assert.equal(first.editorialStatus,'not-approved');assert.equal(first.merchantSettlement,null);
 assert.equal(first.from,'2026-10-26');assert.equal(first.sourcePages.length,1);
 assert.equal(first.records[0].sourceResponseAt,'2026-10-27T12:00:00Z');
 const saved=JSON.parse(await readFile(statePath,'utf8'));
 assert.equal(saved.records[0].subject,'arxiv:2610.01234');
 const again=await refreshArxivSourceEditions({statePath,source:config,observedAt:'2026-10-28T12:00:00Z',...opts});
 assert.equal(again.changes.length,0);
 assert.equal(again.sourceCandidates.length,0);
 assert.equal(again.from,'2026-10-26');
 assert.equal(calls.length,2);
}));
test('partial OAI page budget leaves previous accepted state bytes unchanged',async()=>env(async({statePath})=>{
 await refreshArxivSourceEditions({statePath,source:config,observedAt:at,...io()});
 const before=await readFile(statePath,'utf8');
 const opts=io({docs:[doc({title:'Another paper',responseDate:'2026-10-28T12:00:00Z',token:'next'})]});
 await assert.rejects(refreshArxivSourceEditions({statePath,source:config,observedAt:'2026-10-28T13:00:00Z',maxPages:1,...opts}),/page budget exhausted/);
 assert.equal(await readFile(statePath,'utf8'),before);
}));
test('multiple original OAI pages preserve identity and source-bytes receipts',async()=>env(async({statePath})=>{
 const docs=[doc({token:'next'}),doc({responseDate:'2026-10-27T12:01:00Z'})];
 const got=[],opts=io({docs,bytes:['p1','p2'],got});
 const state=await refreshArxivSourceEditions({statePath,source:config,observedAt:at,maxPages:2,...opts});
 assert.equal(got.length,2);assert.equal(new URL(got[1]).searchParams.get('resumptionToken'),'next');
 assert.equal(state.coverage.pagesRead,2);assert.equal(state.records.length,1);
 assert.equal(state.changes.length,1);assert.equal(state.sourcePages.length,2);
 assert.ok(state.sourcePages.every(p=>p.sourceDigest.startsWith('sha256:')));
}));
test('invalid source declaration and cross-set prior state refuse before acquisition',async()=>env(async({statePath})=>{
 await refreshArxivSourceEditions({statePath,source:config,observedAt:at,...io()});
 const opts=io();
 await assert.rejects(refreshArxivSourceEditions({statePath,source:{set:'cs:cs:AI',bootstrapFrom:'2026-10-26'},observedAt:at,...opts}),/matching observation/);
 await assert.rejects(refreshArxivSourceEditions({statePath,source:{...config,bootstrapFrom:'2026-02-30'},observedAt:at,...opts}),/real bootstrap/);
}));
