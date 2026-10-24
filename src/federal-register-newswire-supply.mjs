import { inventoryDigest } from "./federal-register-inventory.mjs";
import {
  acquireWitnessedFederalRegisterInventory,
  verifyWitnessedFederalRegisterInventory,
} from "./federal-register-source-witness.mjs";

const namedInformationUri = digest => {
  if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(digest)) {
    throw new TypeError("original source edition requires a full SHA-256 digest");
  }
  return "ni:///sha-256;" + Buffer.from(digest.slice(7), "hex").toString("base64url");
};

// Source-owned observation -> Newsroom claim-set candidates. No model,
// summary hallucination, second event store, automatic desk clearance, or
// counterfeit Federal Register authorship. The original Newsroom must receive
// and approve these claims before the original Newswire publishes them.
const candidate = (record, lot) => {
  const documentUri = new URL(record.html_url);
  const stableId = "federal-register:" + record.document_number;
  const sourceEditionDigest = inventoryDigest(record);
  const acquisition = lot.source.acquisition;
  const payload = {
    kind:"federal-register-document-observation",
    sourceItemId:stableId,
    sourceEditionDigest,
    sourceEditionUri:namedInformationUri(sourceEditionDigest),
    sourceDocumentUrl:documentUri.href,
    documentNumber:record.document_number,
    title:record.title,
    publicationDate:record.publication_date,
    sourceDatePrecision:"civil-day",
    type:record.type,
    agencyNames:record.agency_names,
    ...(record.agency_names_missing ? {
      agencyNamesMissing:record.agency_names_missing,
      agenciesReported:record.agencies_reported,
      agencyAttributionCoverage:"partial",
    } : {}),
    abstract:record.abstract,
    commentsCloseOn:record.comments_close_on,
    originalApiUrl:lot.source.apiUrl,
    originalResponseDigest:acquisition.responseDigest,
    originalResponseUri:namedInformationUri(acquisition.responseDigest),
    observedAt:lot.observedAt,
    inventoryDigest:lot.digest,
    reportedPageComplete:lot.source.pageComplete,
  };
  // Source-originated Claims are potential, not publication acceptance. The
  // writer/issuer is the original Federal Register URL. The local original
  // Newsroom must attach actual publication/approval PROV-O and release gates.
  const cells = [
    {predicate:"headline", object:record.title, citation:documentUri.href},
    {predicate:"summary", object:record.abstract ?? `${record.type} from the Office of the Federal Register, dated ${record.publication_date}`, citation:documentUri.href},
    {predicate:"publication-kind",object:"data-bulletin",citation:documentUri.href},
    {predicate:"data-payload",object:payload,citation:documentUri.href},
    {predicate:"category",object:"federal-register",citation:documentUri.href},
    {predicate:"category",object:"public-record",citation:documentUri.href},
    {predicate:"category",object:record.type.toLowerCase(),citation:documentUri.href},
    ...record.agency_names.map(agency=>({predicate:"category",object:agency,citation:documentUri.href})),
  ];
  return Object.freeze({
    subject:stableId,
    potential:Object.freeze(cells),
  });
};

// Preparation only, with an exact verified raw source receipt. A new edition
// of a Federal Register document retains the same subject; its record digest
// changes. A different document is a different canonical subject.
export async function prepareFederalRegisterNewswireCandidates({lot, root, byteStore}={}) {
  const evidence = await verifyWitnessedFederalRegisterInventory({lot,root,byteStore});
  if (evidence.verified !== true) throw new Error("official source evidence not independently received");
  const candidates = lot.records.map(record=>candidate(record,lot));
  return Object.freeze({
    kind:"561.newswire.source-candidate-set.v1",
    source:"https://www.federalregister.gov",
    originalSourceRequestUrl:lot.source.apiUrl,
    originalResponseBytes:lot.source.acquisition.responseBytes,
    rawResponseDigest:evidence.originalResponseDigest,
    rawResponseUri:namedInformationUri(evidence.originalResponseDigest),
    normalizedLotDigest:lot.digest,
    normalizedLotUri:namedInformationUri(lot.digest),
    observedAt:lot.observedAt,
    sourceCount:lot.recordCount,
    coverage: Object.freeze({
      reportedTotal:lot.source.totalResultsReported,
      pageComplete:lot.source.pageComplete,
    }),
    editorialStatus:"not-approved",
    candidates:Object.freeze(candidates),
  });
}

// A real source-backed acquisition entrypoint: caller selects exact official
// search window, finite retrieval budget and existing original custody. Output
// goes to original Newsroom, not directly to public Newswire or Market.
export async function acquireFederalRegisterNewswireCandidates({
  search, root, byteStore, fetchImpl, observedAt, maxBytes,
}={}) {
  const lot = await acquireWitnessedFederalRegisterInventory({
    search, root, byteStore,
    ...(fetchImpl===undefined?{}:{fetchImpl}),
    ...(observedAt===undefined?{}:{observedAt}),
    ...(maxBytes===undefined?{}:{maxBytes}),
  });
  return prepareFederalRegisterNewswireCandidates({lot,root,byteStore});
}

// One bounded original official API window, acquired ONCE per page. It does
// not invent a cross-page source or claim that a partial observed index is
// complete. Distinct page bodies remain separately immutable in original
// content-addressed custody; derived events reuse the same source identities.
export async function acquireFederalRegisterNewswireWindow({
  search, root, byteStore, fetchImpl, observedAt, maxBytes,
  perPage = 100, maxPages = 5,
}={}) {
  if (!search || typeof search !== "object" || Array.isArray(search)) {
    throw new TypeError("original bounded Federal Register window requires exact search criteria");
  }
  if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 20) {
    throw new RangeError("source window needs 1-100 results/page and 1-20 pages");
  }
  const start = search.page ?? 1;
  if (!Number.isSafeInteger(start) || start < 1 || (start + maxPages - 1) * perPage > 2000) {
    throw new RangeError("official Federal Register supports only its first 2000 search matches");
  }
  const clock = observedAt ?? new Date().toISOString();
  const batches = [];
  const bySubject = new Map();
  const contested = new Set();
  let bytes = 0;
  let reportedTotal = null;
  let conflictingCoverage = false;
  let providerComplete = false;
  for (let page = start; page < start + maxPages; page++) {
    const received = await acquireFederalRegisterNewswireCandidates({
      search:{...search,perPage,page},root,byteStore,
      ...(fetchImpl===undefined?{}:{fetchImpl}),
      observedAt:clock,
      ...(maxBytes===undefined?{}:{maxBytes}),
    });
    bytes += received.originalResponseBytes;
    if (reportedTotal === null) reportedTotal = received.coverage.reportedTotal;
    else if (received.coverage.reportedTotal !== reportedTotal) conflictingCoverage = true;
    batches.push(Object.freeze({
      page, count:received.sourceCount,
      requestUrl:received.originalSourceRequestUrl,
      originalResponseBytes:received.originalResponseBytes,
      rawResponseDigest:received.rawResponseDigest,
      normalizedLotDigest:received.normalizedLotDigest,
      reportedTotal:received.coverage.reportedTotal,
      providerPageComplete:received.coverage.pageComplete,
    }));
    for (const candidate of received.candidates) {
      const record = candidate.potential.find(cell=>cell.predicate==="data-payload")?.object;
      if (!record?.sourceEditionDigest || !record.sourceDocumentUrl) {
        throw new TypeError("original data candidate lost its witnessed source revision");
      }
      const previous = bySubject.get(candidate.subject);
      if (previous === undefined) bySubject.set(candidate.subject,candidate);
      else {
        const old = previous.potential.find(cell=>cell.predicate==="data-payload")?.object;
        if (old?.sourceEditionDigest !== record.sourceEditionDigest ||
            old?.sourceDocumentUrl !== record.sourceDocumentUrl) {
          contested.add(candidate.subject);
        }
      }
    }
    if (received.coverage.pageComplete === true) { providerComplete = true; break; }
  }
  // Never silently select a "latest" incompatible record just because the
  // provider changed while paginating. Preserve observed page receipts and
  // refuse contested candidates from downstream newsroom admission.
  for (const subject of contested) bySubject.delete(subject);
  const receivedItems = [...bySubject.values()].sort((a,b)=>a.subject.localeCompare(b.subject));
  const complete = providerComplete && !conflictingCoverage && contested.size === 0;
  return Object.freeze({
    kind:"561.newswire.source-candidate-window.v1",
    source:"https://www.federalregister.gov",
    observedAt:clock,
    editorialStatus:"not-approved",
    candidates:Object.freeze(receivedItems),
    sourceCount:receivedItems.length,
    sourcePages:Object.freeze(batches),
    coverage:Object.freeze({
      providerReportedTotal:reportedTotal,
      complete,
      partial:!complete,
      conflictingCoverage,
      contestedSourceSubjects:Object.freeze([...contested].sort()),
      pagesRead:batches.length,
      returnedRecords:receivedItems.length,
    }),
    observedCosts:Object.freeze({
      networkRequests:batches.length,
      decodedResponseBytes:bytes,
      immutableSourceResponses:batches.length,
      agentInferenceCalls:0,
    }),
  });
}
