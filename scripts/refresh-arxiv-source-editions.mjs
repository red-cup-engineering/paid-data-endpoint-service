/** Original arXiv OAI metadata watch: witnessed source state, not a public publisher. */
import { readFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContentAddressedDirectory } from '../src/content-addressed-directory.mjs';
import { writeTextAtomically } from '../src/atomic-text.mjs';
import { acquireArxivOaiPage, advanceArxivWatch, arxivNewswireCandidates, ARXIV_OAI } from '../src/arxiv-oai-source.mjs';

const DAY=86_400_000, SHA=/^sha256:[0-9a-f]{64}$/;
const MAX_STATE_BYTES=12*1024*1024, MAX_RECORDS=30000;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const clock=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)&&!Number.isNaN(Date.parse(value));
function configOf(source){
 if(!isObject(source)||Object.keys(source).sort().join('|')!=='bootstrapFrom|set'||typeof source.set!=='string'||!date(source.bootstrapFrom)) throw new TypeError('arXiv watch requires exact set and real bootstrap date');
 return Object.freeze({set:source.set,bootstrapFrom:source.bootstrapFrom});
}
function stateOf(old,set){
 if(old===null) return null;
 if(!isObject(old)||old.kind!=='561.newswire.arxiv-observation.v1'||old.set!==set||!Array.isArray(old.records)||!clock(old.lastResponseAt)||!Array.isArray(old.sourcePages)) throw new TypeError('arXiv prior state is not a source-qualified matching observation');
 if(old.records.length>MAX_RECORDS||old.records.some(r=>!r?.subject?.startsWith('arxiv:')||!SHA.test(r.editionDigest)))throw new TypeError('arXiv state has unverified or excessive normalized items');
 return old;
}
async function oldAt(path){
 try{
  const info=await stat(path);if(info.size>MAX_STATE_BYTES)throw new RangeError('arXiv prior state exceeds bounded source-file size');
  return JSON.parse(await readFile(path,'utf8'));
 }catch(error){if(error?.code==='ENOENT')return null;throw error;}
}
/** A full, source-witnessed OAI window advances original state atomically.
 * On a partial page budget, denial or store failure the previously committed
 * source state is preserved. OAI "from" means metadata datestamp, not first submission. */
export async function refreshArxivSourceEditions({statePath,source,rateGate,fetchImpl,parseXmlDocument,
  store,root,observedAt=new Date().toISOString(),maxPages=3}={}) {
 if(typeof statePath!=='string'||!statePath)throw new TypeError('real prior-state path required');
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>10)throw new RangeError('arXiv work must bound page count');
 if(!clock(observedAt))throw new TypeError('arXiv cycle needs a real observation instant');
 const settings=configOf(source), prior=stateOf(await oldAt(statePath),settings.set);
 const reference=prior?.lastResponseAt?.slice(0,10)??settings.bootstrapFrom;
 // Inclusive OAI date selection and deliberate one-day overlap for late revisions.
 const since=prior?new Date(Date.parse(reference+'T00:00:00Z')-DAY).toISOString().slice(0,10):reference;
 const byteStore=store??createContentAddressedDirectory({root,maxObjects:4096,maxBytes:512*1024*1024});
 const receipts=[];let token=null,lastResponseAt=null,settled=prior?.records??[],allChanges=[];
 const candidatesByEdition=new Map();
 for(let pageNo=1;pageNo<=maxPages;pageNo++) {
   const args={root,store:byteStore,rateGate,observedAt,...(fetchImpl?{fetchImpl}:{}),
     ...(parseXmlDocument?{parseXmlDocument}:{}),...(token?{resumptionToken:token}:{set:settings.set,from:since})};
   const page=await acquireArxivOaiPage(args);
   if(lastResponseAt && page.responseDate<lastResponseAt)throw new Error('arXiv source clock reversed during paginated harvest');
   lastResponseAt=page.responseDate;
   const advance=advanceArxivWatch(settled,page);settled=advance.records;
   allChanges.push(...advance.changes);
   if(settled.length>MAX_RECORDS)throw new RangeError('arXiv watch exceeds bounded record capacity');
   const qualifying = new Set(advance.changes.map(c=>c.subject+'|'+c.editionDigest));
   for(const candidate of arxivNewswireCandidates(page).candidates){
     const key=candidate.subject+'|'+candidate.editionDigest;
     if(qualifying.has(key)) candidatesByEdition.set(key,candidate);
   }
   receipts.push(Object.freeze({requestUrl:page.requestUrl,sourceDigest:page.sourceDigest,sourceBytes:page.sourceBytes,
     observedAt:page.observedAt,sourceTime:page.responseDate,count:page.records.length,complete:page.complete}));
   if(page.complete){
     const current={kind:'561.newswire.arxiv-observation.v1',source:ARXIV_OAI,set:settings.set,
       from:since,observedAt,lastResponseAt,sourcePages:receipts,
       coverage:{scope:'arXiv OAI set, metadata changed since inclusive from date; not full historical corpus',complete:true,
         pagesRead:receipts.length,priorComplete:!!prior,bootstrapFrom:settings.bootstrapFrom},
       records:settled,changes:allChanges,sourceCandidates:[...candidatesByEdition.values()],editorialStatus:'not-approved',merchantSettlement:null};
     const encoded=JSON.stringify(current,null,2)+'\n';
     if(Buffer.byteLength(encoded)>MAX_STATE_BYTES)throw new RangeError('arXiv source state exceeds bounded publication size');
     await mkdir(dirname(statePath),{recursive:true});
     await writeTextAtomically(statePath,encoded);
     return Object.freeze(current);
   }
   token=page.resumptionToken;
   if(!token)throw new Error('arXiv incomplete page had no continuation token');
 }
 throw new RangeError('arXiv bounded page budget exhausted: state not committed');
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
 // This original scheduler admits one house-owned job. A fleet-wide global
 // arXiv API lease remains separate and must be integrated before expanding.
 if(process.env.ARXIV_OAI_SOURCE_POLICY!=='original-github-actions-exclusive')
   throw new Error('arXiv official harvest is not admitted without selected source scheduling policy');
 const {setTimeout:sleep}=await import('node:timers/promises');
 const config=JSON.parse(await readFile(process.env.ARXIV_SOURCE_DECLARATION,'utf8'));
 let lastRequest=0;
 const rateGate=async({provider,minimumIntervalMs,maxConnections})=>{
   if(provider!=='arxiv-legacy'||minimumIntervalMs<3000||maxConnections!==1)
     throw new Error('original arXiv source budget mismatch');
   await sleep(Math.max(3100,lastRequest+3100-Date.now()));
   lastRequest=Date.now();
   return async()=>{await sleep(3100)};
 };
 const result=await refreshArxivSourceEditions({statePath:process.env.ARXIV_STATE_PATH,source:config,
   root:process.env.ARXIV_SOURCE_BYTES,rateGate,maxPages:3});
 console.log(JSON.stringify({kind:result.kind,observedAt:result.observedAt,source:result.source,
   pagesRead:result.sourcePages.length,totalRecords:result.records.length,newOrRevised:result.changes.length,
   coverage:result.coverage,editorialStatus:result.editorialStatus,merchantSettlement:result.merchantSettlement}));
}
