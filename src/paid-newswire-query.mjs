/**
 * Newswire paid query: original seller actor composition ONLY.
 * Publication, query semantics, source admission, merchant rights, mutable
 * entitlement, durable snapshot custody, and x402 settlement belong to their
 * original authorized offices. No original Feed implementation is copied here.
 */
const SHA = /^sha256:[0-9a-f]{64}$/u;
const MAX_QUERY_BYTES = 4096;
const DAY = 86_400_000;

function requireObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(name + ' must be an object');
  return value;
}

export function admitNewswirePaidQueryRequest(request) {
  const value = requireObject(request, 'paid Newswire request');
  if (Object.keys(value).length !== 2 || !Object.hasOwn(value, 'snapshotDigest') ||
      !Object.hasOwn(value, 'query') || typeof value.snapshotDigest !== 'string' ||
      !SHA.test(value.snapshotDigest)) {
    throw new TypeError('paid Newswire request requires exactly snapshotDigest and query');
  }
  const query = requireObject(value.query, 'Newswire query');
  const inputBytes = Buffer.byteLength(JSON.stringify(query) ?? '', 'utf8');
  if (inputBytes < 2 || inputBytes > MAX_QUERY_BYTES) throw new RangeError('query JSON exceeds 4096-byte bound');
  return Object.freeze({ snapshotDigest: value.snapshotDigest, query: structuredClone(query) });
}

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(name + ' must be an original injected operation');
  return value;
}

/**
 * Source-qualified paid admission and fulfillment of an exact edition.
 * All seven needed original operations are mandatory, never default to trust.
 */
export function createNewswirePaidQueryHandlers({
  snapshotStore, verifySnapshot, admitQuery, queryReleased, qualifyRights,
  authorizeRequest, now = Date.now, maxSnapshotAgeMs = DAY,
} = {}) {
  if (typeof snapshotStore?.read !== 'function') throw new TypeError('original durable snapshotStore.read is required');
  for (const [label, fn] of Object.entries({verifySnapshot, admitQuery, queryReleased, qualifyRights, authorizeRequest, now})) {
    requireFunction(fn, label);
  }
  if (!Number.isSafeInteger(maxSnapshotAgeMs) || maxSnapshotAgeMs < 60_000 || maxSnapshotAgeMs > 366 * DAY)
    throw new RangeError('snapshot freshness window must be bounded');

  async function qualify(rawRequest, stage, invocationContext) {
    const admitted = admitNewswirePaidQueryRequest(rawRequest);
    // This is a cheap schema gate; it does NOT run the customer's paid query.
    const predicate = admitQuery(admitted.query);
    if (predicate === null || typeof predicate !== 'object' || Array.isArray(predicate))
      throw new TypeError('original Newswire must admit a bounded query object');
    const originalSnapshot = await snapshotStore.read({digest: admitted.snapshotDigest});
    if (originalSnapshot === undefined || originalSnapshot === null) throw new Error('requested Newswire release snapshot is unavailable');
    const snapshot = structuredClone(originalSnapshot);
    const verified = await verifySnapshot({snapshot, digest: admitted.snapshotDigest});
    if (verified !== true || snapshot.digest !== admitted.snapshotDigest ||
        !Array.isArray(snapshot.public)) throw new Error('original Newswire release snapshot is unverified');
    const at = now();
    if (!Number.isSafeInteger(at)) throw new TypeError('observed clock must be epoch milliseconds');
    const refreshedAt = Date.parse(snapshot.verifiedAt);
    if (!Number.isFinite(refreshedAt) || refreshedAt > at + 300_000 || at - refreshedAt > maxSnapshotAgeMs)
      throw new Error('Newswire snapshot verification freshness has expired');
    const rights = await qualifyRights({snapshot, query: predicate, at, stage, invocationContext});
    if (rights?.admitted !== true || !rights.evidenceUri ||
        typeof rights.evidenceUri !== 'string' || !rights.evidenceUri.startsWith('https://'))
      throw new Error('licensed Newswire distribution has not been authorized');
    const expiresAt = Date.parse(rights.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= at) throw new Error('Newswire source rights evidence has expired');
    const authority = await authorizeRequest({snapshot, query: predicate, at, stage, invocationContext});
    if (authority?.admitted !== true) throw new Error('merchant/buyer authorization refused the Newswire query');
    return Object.freeze({snapshot, predicate, admitted, rights});
  }

  async function admit({request} = {}) {
    const result = await qualify(request?.body, 'pre-payment', {request});
    return Object.freeze({admitted: true, snapshotDigest: result.snapshot.digest});
  }

  async function execute({intent, settlement} = {}) {
    // Bound to the original actor's durably saved exact paid invocation request.
    const result = await qualify(intent?.request, 'after-settlement', {intent, settlement});
    const supplied = await queryReleased({public: result.snapshot.public}, result.predicate);
    const body = requireObject(supplied, 'original Newswire query result');
    if (!Array.isArray(body.items) || body.returnedCount !== body.items.length ||
        !Number.isInteger(body.returnedCount) || body.returnedCount > 100)
      throw new Error('original Newswire query returned unbounded or inconsistent results');
    return Object.freeze({
      type: 'NewswirePaidQueryDelivery',
      schemaVersion: '561.newswire.paid-query.v1',
      snapshotDigest: result.snapshot.digest,
      publishedWire: result.snapshot.wireUri,
      result: structuredClone(body),
      qualifiedRightsEvidence: result.rights.evidenceUri,
      paymentReceipt: null,
      receiving: 'The original durable x402 actor separately owns settlement and receiver acceptance.',
    });
  }
  return Object.freeze({admit, execute});
}

/**
 * Original Red Cup x402 receipt, idempotence and book-keeping remain untouched.
 * The server's seller config is never chosen, fabricated or inferred by data.
 */
export async function createNewswirePaidQueryActor({
  snapshotStore, verifySnapshot, admitQuery, queryReleased, qualifyRights,
  authorizeRequest, now, maxSnapshotAgeMs,
  sellerOffer, priceTerms, append, recoveredRecords,
  basePath = '/x402/newswire/query', facilitatorUrl, facilitatorClient,
  actorFactory, paymentBoundaryFactory, paymentIdentity, settlementProjection,
} = {}) {
  requireObject(sellerOffer, 'independently approved Newswire sellerOffer');
  if (typeof append !== 'function' || !(recoveredRecords?.intents instanceof Map) ||
      !(recoveredRecords?.terminals instanceof Map))
    throw new TypeError('seller original durable append and recovered intent/terminal journal are required');
  const handlers = createNewswirePaidQueryHandlers({
    snapshotStore, verifySnapshot, admitQuery, queryReleased, qualifyRights,
    authorizeRequest, now, maxSnapshotAgeMs,
  });
  const formActor = actorFactory ?? (await import('./paid-data-endpoint.mjs')).createPaidDataEndpointActor;
  const payment = paymentBoundaryFactory ??
    (await import('@red-cup-engineering/x402-services-section/server')).createExactEvmPaymentBoundary;
  requireFunction(formActor, 'original paid-data actor');
  requireFunction(payment, 'original x402 payment boundary');
  return formActor({
    operation:'read-data', basePath, offer: Object.freeze({
      ...sellerOffer,
      kind:'QualifiedNewswireTopicQuery',
      consideration:'Value-added topic filtering, search and provenance over lawful published editions',
      inputShape:{snapshotDigest:'sha256:<64 lowercase hex>',query:'bounded Newswire topic/source/time query'},
      noExclusiveRightsToPublicFacts:true,
    }),
    priceTerms, admit:handlers.admit, execute:handlers.execute,
    append, recoveredRecords, paymentBoundaryFactory:payment,
    ...(facilitatorUrl === undefined ? {} : {facilitatorUrl}),
    ...(facilitatorClient === undefined ? {} : {facilitatorClient}),
    ...(paymentIdentity === undefined ? {} : {paymentIdentity}),
    ...(settlementProjection === undefined ? {} : {settlementProjection}),
  });
}
