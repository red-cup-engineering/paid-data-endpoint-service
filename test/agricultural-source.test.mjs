import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { admitAgriculturalSourceDeclaration, agriculturalSourceCandidates, agriculturalDcatCatalog, qualifyAgriculturalSource } from "../src/agricultural-source-admission.mjs";
import { admitNassAgriculturalQuery, nassQueryDescription, acquireNassAgriculturalEdition } from "../src/agricultural-nass.mjs";

const query = Object.freeze({year:"2025",stateAlpha:"MN",commodity:"CORN",statistic:"YIELD"});
const key = "private-do-not-publish-quickstats-key";
const date = "2026-10-24";
const row = (Value, unit_desc = "BU / ACRE") => ({
  year:2025,state_alpha:"MN",commodity_desc:"CORN",statisticcat_desc:"YIELD",
  agg_level_desc:"STATE",unit_desc,Value,domain_desc:"TOTAL",reference_period_desc:"YEAR"
});
const hash = body => createHash("sha256").update(body).digest("hex");

function contentStore({tamperRead = false} = {}) {
  const saved = new Map();
  return {
    saved,
    async write({body,mediaType}) {
      assert.equal(mediaType, "application/json");
      const bytes = Buffer.from(body);
      const sha256 = hash(bytes);
      saved.set(sha256,bytes);
      return {sha256,byteLength:bytes.length};
    },
    async read({sha256}) {
      const body = saved.get(sha256);
      if (!body) throw new Error("missing original source");
      return {sha256,body:tamperRead ? Buffer.from("tampered") : Buffer.from(body),byteLength:body.length};
    }
  };
}
function fakeNass({count = 2, rows = [row("177.3"),row("(D)","BU / ACRE")], mediaType="application/json"} = {}) {
  const requests = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    requests.push(u);
    assert.equal(u.searchParams.get("key"), key, "network authorization uses caller's key");
    assert.equal(u.searchParams.get("year"), "2025");
    assert.equal(u.searchParams.get("state_alpha"), "MN");
    assert.equal(u.searchParams.get("commodity_desc"), "CORN");
    assert.equal(u.searchParams.get("statisticcat_desc"), "YIELD");
    if (u.pathname.endsWith("/get_counts"))
      return new Response(JSON.stringify({count}),{status:200,headers:{"content-type":mediaType}});
    assert.ok(u.pathname.endsWith("/api_GET"),"a count must precede exact edition acquisition");
    return new Response(JSON.stringify({data:rows}),{status:200,headers:{"content-type":mediaType}});
  };
  return {requests,fetchImpl};
}

test("source declarations are inspected as typed evidence, not self-certifying commercial products", () => {
  const sources = agriculturalSourceCandidates();
  assert.deepEqual(sources.map((s) => s.id), ["usda-nass-quickstats","noaa-nws-forecast-reuse"]);
  assert.equal(sources[0].access.kind,"credentialed-api");
  assert.equal(sources[1].upstream.repository,"red-cup-engineering/forecasting");
  assert.equal(qualifyAgriculturalSource({id:"usda-nass-quickstats",asOf:date}).id,"usda-nass-quickstats");
  for (const purpose of ["commercial-redistribution","commercial-sublicensing"])
    assert.throws(() => qualifyAgriculturalSource({id:"usda-nass-quickstats",asOf:date,purpose}), /not been independently qualified/u);
  assert.throws(() => qualifyAgriculturalSource({id:"unknown",asOf:date}), /unknown/u);
  assert.throws(() => qualifyAgriculturalSource({id:"usda-nass-quickstats",asOf:"2027-01-01"}), /not current/u);
  assert.throws(() => admitAgriculturalSourceDeclaration({...sources[0],rights:{...sources[0].rights,reviewDueOn:"2026-10-22"}}), /precedes/u);
  assert.throws(() => admitAgriculturalSourceDeclaration({...sources[0],access:{...sources[0].access,endpoint:"https://example.com/api/?key=accident"}}), /credential-free/u);
});

test("DCAT 3-style candidate discovery uses publisher identity but has no fake bought distribution", () => {
  const graph = agriculturalDcatCatalog({asOf:date});
  assert.equal(graph["@type"],"dcat:Catalog");
  assert.equal(graph["dcat:dataset"].length,2);
  for (const entry of graph["dcat:dataset"]) {
    assert.equal(entry["adms:status"]["@id"],"http://purl.org/adms/status/UnderDevelopment");
    assert.match(entry["dct:rights"],/commercial redistribution: not-yet-qualified/u);
    assert.match(entry["dct:rights"],/sublicensing: not-yet-qualified/u);
    assert.equal(entry["dct:identifier"].length > 0,true);
    assert.equal(entry["561:sourceStatus"],undefined,"no invented or unhosted ontology namespace");
    assert.equal(entry["dcat:distribution"],undefined);
    assert.equal(entry["dct:license"],undefined);
  }
});

test("bounded original NASS query never exposes a stored API key or guesses the unit", () => {
  const admitted = admitNassAgriculturalQuery(query);
  assert.equal(admitted.statisticcat_desc,"YIELD");
  assert.equal(admitted.agg_level_desc,"STATE");
  assert.ok(!nassQueryDescription(query).includes("key="));
  assert.throws(() => admitNassAgriculturalQuery({...query,malicious:"x"}), /only/u);
  assert.throws(() => admitNassAgriculturalQuery({...query,stateAlpha:"M N"}), /stateAlpha/u);
  assert.throws(() => admitNassAgriculturalQuery({...query,commodity:"CORN&key=secret"}), /commodity/u);
});

test("NASS count → real original bytes → immutable verified custody → observational candidate", async () => {
  const provider = fakeNass(),store = contentStore();
  const lot = await acquireNassAgriculturalEdition({apiKey:key,query,sourceStore:store,fetchImpl:provider.fetchImpl,asOf:date,observedAt:"2026-10-24T12:34:56Z"});
  assert.equal(provider.requests.length,2);
  assert.equal(store.saved.size,2);
  assert.equal(lot.recordCount,2);
  assert.equal(lot.observations[0].interpreted.value,177.3);
  assert.equal(lot.observations[0].originalUnit,"BU / ACRE");
  assert.equal(lot.observations[1].interpreted.value,null);
  assert.equal(lot.observations[1].interpreted.meaning,"publisher-suppression-or-nonnumeric");
  assert.equal(lot.observations[1].originalValue,"(D)");
  assert.equal(lot.originalPublisher.name,"USDA National Agricultural Statistics Service");
  assert.match(lot.rawSourceDigest,/^sha256:[a-f0-9]{64}$/u);
  assert.equal(lot.sourceCustody.data.sha256,lot.rawSourceDigest.slice(7));
  assert.equal(lot.metrics.networkRequests,2);
  assert.equal(lot.status,"observed-not-newsroom-approved-not-saleable");
  assert.equal(lot.newsroom.newswireEdition,null);
  assert.equal(lot.newsroom.paidSellerReceipt,null);
  assert.equal(lot.metrics.providerFee,null);
  assert.ok(!JSON.stringify(lot).includes(key),"must never serialize the original API key");
});

test("admission refuses unbounded, mismatched or unverifiable provider responses", async () => {
  {
    const provider = fakeNass({count:251});
    await assert.rejects(
      acquireNassAgriculturalEdition({apiKey:key,query,fetchImpl:provider.fetchImpl,sourceStore:contentStore(),asOf:date}),
      /exceeds approved/u);
    assert.equal(provider.requests.length,1,"refuse oversized count before fetching data");
  }
  {
    const provider = fakeNass({count:2,rows:[row("177.3")]});
    await assert.rejects(
      acquireNassAgriculturalEdition({apiKey:key,query,fetchImpl:provider.fetchImpl,sourceStore:contentStore(),asOf:date}),
      /incomplete/u);
  }
  {
    const provider = fakeNass({count:1,rows:[{...row("177.3"),state_alpha:"WI"}]});
    await assert.rejects(
      acquireNassAgriculturalEdition({apiKey:key,query,fetchImpl:provider.fetchImpl,sourceStore:contentStore(),asOf:date}),
      /outside source query/u);
  }
  {
    const provider = fakeNass({count:1,rows:[row("177.3")]});
    await assert.rejects(
      acquireNassAgriculturalEdition({apiKey:key,query,fetchImpl:provider.fetchImpl,sourceStore:contentStore({tamperRead:true}),asOf:date}),
      /readback/u);
  }
  {
    const provider = fakeNass({count:2,rows:[row("177.3"),row("177.3")]});
    await assert.rejects(
      acquireNassAgriculturalEdition({apiKey:key,query,fetchImpl:provider.fetchImpl,sourceStore:contentStore(),asOf:date}),
      /duplicate identical/u);
  }
  {
    const provider = fakeNass({mediaType:"text/html"});
    await assert.rejects(
      acquireNassAgriculturalEdition({apiKey:key,query,fetchImpl:provider.fetchImpl,sourceStore:contentStore(),asOf:date}),
      /did not return JSON/u);
  }
});
