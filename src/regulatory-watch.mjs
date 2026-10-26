/** Source-observation watch over the original acquired Federal Register editions. */
const DAY = 86_400_000;
const MAX_BYTES = 2 * 1024 * 1024;
const NI = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;
const SHA = /^sha256:[a-f0-9]{64}$/u;
const TYPES = ['Rule', 'Proposed Rule', 'Notice', 'Presidential Document'];
const keys = new Set(['terms','match','agency','type','cfrTitle','docket','publishedSince','deadlineWithinDays','limit','offset','edition']);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = message => { throw new TypeError(message); };
const text = (v, name, max) => typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : fail(name + ' requires bounded text');
function day(v, name) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(v) || !Number.isFinite(Date.parse(v+'T00:00:00Z')) || new Date(v+'T00:00:00Z').toISOString().slice(0,10) !== v) fail(name+' requires a civil ISO date');
  return v;
}
function integer(v, name, min, max, fallback) {
  if (v === undefined) return fallback;
  if (typeof v === 'string' && /^(0|[1-9]\d*)$/u.test(v)) v = Number(v);
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(name+' is outside '+min+'..'+max);
  return v;
}
/** Shared by x402 admission and execution; all selectors remain literal. */
export function normalizeRegulatoryWatchQuery(raw = {}) {
  if (!object(raw) || Object.keys(raw).some(k=>!keys.has(k))) fail('unknown regulatory watch selector');
  const q = {terms:[],match:raw.match ?? 'any',limit:integer(raw.limit,'limit',1,100,20),offset:integer(raw.offset,'offset',0,10000,0)};
  if (!['any','all'].includes(q.match)) fail('match must be any or all');
  if (raw.terms !== undefined) {
    const terms = text(raw.terms,'terms',648).split(',').map(s=>text(s,'term',80).toLocaleLowerCase('en-US'));
    if (terms.length > 8) fail('terms permits at most eight comma-separated literal phrases');
    q.terms = [...new Set(terms)];
  }
  for (const k of ['agency','docket']) if (raw[k] !== undefined) q[k] = text(raw[k],k,160).toLocaleLowerCase('en-US');
  if (raw.type !== undefined) { if (!TYPES.includes(raw.type)) fail('unknown Federal Register document type'); q.type=raw.type; }
  if (raw.cfrTitle !== undefined) q.cfrTitle=integer(raw.cfrTitle,'cfrTitle',1,50);
  if (raw.publishedSince !== undefined) q.publishedSince=day(raw.publishedSince,'publishedSince');
  if (raw.deadlineWithinDays !== undefined) q.deadlineWithinDays=integer(raw.deadlineWithinDays,'deadlineWithinDays',0,366);
  if (raw.edition !== undefined) { if (typeof raw.edition !== 'string' || !SHA.test(raw.edition)) fail('edition requires sha256:<64 lowercase hex>'); q.edition=raw.edition; }
  if (q.offset > 0 && !q.edition) fail('pagination requires the edition returned by the first page');
  return Object.freeze(q);
}
function sourceDocument(record) {
  if (!object(record) || typeof record.documentNumber !== 'string' || record.subject !== 'federal-register:'+record.documentNumber || !NI.test(record.revision ?? '')) fail('source document identity is invalid');
  const u = new URL(record.documentUrl);
  if (u.protocol !== 'https:' || u.hostname !== 'www.federalregister.gov' || u.username || u.password) fail('source document URL requires the original Federal Register');
  text(record.title,'source title',8192);
  day(record.publicationDate,'source publicationDate');
  if (!Array.isArray(record.agencies) || record.agencies.length>64 || record.agencies.some(v=>typeof v!=='string' || v.length>2048)) fail('source agencies are invalid');
  if (record.abstract !== null && (typeof record.abstract!=='string' || record.abstract.length>60000)) fail('source abstract is invalid');
  if (!TYPES.includes(record.documentType)) fail('source document type is invalid');
  for (const k of ['docketIds','cfrReferences','regulationIdNumbers']) if (!Array.isArray(record[k]) || record[k].length>128) fail('source '+k+' is invalid');
  if (record.docketIds.some(v=>typeof v!=='string' || v.length>2048)) fail('source docket IDs are invalid');
  if (record.cfrReferences.some(v=>!object(v) || !Number.isInteger(v.title) || v.title<1 || v.title>50)) fail('source CFR title is invalid');
  for (const k of ['commentsCloseOn','effectiveOn']) if (record[k] !== null && record[k] !== undefined) day(record[k],'source '+k);
  if (!object(record.source) || !SHA.test(record.source.originalResponseDigest ?? '')) fail('source response digest is missing');
  return record;
}
/** Deterministic finite restriction of one original source edition. */
export function projectRegulatoryWatch(feed, raw, {edition, now=Date.now(),maxAgeMs=12*60*60*1000}={}) {
  const q=normalizeRegulatoryWatchQuery(raw);
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs<60_000 || maxAgeMs>7*DAY) fail('bounded observation clock is required');
  if (!object(feed) || feed.kind!=='561.newswire.federal-register-source-observation.v1' || feed.source!=='https://www.federalregister.gov' || !Array.isArray(feed.documents) || feed.documents.length>2000 || feed.documentCount!==feed.documents.length || !SHA.test(edition ?? '')) fail('original Federal Register source edition is required');
  const observed=Date.parse(feed.observedAt);
  if (typeof feed.observedAt!=='string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(feed.observedAt) || !Number.isFinite(observed) || observed>now+300_000 || now-observed>maxAgeMs) fail('Federal Register observation is stale');
  if (q.edition && q.edition!==edition) fail('source edition advanced; restart with offset=0');
  const seen=new Set();
  const today=new Date(now).toISOString().slice(0,10);
  const until=q.deadlineWithinDays===undefined ? null : new Date(Date.parse(today+'T00:00:00Z')+q.deadlineWithinDays*DAY).toISOString().slice(0,10);
  const matches=[];
  for (const input of feed.documents) {
    const d=sourceDocument(input);
    if (seen.has(d.subject)) fail('duplicate source subject');
    seen.add(d.subject);
    const haystack=[d.title,d.abstract??'',...d.agencies,...d.docketIds].join(' ').toLocaleLowerCase('en-US');
    const matchedTerms=q.terms.filter(term=>haystack.includes(term));
    if (q.terms.length && (q.match==='all' ? matchedTerms.length!==q.terms.length : matchedTerms.length===0)) continue;
    if (q.agency && !d.agencies.some(a=>a.toLocaleLowerCase('en-US').includes(q.agency))) continue;
    if (q.type && d.documentType!==q.type) continue;
    if (q.cfrTitle && !d.cfrReferences.some(ref=>ref.title===q.cfrTitle)) continue;
    if (q.docket && !d.docketIds.some(id=>id.toLocaleLowerCase('en-US').includes(q.docket))) continue;
    if (q.publishedSince && d.publicationDate<q.publishedSince) continue;
    if (until && !(d.commentDeadlineFieldRequested===true && d.commentsCloseOn && d.commentsCloseOn>=today && d.commentsCloseOn<=until)) continue;
    matches.push({subject:d.subject,revision:d.revision,documentNumber:d.documentNumber,documentUrl:d.documentUrl,title:d.title,abstract:d.abstract,documentType:d.documentType,publicationDate:d.publicationDate,agencies:d.agencies,matchedTerms,commentsCloseOn:d.commentsCloseOn??null,commentDeadlineFieldRequested:d.commentDeadlineFieldRequested===true,effectiveOn:d.effectiveOn??null,sourceAction:d.sourceAction??null,federalRegisterCitation:d.federalRegisterCitation??null,docketIds:d.docketIds,cfrReferences:d.cfrReferences,regulationIdNumbers:d.regulationIdNumbers,correctionOf:d.correctionOf??null,corrections:d.corrections??[],sourceResponseDigest:d.source.originalResponseDigest});
  }
  matches.sort((a,b)=>b.publicationDate.localeCompare(a.publicationDate)||a.subject.localeCompare(b.subject));
  const items=matches.slice(q.offset,q.offset+q.limit);
  const calendar=items.flatMap(d=>[
    ...(d.commentDeadlineFieldRequested && d.commentsCloseOn ? [{kind:'comment-close',date:d.commentsCloseOn,subject:d.subject,url:d.documentUrl}] : []),
    ...(d.effectiveOn ? [{kind:'effective-on',date:d.effectiveOn,subject:d.subject,url:d.documentUrl}] : []),
  ]).sort((a,b)=>a.date.localeCompare(b.date)||a.subject.localeCompare(b.subject));
  const nextOffset=q.offset+items.length;
  return {kind:'561.regulatory-watch.v1',edition,observedAt:feed.observedAt,source:feed.source,sourceWindow:feed.query,coverage:feed.coverage,query:q,sourceDocumentCount:feed.documentCount,totalMatched:matches.length,returnedCount:items.length,items,calendar,next:nextOffset<matches.length ? {edition,offset:nextOffset} : null};
}
async function sourceBytes(response) {
  if (!response.ok) throw new Error('regulatory source returned HTTP '+response.status);
  if (!response.body) throw new Error('regulatory source response has no body');
  const size=Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size>MAX_BYTES) throw new RangeError('regulatory source exceeds byte budget');
  const reader=response.body.getReader();let length=0;const parts=[];
  try {
    while (true) { const {done,value}=await reader.read(); if (done) break; length+=value.byteLength; if (length>MAX_BYTES) throw new RangeError('regulatory source exceeds byte budget'); parts.push(value); }
  } finally { if (length>MAX_BYTES) await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  const bytes=new Uint8Array(length);let at=0;for (const part of parts) { bytes.set(part,at);at+=part.byteLength; }
  return bytes;
}
const held=new Map();
/** Native Market compute binding; source URL/budget are seller-owned configuration. */
export async function readRegulatoryWatch(raw, configuration, {fetchImpl=globalThis.fetch,now=Date.now()}={}) {
  normalizeRegulatoryWatchQuery(raw);
  if (!object(configuration)) fail('seller source configuration is required');
  const u=new URL(configuration.sourceUrl);
  if (u.protocol!=='https:' || u.username || u.password || u.hash) fail('seller source requires uncredentialed HTTPS');
  const maxAgeMs=configuration.maxAgeMs ?? 12*60*60*1000;
  let entry=held.get(u.href);
  if (!entry || now-entry.at>180_000 || now<entry.at) {
    if (held.size>=4) held.clear();
    const pending=(async()=>{
      const response=await fetchImpl(u.href,{redirect:'manual',signal:AbortSignal.timeout(8000),headers:{accept:'application/json'},cf:{cacheTtl:180,cacheEverything:true}});
      const bytes=await sourceBytes(response);
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      const edition='sha256:'+Array.from(digest,n=>n.toString(16).padStart(2,'0')).join('');
      const feed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      return {feed,edition};
    })();
    entry={at:now,pending};held.set(u.href,entry);
    pending.catch(()=>{if(held.get(u.href)===entry) held.delete(u.href);});
  }
  const {feed,edition}=await entry.pending;
  return projectRegulatoryWatch(feed,raw,{edition,now,maxAgeMs});
}
