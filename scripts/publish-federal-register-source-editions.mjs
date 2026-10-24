#!/usr/bin/env node
/**
 * Publish a REAL public-source observation product from the ORIGINAL Newswire
 * source-witness provider. These are source testimony and agent-ready data,
 * not Newsroom-approved stories or paid/settled x402 Newswire releases.
 *
 * The only source network effects occur inside acquireFederalRegisterNewswireWindow:
 * the original official HTTPS API, bounded pages, immutable response bytes,
 * independent byte reread, normalized source editions and rights notice.
 */
import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { acquireFederalRegisterNewswireWindow } from "../src/federal-register-newswire-supply.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "data/records/newswire/federal-register");
const LATEST = resolve(OUT, "latest.json");
const CHANGES = resolve(OUT, "changes.json");
const EVENTS = resolve(OUT, "events.jsonl");
const DEADLINES = resolve(OUT, "comment-deadlines.json");
const CATALOG = resolve(OUT, "catalog.jsonld");
const BASE = "https://raw.githubusercontent.com/red-cup-engineering/paid-data-endpoint-service/main/data/records/newswire/federal-register/";
const SOURCE = "https://www.federalregister.gov";
const MAX_EDITION_BYTES = 5_000_000;
const MAX_EVENT_HISTORY = 2000;
const DAY = 86400_000;
const dateOnly = ms => new Date(ms).toISOString().slice(0, 10);
const publisher = {
  name: "Office of the Federal Register",
  source: "https://www.federalregister.gov/reader-aids/developer-resources/rest-api",
  reproduction: "https://www.archives.gov/federal-register/faqs",
  officialNotice: "The source Federal Register edition, not this derived JSON, is authoritative. No government endorsement.",
};

async function previousJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function previousEvents() {
  try {
    const contents = await readFile(EVENTS, "utf8");
    return contents.split("\n").filter(Boolean).map(line => JSON.parse(line)).slice(-MAX_EVENT_HISTORY);
  } catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
async function atomicText(path, value) {
  const pending = path + "." + randomUUID() + ".tmp";
  await writeFile(pending, value, { mode: 0o644 });
  await rename(pending, path);
}
function sourcePacket(candidate, sourceWindow) {
  const payloadCells = candidate?.potential?.filter(cell => cell.predicate === "data-payload") ?? [];
  if (payloadCells.length !== 1) throw new TypeError("Newswire source has no unique original data-payload claim");
  const item = payloadCells[0].object;
  if (candidate.subject !== item.sourceItemId ||
      typeof item.documentNumber !== "string" ||
      item.sourceEditionUri === undefined ||
      !/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u.test(item.sourceEditionUri) ||
      !/^sha256:[0-9a-f]{64}$/u.test(item.sourceEditionDigest) ||
      !/^sha256:[0-9a-f]{64}$/u.test(item.originalResponseDigest) ||
      item.sourceDocumentUrl !== payloadCells[0].citation ||
      item.observedAt !== sourceWindow.observedAt) {
    throw new TypeError("original Newswire data packet lost its verified source identity");
  }
  return Object.freeze({
    subject: candidate.subject,
    revision: item.sourceEditionUri,
    documentNumber: item.documentNumber,
    documentUrl: item.sourceDocumentUrl,
    title: item.title,
    documentType: item.type,
    publicationDate: item.publicationDate,
    publicationDatePrecision: item.sourceDatePrecision,
    agencies: item.agencyNames,
    ...(item.agencyAttributionCoverage ? {
      agencyAttributionCoverage: item.agencyAttributionCoverage,
      agenciesReported: item.agenciesReported,
      agencyNamesMissing: item.agencyNamesMissing,
    } : {}),
    abstract: item.abstract,
    commentsCloseOn: item.commentsCloseOn,
    commentDeadlineFieldRequested: item.commentDeadlineFieldRequested === true,
    ...(Object.hasOwn(item, "effectiveOn") ? {effectiveOn:item.effectiveOn} : {}),
    ...(Object.hasOwn(item, "sourceAction") ? {sourceAction:item.sourceAction} : {}),
    ...(Object.hasOwn(item, "federalRegisterCitation") ? {federalRegisterCitation:item.federalRegisterCitation} : {}),
    ...(Object.hasOwn(item, "docketIds") ? {docketIds:item.docketIds} : {}),
    ...(Object.hasOwn(item, "regulationIdNumbers") ? {regulationIdNumbers:item.regulationIdNumbers} : {}),
    ...(Object.hasOwn(item, "cfrReferences") ? {cfrReferences:item.cfrReferences} : {}),
    ...(Object.hasOwn(item, "correctionOf") ? {correctionOf:item.correctionOf} : {}),
    ...(Object.hasOwn(item, "corrections") ? {corrections:item.corrections} : {}),
    source: {
      originalApiUrl: item.originalApiUrl,
      originalResponseDigest: item.originalResponseDigest,
      originalResponseUri: item.originalResponseUri,
      normalizedLotDigest: item.inventoryDigest,
      observedAt: item.observedAt,
      provider: SOURCE,
      publisher,
      evidenceClass: "source-dated government metadata, independently replayable from original HTTP bytes held by the source acquisition run",
    },
  });
}
function qualifiedDelta(current, previous, observedAt) {
  const prior = new Map((previous?.documents ?? []).map(p => [p.subject, p]));
  const changes = [];
  for (const item of current) {
    const before = prior.get(item.subject);
    if (before?.revision === item.revision) continue;
    changes.push({
      kind: before ? "source-edition-changed" : "source-document-first-seen",
      observedAt,
      subject: item.subject,
      sourceEdition: item.revision,
      previousEdition: before?.revision ?? null,
      documentNumber: item.documentNumber,
      sourceDocumentUrl: item.documentUrl,
      commentsCloseOn: item.commentsCloseOn,
      effectiveOn: item.effectiveOn ?? null,
    });
  }
  // Disappearance from a rolling source-window is not official withdrawal,
  // deletion, cancellation, or proof the government changed its regulations.
  const noLongerInWindow = [...prior.keys()].filter(key => !current.some(x => x.subject === key));
  return {
    kind: "561.newswire.source-edition-changes.v1",
    observedAt,
    newOrChangedCount: changes.length,
    disappearedFromRollingQueryCount: noLongerInWindow.length,
    disappearanceMeaning: "No withdrawal is inferred from a document leaving the rolling date window.",
    changes: changes.sort((a,b) => a.subject.localeCompare(b.subject)),
  };
}
function dayDelta(deadline, today) {
  const a = Date.parse(deadline + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new TypeError("official comment deadline must be a civil calendar date");
  return Math.round((a - b) / DAY);
}
function commentDeadlines(documents, today, observedAt, coverage) {
  const items = documents.filter(item =>
    item.commentDeadlineFieldRequested && typeof item.commentsCloseOn === "string")
    .map(item => ({
      subject:item.subject,documentNumber:item.documentNumber,title:item.title,
      documentUrl:item.documentUrl,publicationDate:item.publicationDate,
      commentsCloseOn:item.commentsCloseOn,daysAfterUtcDate:dayDelta(item.commentsCloseOn, today),
      agencies:item.agencies,sourceEdition:item.revision,source:item.source.originalApiUrl,
    }))
    .filter(item => item.daysAfterUtcDate >= 0 && item.daysAfterUtcDate <= 30)
    .sort((a,b) => a.daysAfterUtcDate - b.daysAfterUtcDate || a.documentNumber.localeCompare(b.documentNumber));
  return {
    kind:"561.newswire.federal-register-comment-deadlines.v1",
    observedAt,utcCivilDate:today,horizonDays:30,
    sourceCoverage:coverage,recordCount:items.length,
    dateMeaning:"Source-reported civil comment-close date only, not an official time-of-day, active docket verification, or legal advice. Check the original notice for corrections/extensions.",
    records:items,
  };
}
function editionEvents(delta, documents, previous, observedAt) {
  const bySubject = new Map(documents.map(item => [item.subject,item]));
  const prior = new Map((previous?.documents ?? []).map(item => [item.subject,item]));
  return delta.changes.map(change => ({
    specversion:"1.0",
    id:change.sourceEdition,
    source:SOURCE,
    type:"group.561.newswire.federal-register.source-edition-observed.v1",
    subject:change.subject,
    time:observedAt,
    datacontenttype:"application/json",
    data:{
      event:change.kind,
      sourceEdition:change.sourceEdition,
      previousEdition:change.previousEdition,
      previousObservedData:change.previousEdition ? {
        sourceEdition:prior.get(change.subject)?.revision ?? null,
        commentsCloseOn:prior.get(change.subject)?.commentsCloseOn ?? null,
        effectiveOn:prior.get(change.subject)?.effectiveOn ?? null,
      } : null,
      original:bySubject.get(change.subject),
      witness:"Original Federal Register publisher statement; not verified federal legal effect, Newsroom approval, nor commercial settlement",
    },
  }));
}
function catalog(observedAt) {
  return {
    "@context": { "dcat":"http://www.w3.org/ns/dcat#", "dct":"http://purl.org/dc/terms/", "prov":"http://www.w3.org/ns/prov#" },
    "@id": BASE + "latest.json#source-observation-dataset",
    "@type":"dcat:Dataset",
    "dct:title":"Source-verified Federal Register event observation packets",
    "dct:description":"No-cost original government source observations, official comment date windows, exact content-addressed editions and bounded edition deltas. Not independently editorial-approved news, legal advice or settled market goods.",
    "dct:issued":observedAt,
    "dct:publisher":SOURCE,
    "prov:wasDerivedFrom":"https://www.federalregister.gov/api/v1/documents.json",
    "dcat:distribution":[
      { "@type":"dcat:Distribution", "dcat:accessURL":BASE+"latest.json", "dcat:mediaType":"application/json" },
      { "@type":"dcat:Distribution", "dcat:accessURL":BASE+"comment-deadlines.json", "dcat:mediaType":"application/json" },
      { "@type":"dcat:Distribution", "dcat:accessURL":BASE+"changes.json", "dcat:mediaType":"application/json" },
      { "@type":"dcat:Distribution", "dcat:accessURL":BASE+"events.jsonl", "dcat:mediaType":"application/x-ndjson" },
    ],
  };
}
/** Effectful Public receiving performed by the source-owned Engineering service. */
export async function publishFederalRegisterSourceEditions({
  now = () => new Date().toISOString(),
  sourceRoot = process.env.NEWSWIRE_SOURCE_CUSTODY_ROOT,
  outputRoot = OUT,
} = {}) {
  const observedAt = now();
  if (typeof observedAt !== "string" || new Date(observedAt).toISOString() !== observedAt)
    throw new TypeError("one canonical UTC source-observation clock required");
  if (typeof sourceRoot !== "string" || sourceRoot.length === 0)
    throw new TypeError("original source HTTP bytes require an explicit custody root");
  if (outputRoot !== OUT) throw new TypeError("publication path is fixed by original public seller source");
  const nowDate = Date.parse(observedAt);
  const since = dateOnly(nowDate - 7 * DAY), until = dateOnly(nowDate);
  const sourceWindow = await acquireFederalRegisterNewswireWindow({
    search:{since,until,profile:"regulatory-decision"},
    root:sourceRoot,observedAt,perPage:100,maxPages:5,
  });
  if (sourceWindow.sourceCount < 1)
    throw new Error("original government source returned no admissible records; keep last accepted edition");
  const documents = sourceWindow.candidates.map(candidate => sourcePacket(candidate,sourceWindow))
    .sort((a,b)=>a.documentNumber.localeCompare(b.documentNumber));
  if (new Set(documents.map(x=>x.subject)).size !== documents.length)
    throw new TypeError("a source edition repeated the same stable document subject");
  const snapshot = {
    kind:"561.newswire.federal-register-source-observation.v1",
    observedAt,
    source:SOURCE,publisher,query:{since,until,profile:"regulatory-decision",perPage:100,maxPages:5},
    sourcePages:sourceWindow.sourcePages,
    coverage:sourceWindow.coverage,
    costs:sourceWindow.observedCosts,
    editorialStatus:sourceWindow.editorialStatus,
    distributionStatus:"original-source-observation-only",
    paidNewsroomRelease:null,
    merchantSettlement:null,
    documentCount:documents.length,documents,
  };
  const encoded = JSON.stringify(snapshot,null,2)+"\n";
  if(Buffer.byteLength(encoded) > MAX_EDITION_BYTES)throw new RangeError("public source edition exceeded bounded JSON bytes");
  const previous = await previousJson(LATEST);
  const delta = qualifiedDelta(documents,previous,observedAt);
  const events = editionEvents(delta,documents,previous,observedAt);
  const oldEvents = await previousEvents();
  const seen = new Set(oldEvents.map(event=>event.id));
  const accepted = events.filter(event=>!seen.has(event.id));
  const history = [...oldEvents,...accepted].slice(-MAX_EVENT_HISTORY);
  const deadlines = commentDeadlines(documents,until,observedAt,sourceWindow.coverage);
  await mkdir(OUT,{recursive:true});
  await atomicText(LATEST,encoded);
  await atomicText(CHANGES,JSON.stringify(delta,null,2)+"\n");
  await atomicText(EVENTS,history.map(event=>JSON.stringify(event)).join("\n")+"\n");
  await atomicText(DEADLINES,JSON.stringify(deadlines,null,2)+"\n");
  await atomicText(CATALOG,JSON.stringify(catalog(observedAt),null,2)+"\n");
  return {
    publicRoot:BASE,
    acquired:sourceWindow.sourceCount,
    coverageComplete:sourceWindow.coverage.complete,
    sourcePages:sourceWindow.sourcePages.length,
    sourceBytes:sourceWindow.observedCosts.decodedResponseBytes,
    sourceNetworkCalls:sourceWindow.observedCosts.networkRequests,
    effectiveDeadlineRecords:deadlines.recordCount,
    changedEvents:delta.newOrChangedCount,
    newRetainedEvents:accepted.length,
    editorialStatus:snapshot.editorialStatus,
    paidSale:false,
    acquisitionMoneySpentUSD:"0",
    computeAndRepositoryMarginalCost:"unmetered",
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(await publishFederalRegisterSourceEditions())+"\n");
}
