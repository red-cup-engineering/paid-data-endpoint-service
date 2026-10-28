/** arXiv OAI-PMH metadata acquisition. Candidates only: no publisher, payer or scheduler. */
import { createHash } from 'node:crypto';
import { createContentAddressedDirectory } from './content-addressed-directory.mjs';

export const ARXIV_OAI = 'https://oaipmh.arxiv.org/oai';
const OAI_NS = 'http://www.openarchives.org/OAI/2.0/';
const ARXIV_NS = 'http://arxiv.org/OAI/arXiv/';
const MAX_XML_BYTES = 1024 * 1024;
const sha256 = data => 'sha256:' + createHash('sha256').update(data).digest('hex');
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function fail(message) { throw new TypeError('arXiv OAI: ' + message); }
function civilDate(v, name) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
      Number.isNaN(Date.parse(v + 'T00:00:00Z')) ||
      new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v) fail(name + ' needs a real YYYY-MM-DD');
  return v;
}
function instant(v, name) {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(v) ||
      !Number.isFinite(Date.parse(v))) fail(name + ' needs UTC RFC3339');
  return new Date(v).toISOString();
}
function setName(v) {
  if (typeof v !== 'string' || v.length < 2 || v.length > 80 ||
      !/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(v) || v.includes('..') || v.includes('::')) fail('invalid OAI set');
  return v;
}
export function arxivOaiListUrl({ set, from, resumptionToken } = {}) {
  const params = new URLSearchParams({ verb: 'ListRecords' });
  if (resumptionToken !== undefined) {
    if (set !== undefined || from !== undefined) fail('a resumption token is the entire continuation request');
    if (typeof resumptionToken !== 'string' || !resumptionToken || resumptionToken.length > 4096) fail('invalid resumption token');
    params.set('resumptionToken', resumptionToken);
  } else {
    params.set('metadataPrefix', 'arXiv');
    if (set !== undefined) params.set('set', setName(set));
    if (from !== undefined) params.set('from', civilDate(from, 'from'));
  }
  return ARXIV_OAI + '?' + params.toString();
}

// The Group's original XML document reader validates XML 1.0 and namespace
// bindings. This adapter independently checks the *expanded* names needed
// for arXiv/OAI semantics, not qname spellings or untrusted prefix aliases.
function expandedTree(document) {
  if (!isObject(document) || document.kind !== 'document' || !Array.isArray(document.children)) fail('qualified XML document required');
  let budget = 0;
  function entry(n, inherited, depth) {
    if (++budget > 16000 || depth > 64) fail('XML structural budget exceeded');
    const scope = new Map(inherited);
    for (const [k, v] of Object.entries(n.attributes ?? {})) {
      if (typeof v !== 'string') fail('non-text namespace attribute');
      if (k === 'xmlns') scope.set('', v);
      else if (k.startsWith('xmlns:')) scope.set(k.slice(6), v);
    }
    const parts = n.name.split(':');
    if (parts.length > 2 || parts.some(x => !x)) fail('invalid qualified element name');
    const uri = scope.get(parts.length === 2 ? parts[0] : '') ?? '';
    if (parts.length === 2 && !scope.has(parts[0])) fail('unbound XML prefix');
    const children = (n.children ?? []).filter(x => x.kind === 'element').map(x => entry(x, scope, depth + 1));
    return { uri, local: parts.at(-1), node: n, children };
  }
  const roots = document.children.filter(x => x.kind === 'element');
  if (roots.length !== 1) fail('exactly one XML root expected');
  return entry(roots[0], new Map([['xml', 'http://www.w3.org/XML/1998/namespace']]), 0);
}
function children(parent, name, uri = OAI_NS) { return parent.children.filter(x => x.local === name && x.uri === uri); }
function child(parent, name, uri = OAI_NS, required = true) {
  const found = children(parent, name, uri);
  if (found.length > 1 || (required && found.length !== 1)) fail('expected one ' + name);
  return found[0] ?? null;
}
function content(n, max = 20000) {
  if (!n) return null;
  if (n.children.length) fail('unexpected markup in ' + n.local);
  let s = '';
  for (const x of n.node.children ?? []) {
    if (x.kind === 'text' || x.kind === 'cdata') s += x.value;
    else if (x.kind !== 'comment') fail('unexpected node in ' + n.local);
    if (s.length > max) fail('oversized ' + n.local);
  }
  return s.trim().replace(/\s+/g, ' ');
}
function field(p, name, {required = false, limit = 20000, uri = ARXIV_NS} = {}) {
  const selected = child(p, name, uri, required);
  const value = content(selected, limit);
  if (required && !value) fail('empty required ' + name);
  return value || null;
}
function articleId(value) {
  if (typeof value !== 'string' || value.length > 64 || value.includes('..') ||
      !/^(?:\d{4}\.\d{4,5}|[a-z][a-z0-9.-]*\/\d{7})$/i.test(value)) fail('invalid original arXiv identifier');
  return value;
}
function parseRecord(node) {
  const header = child(node, 'header');
  const originalIdentifier = field(header, 'identifier', {required:true, uri:OAI_NS, limit:100});
  if (!originalIdentifier.startsWith('oai:arXiv.org:')) fail('unexpected OAI record authority');
  const id = articleId(originalIdentifier.slice('oai:arXiv.org:'.length));
  const datestamp = field(header, 'datestamp', {required:true, uri:OAI_NS, limit:30});
  civilDate(datestamp, 'OAI datestamp');
  const state = header.node.attributes?.status === 'deleted' ? 'deleted-from-oai' : 'present';
  const base = {subject: 'arxiv:' + id, id, url:'https://arxiv.org/abs/' + id, datestamp, status:state};
  if (state === 'deleted-from-oai') {
    if (children(node,'metadata').length) fail('deleted record unexpectedly has metadata');
    return Object.freeze({...base, editionDigest:sha256(JSON.stringify(base))});
  }
  const meta = child(node, 'metadata');
  const source = child(meta, 'arXiv', ARXIV_NS);
  if (field(source,'id',{required:true,limit:64}) !== id) fail('OAI identifier and metadata id disagree');
  const authors = children(child(source,'authors',ARXIV_NS),'author',ARXIV_NS).map(author => {
    const key = field(author,'keyname',{required:true,limit:400});
    const first = field(author,'forenames',{limit:400});
    return [first,key].filter(Boolean).join(' ');
  });
  if (!authors.length || authors.length > 100) fail('invalid author list');
  const categories = (field(source,'categories',{required:true,limit:1200}) ?? '').split(/\s+/);
  if (!categories.length || categories.length > 50 || categories.some(x => !/^[a-zA-Z0-9.-]+$/.test(x))) fail('invalid arXiv categories');
  const created = field(source,'created',{required:true,limit:16});
  civilDate(created,'paper created');
  const updated = field(source,'updated',{limit:16});
  if (updated) civilDate(updated,'paper updated');
  const item = Object.freeze({
    ...base,
    title:field(source,'title',{required:true,limit:2500}),
    abstract:field(source,'abstract',{required:true,limit:24000}),
    authors:Object.freeze(authors), categories:Object.freeze([...new Set(categories)]),
    created, updated:updated ?? null,
    articleLicense:field(source,'license',{limit:500}),
    // The latest arXiv OAI metadata format does not reliably encode article vN.
    // OAI datestamp is NOT submission date or the e-print version number.
    version:null,
  });
  return Object.freeze({...item, editionDigest:sha256(JSON.stringify(item))});
}
/** Pure OAI document projection; never treats metadata as a released newsroom story. */
export function parseArxivOaiDocument(xmlDocument) {
  const root = expandedTree(xmlDocument);
  if (root.local !== 'OAI-PMH' || root.uri !== OAI_NS) fail('non-OAI-PMH namespace');
  const responseDate = field(root, 'responseDate', {uri:OAI_NS,required:true,limit:50});
  instant(responseDate,'responseDate');
  const errors = children(root,'error');
  if (errors.length) {
    if (errors.length === 1 && errors[0].node.attributes?.code === 'noRecordsMatch')
      return Object.freeze({responseDate,records:Object.freeze([]),resumptionToken:null,complete:true});
    fail('upstream OAI error: ' + errors.map(e => String(e.node.attributes?.code ?? 'unknown')).join(','));
  }
  const list = child(root,'ListRecords');
  const records = children(list,'record').map(parseRecord);
  if (records.length > 3000) fail('oversized OAI record page');
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.subject)) fail('duplicate source record on one OAI page');
    seen.add(record.subject);
  }
  const tokenElement = child(list,'resumptionToken',OAI_NS,false);
  const resumptionToken = content(tokenElement,4096) || null;
  const tokenExpires = tokenElement?.node.attributes?.expirationDate ?? null;
  if (resumptionToken && tokenExpires) instant(tokenExpires,'resumption token expiration');
  return Object.freeze({responseDate,records:Object.freeze(records),resumptionToken,tokenExpires,complete:!resumptionToken});
}
async function readBoundedResponse(response,maxBytes) {
  const length = response.headers?.get?.('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length)>maxBytes)) throw new RangeError('arXiv response Content-Length exceeds limit');
  const chunks = []; let bytes=0;
  if (!response.body?.getReader) throw new TypeError('arXiv response must have a bounded streaming body');
  const reader=response.body.getReader();
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail('non-byte source body');
      bytes += value.byteLength;
      if (bytes>maxBytes) throw new RangeError('arXiv source byte limit exceeded');
      chunks.push(Buffer.from(value));
    }
  } catch(error) { await reader.cancel().catch(()=>{}); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks,bytes);
}
/** One strictly rate-gated OAI request. Caller persists the returned cursor only with its accepted page. */
export async function acquireArxivOaiPage({set,from,resumptionToken,root,store,fetchImpl=fetch,
  rateGate,parseXmlDocument,observedAt=new Date().toISOString(),maxBytes=MAX_XML_BYTES}={}) {
  if (typeof rateGate !== 'function') fail('shared cross-machine arXiv 3s/one-connection rate gate is required');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > MAX_XML_BYTES) fail('invalid source byte budget');
  const at = instant(observedAt,'observation timestamp');
  const requestUrl=arxivOaiListUrl({set,from,resumptionToken});
  const byteStore = store ?? createContentAddressedDirectory({root});
  if (typeof byteStore.write !== 'function' || typeof byteStore.read !== 'function') fail('original immutable source custody required');
  // The rate gate owns a shared distributed lease/spacing discipline. This
  // module does not spawn retries or bypass it with per-request proxy calls.
  const release = await rateGate({provider:'arxiv-legacy',minimumIntervalMs:3000,maxConnections:1});
  if (typeof release !== 'function') fail('shared rate-gate lease release required');
  let response, bytes;
  try {
    response=await fetchImpl(requestUrl,{method:'GET',redirect:'error',headers:{accept:'text/xml, application/xml'}});
    if (!response || response.status !== 200 || !response.ok) throw new Error('arXiv OAI source returned HTTP '+response?.status);
    const sourceUrl=response.url || requestUrl;
    if (sourceUrl!==requestUrl) throw new Error('arXiv OAI source redirected from pinned endpoint');
    const mediaType=response.headers?.get?.('content-type') ?? '';
    if (!/^(?:text|application)\/xml(?:\s*;|$)/i.test(mediaType)) fail('arXiv source response is not XML');
    bytes=await readBoundedResponse(response,maxBytes);
  } finally { await release(); }
  const bodyDigest=sha256(bytes);
  const receipt=await byteStore.write({body:bytes,mediaType:'text/xml'});
  if (receipt.sha256!==bodyDigest.slice(7) || receipt.byteLength!==bytes.byteLength) throw new Error('original OAI bytes not durably witnessed');
  const verify=await byteStore.read({sha256:receipt.sha256});
  if (sha256(verify.body)!==bodyDigest) throw new Error('arXiv source custody did not verify');
  const xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  // Defer XML grammar/namespace security to the Group's existing XML reader.
  const reader = parseXmlDocument ?? (await import('@red-cup-engineering/xml-document-rendering-service/document-read')).readXmlDocument;
  const parsed=parseArxivOaiDocument(reader(xml,{maximumInputBytes:maxBytes}));
  return Object.freeze({
    ...parsed, requestUrl,observedAt:at,sourceBytes:bytes.byteLength,sourceDigest:bodyDigest,
    rights:Object.freeze({metadata:'CC0 descriptive metadata',content:'paper-specific license; no e-print redistribution',
      policy:'https://info.arxiv.org/help/api/tou.html'}),
    sourceKind:'arxiv-oai-metadata-candidates', editorialStatus:'not-approved',
  });
}
/** Pure edition-aware update. Same OAI identity across topic wires and replays. */
export function advanceArxivWatch(previous = [], page) {
  if (!Array.isArray(previous) || !isObject(page) || !Array.isArray(page.records)) fail('previous snapshot and witnessed OAI page required');
  const bySubject = new Map();
  for (const row of previous) {
    if (!row?.subject || bySubject.has(row.subject)) fail('duplicate prior paper identity');
    bySubject.set(row.subject,row);
  }
  const changes=[];
  for (const row of page.records) {
    if (!row.subject?.startsWith('arxiv:') || !/^sha256:[a-f0-9]{64}$/.test(row.editionDigest)) fail('invalid normalized paper edition');
    const old=bySubject.get(row.subject);
    if (old?.editionDigest===row.editionDigest) continue;
    if (old && old.datestamp > row.datestamp) fail('stale OAI record must not replace newer metadata');
    // OAI datestamps are DAYS, not unique ordered revisions. A genuine same-day
    // replacement is admissible only if BOTH versions carry source-byte witnesses
    // and the second OAI server response actually follows the first.
    const witnessed = page.sourceKind === 'arxiv-oai-metadata-candidates' &&
      page.editorialStatus === 'not-approved' && /^sha256:[a-f0-9]{64}$/.test(page.sourceDigest ?? '') &&
      typeof page.responseDate === 'string' && !Number.isNaN(Date.parse(page.responseDate));
    if (old?.sourceResponseAt && witnessed && page.responseDate < old.sourceResponseAt)
      fail('stale OAI source response must not replace newer witnessed metadata');
    const sameDay = !!old && old.datestamp === row.datestamp;
    if (sameDay && !(witnessed && old.sourceResponseAt && old.sourceDigest &&
        page.responseDate > old.sourceResponseAt))
      fail('contested source editions share an OAI datestamp without ordered source witnesses');
    const received = witnessed ? Object.freeze({...row, sourceResponseAt:page.responseDate,
      sourceDigest:page.sourceDigest}) : row;
    bySubject.set(row.subject,received);
    changes.push(Object.freeze({kind:!old?'observed':row.status==='deleted-from-oai'?'deleted-from-oai':
      sameDay?'revised-within-oai-day':'revised',subject:row.subject,
      editionDigest:row.editionDigest,priorDigest:old?.editionDigest??null}));
  }
  return Object.freeze({records:Object.freeze([...bySubject.values()].sort((a,b)=>a.subject.localeCompare(b.subject))),
    changes:Object.freeze(changes),nextToken:page.resumptionToken??null,complete:page.complete===true});
}
/** Newsroom candidates, never published or entitled for paid delivery. */
export function arxivNewswireCandidates(page) {
  if (!isObject(page) || page.editorialStatus!=='not-approved' || !/^sha256:[a-f0-9]{64}$/.test(page.sourceDigest)) fail('witnessed unapproved OAI page required');
  return Object.freeze({source:'arxiv',editorialStatus:'not-approved',sourceDigest:page.sourceDigest,
    candidates:Object.freeze(page.records.map(row=>Object.freeze({
      subject:row.subject, editionDigest:row.editionDigest,sourceUrl:row.url,
      kind:'scholarly-metadata',status:row.status,observedAt:page.observedAt,
      provenance:Object.freeze({source:page.requestUrl,digest:page.sourceDigest,datestamp:row.datestamp,rights:page.rights}),
      // Source metadata only; a Newsroom office independently decides if and how to publish.
      data:row,
    })))});
}
