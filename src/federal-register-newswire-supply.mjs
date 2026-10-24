import { inventoryDigest } from "./federal-register-inventory.mjs";
import {
  acquireWitnessedFederalRegisterInventory,
  verifyWitnessedFederalRegisterInventory,
} from "./federal-register-source-witness.mjs";

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
    sourceDocumentUrl:documentUri.href,
    documentNumber:record.document_number,
    title:record.title,
    publicationDate:record.publication_date,
    sourceDatePrecision:"civil-day",
    type:record.type,
    agencyNames:record.agency_names,
    abstract:record.abstract,
    commentsCloseOn:record.comments_close_on,
    originalApiUrl:lot.source.apiUrl,
    originalResponseDigest:acquisition.responseDigest,
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
    rawResponseDigest:evidence.originalResponseDigest,
    normalizedLotDigest:lot.digest,
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
