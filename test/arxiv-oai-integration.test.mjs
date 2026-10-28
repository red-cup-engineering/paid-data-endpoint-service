import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readXmlDocument } from '@red-cup-engineering/xml-document-rendering-service/document-read';
import { parseArxivOaiDocument, acquireArxivOaiPage } from '../arxiv-oai-source.mjs';
import { createHash } from 'node:crypto';

// Real namespace-aware XML reader and realistic arXiv OAI-PMH arXiv record
// shape. Source is a deterministic fixture, NOT a claim of live arXiv data.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <responseDate>2026-10-27T13:00:00Z</responseDate>
  <request verb="ListRecords" metadataPrefix="arXiv">https://oaipmh.arxiv.org/oai</request>
  <ListRecords>
    <record>
      <header>
        <identifier>oai:arXiv.org:2610.01234</identifier>
        <datestamp>2026-10-26</datestamp>
        <setSpec>math:math:CT</setSpec>
      </header>
      <metadata>
        <arXiv xmlns="http://arxiv.org/OAI/arXiv/">
          <id>2610.01234</id><created>2026-10-25</created><updated>2026-10-26</updated>
          <authors><author><keyname>Doe</keyname><forenames>Jane</forenames></author></authors>
          <title>Sheaves &amp; active nuclei</title><categories>math.CT cs.LO</categories>
          <abstract>An example &lt;with&gt; encoded entities.</abstract>
        </arXiv>
      </metadata>
    </record>
    <resumptionToken expirationDate="2026-10-28T00:00:00Z">opaque+token/abc==</resumptionToken>
  </ListRecords>
</OAI-PMH>`;

test('Group original strict XML reader consumes actual OAI-PMH XML with namespaces and entities',()=>{
  const result=parseArxivOaiDocument(readXmlDocument(xml));
  assert.equal(result.records.length,1);
  assert.equal(result.records[0].title,'Sheaves & active nuclei');
  assert.equal(result.records[0].abstract,'An example <with> encoded entities.');
  assert.equal(result.resumptionToken,'opaque+token/abc==');
  assert.equal(result.complete,false);
});

test('original XML reader refuses external entities and DTD before Newswire preparation',()=>{
  const malicious=xml.replace('<OAI-PMH','<!DOCTYPE evil [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><OAI-PMH');
  assert.throws(()=>readXmlDocument(malicious),/DTD|doctype|outside/i);
});

test('real parser is integrated with witnessed source acquisition without a duplicate XML codec',async()=>{
  const bytes=Buffer.from(xml),hash=createHash('sha256').update(bytes).digest('hex');
  const objects=new Map();
  const store={async write({body}){objects.set(hash,Buffer.from(body));return {sha256:hash,byteLength:body.length}},
    async read({sha256}){return {body:objects.get(sha256)}}};
  const page=await acquireArxivOaiPage({from:'2026-10-26',store,
    observedAt:'2026-10-27T13:30:00Z',rateGate:async()=>async()=>{},
    fetchImpl:async()=>new Response(bytes,{status:200,headers:{'content-type':'text/xml'}})});
  assert.equal(page.records[0].subject,'arxiv:2610.01234');
  assert.equal(page.sourceDigest,'sha256:'+hash);
  assert.equal(page.editorialStatus,'not-approved');
  assert.equal(objects.get(hash).toString('utf8'),xml);
});
