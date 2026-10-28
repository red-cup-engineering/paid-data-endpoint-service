import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  arxivOaiListUrl, parseArxivOaiDocument, acquireArxivOaiPage,
  advanceArxivWatch, arxivNewswireCandidates,
} from '../src/arxiv-oai-source.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const el=(name,attrs={},...children)=>({kind:'element',name,attributes:attrs,children:children.flat()});
const txt=value=>({kind:'text',value});
const oai='http://www.openarchives.org/OAI/2.0/';
const arxiv='http://arxiv.org/OAI/arXiv/';
const x=(name,value)=>el(name,{},txt(value));
function paper({id='2610.01234',title='Heyting sheaves and nuclei',abstract='A study of relational closure.',
  datestamp='2026-10-26',updated='2026-10-26',deleted=false,otherId=id}={}) {
  const header=el('header',deleted?{status:'deleted'}:{},x('identifier','oai:arXiv.org:'+id),x('datestamp',datestamp));
  if(deleted) return el('record',{},header);
  return el('record',{},header,el('metadata',{},el('arXiv',{xmlns:arxiv},
    x('id',otherId),x('created','2026-10-24'),x('updated',updated),
    el('authors',{},el('author',{},x('keyname','Wang'),x('forenames','Mei')),
      el('author',{},x('keyname','Smith'),x('forenames','A.'))),
    x('title',title),x('categories','math.CT cs.LO'),x('abstract',abstract),x('license','http://arxiv.org/licenses/nonexclusive-distrib/1.0/'))));
}
function page(records=[paper()], token=null,extra=[]){
  return {kind:'document',children:[el('OAI-PMH',{xmlns:oai},
    x('responseDate','2026-10-27T12:00:00Z'),el('request',{},txt('https://oaipmh.arxiv.org/oai')),
    el('ListRecords',{},...records,...(token===null?[]:[el('resumptionToken',{expirationDate:'2026-10-28T00:00:00Z'},txt(token))])),...extra)]};
}
function store(){const map=new Map();return {
  map,
  async write({body}){const bytes=Buffer.from(body),hash=sha(bytes);map.set(hash,bytes);return {sha256:hash,byteLength:bytes.length}},
  async read({sha256}) {const body=map.get(sha256);if(!body)throw new Error('missing original');return {body,sha256,byteLength:body.length}}
};}

test('OAI URL builder pins source, normalizes date and isolates opaque continuation token',()=>{
  const url=new URL(arxivOaiListUrl({set:'math:math:CT',from:'2026-10-26'}));
  assert.equal(url.origin,'https://oaipmh.arxiv.org');
  assert.equal(url.searchParams.get('metadataPrefix'),'arXiv');
  assert.equal(url.searchParams.get('set'),'math:math:CT');
  assert.equal(url.searchParams.get('from'),'2026-10-26');
  const later=new URL(arxivOaiListUrl({resumptionToken:'a+/b=='}));
  assert.equal(later.searchParams.get('resumptionToken'),'a+/b==');
  assert.equal(later.searchParams.has('metadataPrefix'),false);
  assert.throws(()=>arxivOaiListUrl({from:'2026-02-30'}),/real YYYY-MM-DD/);
  assert.throws(()=>arxivOaiListUrl({set:'../../etc'}),/invalid OAI set/);
  assert.throws(()=>arxivOaiListUrl({resumptionToken:'abc',set:'cs'}),/entire continuation/);
});

test('admitted real OAI-shaped metadata has stable article identity and separate metadata edition',()=>{
  const parsed=parseArxivOaiDocument(page());
  assert.equal(parsed.records.length,1);
  assert.equal(parsed.records[0].subject,'arxiv:2610.01234');
  assert.equal(parsed.records[0].url,'https://arxiv.org/abs/2610.01234');
  assert.deepEqual(parsed.records[0].authors,['Mei Wang','A. Smith']);
  assert.deepEqual(parsed.records[0].categories,['math.CT','cs.LO']);
  assert.equal(parsed.records[0].version,null); // no fictional vN
  assert.equal(parsed.records[0].datestamp,'2026-10-26');
  assert.match(parsed.records[0].editionDigest,/^sha256:[a-f0-9]{64}$/);
  assert.equal(parsed.resumptionToken,null);
  assert.equal(parsed.complete,true);
});

test('OAI set paging does not claim a complete harvest when token exists',()=>{
  const result=parseArxivOaiDocument(page([paper()], 'next-a/b=='));
  assert.equal(result.complete,false);
  assert.equal(result.resumptionToken,'next-a/b==');
  assert.equal(result.tokenExpires,'2026-10-28T00:00:00Z');
});

test('namespace spoofing, wrong source authority and identifier mismatches are refused',()=>{
  const spoof=page();spoof.children[0].attributes.xmlns='https://example.org/other';
  assert.throws(()=>parseArxivOaiDocument(spoof),/non-OAI-PMH/);
  assert.throws(()=>parseArxivOaiDocument(page([paper({otherId:'2610.08888'})])),/disagree/);
  assert.throws(()=>parseArxivOaiDocument(page([paper({id:'bad::id'})])),/identifier/);
});

test('unknown nested markup in author/title and duplicate subjects are refused',()=>{
  let p=page();const record=p.children[0].children.find(n=>n.name==='ListRecords').children[0];
  const metadata=record.children.find(n=>n.name==='metadata').children[0];
  const title=metadata.children.find(n=>n.name==='title');
  title.children=[el('script',{},txt('no'))];
  assert.throws(()=>parseArxivOaiDocument(p),/unexpected markup/);
  assert.throws(()=>parseArxivOaiDocument(page([paper(),paper()])),/duplicate source record/);
});

test('OAI noRecordsMatch and badResumptionToken do not silently become published paper data',()=>{
  const base=page([]);
  base.children[0].children=base.children[0].children.filter(n=>n.name!=='ListRecords');
  base.children[0].children.push(el('error',{code:'noRecordsMatch'},txt('No matching records')));
  assert.equal(parseArxivOaiDocument(base).records.length,0);
  base.children[0].children.at(-1).attributes.code='badResumptionToken';
  assert.throws(()=>parseArxivOaiDocument(base),/badResumptionToken/);
});

test('one paper can be corrected once and replayed identically without duplicate identities',()=>{
  const first=parseArxivOaiDocument(page()).records;
  const second=parseArxivOaiDocument(page([paper({title:'Revised Heyting sheaves',datestamp:'2026-10-27'})]));
  const initial=advanceArxivWatch([], {records:first,complete:true,resumptionToken:null});
  assert.equal(initial.changes[0].kind,'observed');
  const repaired=advanceArxivWatch(initial.records,second);
  assert.equal(repaired.records.length,1);
  assert.equal(repaired.changes[0].kind,'revised');
  assert.equal(repaired.changes[0].priorDigest,first[0].editionDigest);
  assert.deepEqual(advanceArxivWatch(repaired.records,second).changes,[]);
  assert.throws(()=>advanceArxivWatch(repaired.records,{records:first}),/stale OAI/);
  assert.throws(()=>advanceArxivWatch(first,[{records:[]}]),/witnessed OAI/);
});

test('contested same-day changes refuse silent winner, deleted record is not mislabeled paper withdrawal',()=>{
  const original=parseArxivOaiDocument(page()).records;
  const contested=parseArxivOaiDocument(page([paper({title:'Conflicting same-day title'})]));
  assert.throws(()=>advanceArxivWatch(original,contested),/contested/);
  const removed=parseArxivOaiDocument(page([paper({deleted:true,datestamp:'2026-10-27'})]));
  const delta=advanceArxivWatch(original,removed);
  assert.equal(delta.changes[0].kind,'deleted-from-oai');
  assert.equal(delta.records[0].status,'deleted-from-oai');
  assert.equal(delta.records[0].version,undefined);
});

test('metadata packet is unapproved and links to original author/paper and witnessed bytes',()=>{
  const a=parseArxivOaiDocument(page());
  const source={...a,editorialStatus:'not-approved',sourceDigest:'sha256:'+'a'.repeat(64),
    requestUrl:arxivOaiListUrl({set:'cs'}),observedAt:'2026-10-27T13:00:00Z',rights:{metadata:'CC0',content:'no PDF'}};
  const candidates=arxivNewswireCandidates(source);
  assert.equal(candidates.editorialStatus,'not-approved');
  assert.equal(candidates.candidates[0].subject,'arxiv:2610.01234');
  assert.equal(candidates.candidates[0].data.abstract,'A study of relational closure.');
  assert.equal(candidates.candidates[0].provenance.rights.content,'no PDF');
  assert.throws(()=>arxivNewswireCandidates({...source,editorialStatus:'released'}),/witnessed unapproved/);
});

test('actual acquisition path requires caller-owned cluster rate gate and verified original source bytes',async()=>{
  const xml='<?xml version="1.0"?><OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"/>';
  const bytes=Buffer.from(xml);
  const custody=store();let release=false,called=0;
  const result=await acquireArxivOaiPage({set:'math:math:CT',root:'/not-used',store:custody,
    observedAt:'2026-10-27T13:00:00Z',
    rateGate:async({provider,minimumIntervalMs,maxConnections})=>{called++;assert.equal(provider,'arxiv-legacy');assert.equal(minimumIntervalMs,3000);assert.equal(maxConnections,1);return async()=>{release=true}},
    fetchImpl:async(url,opts)=>{assert.equal(new URL(url).searchParams.get('set'),'math:math:CT');assert.equal(opts.redirect,'error');return new Response(bytes,{status:200,headers:{'content-type':'text/xml'}})},
    parseXmlDocument:(source)=>{assert.equal(source,xml);return page();}
  });
  assert.equal(called,1);assert.equal(release,true);
  assert.equal(result.editorialStatus,'not-approved');
  assert.equal(result.sourceDigest,'sha256:'+sha(bytes));
  assert.equal(result.sourceBytes,bytes.byteLength);
  assert.equal(custody.map.size,1);
  await assert.rejects(acquireArxivOaiPage({store:custody}),/rate gate/);
});

test('source XML is retained before normalization refusal; redirects and bad MIME never admitted',async()=>{
  const xml=Buffer.from('<?xml version="1.0"?><wrong/>');const custody=store();
  const input={store:custody,observedAt:'2026-10-27T13:00:00Z',rateGate:async()=>async()=>{},
    fetchImpl:async()=>new Response(xml,{status:200,headers:{'content-type':'application/xml'}}),
    parseXmlDocument:()=>{throw new TypeError('bad namespace')}};
  await assert.rejects(acquireArxivOaiPage(input),/bad namespace/);
  assert.equal(custody.map.size,1);
  await assert.rejects(acquireArxivOaiPage({...input,fetchImpl:async()=>new Response(xml,{status:200,headers:{'content-type':'application/json'}})}),/not XML/);
  await assert.rejects(acquireArxivOaiPage({...input,fetchImpl:async()=>new Response(xml,{status:503,headers:{'content-type':'text/xml'}})}),/HTTP 503/);
  await assert.rejects(acquireArxivOaiPage({...input,maxBytes:1024,fetchImpl:async()=>new Response(Buffer.alloc(1200),{status:200,headers:{'content-type':'text/xml'}})}),/limit exceeded/);
});
