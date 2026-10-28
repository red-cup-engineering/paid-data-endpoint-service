/**
 * Newswire paid query: original seller actor composition ONLY.
 * Publication, query semantics, source admission, merchant rights, mutable
 * entitlement, durable snapshot custody, and x402 settlement belong to their
 * original authorized offices. No original Feed implementation is copied here.
 */
const SHA = /^sha256:[0-9a-f]{64}$/u;
const MAX_QUERY_BYTES = 4096;
const DAY = 86_400_000;
const DEFAULT_MAX_SNAPSHOT_ITEMS = 10_000;
const DEFAULT_MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

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

function httpUrl(value, name) {
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new TypeError(name + ' must be an HTTPS source URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
    throw new TypeError(name + ' must be an HTTPS URL without credentials');
  return parsed.href;
}

function rfc3339Millis(value, name) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new TypeError(name + ' must be a real RFC 3339 timestamp with timezone');
  }
  return Date.parse(value);
}

function boundedJson(value, name, max) {
  let json;
  try { json = JSON.stringify(value); }
  catch { throw new TypeError(name + ' must be finite JSON'); }
  if (typeof json !== 'string') throw new TypeError(name + ' must be finite JSON');
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > max) throw new RangeError(name + ' exceeds qualified maximum bytes');
  return json;
}

// Own the exact finite JSON projection before any asynchronous supplier sees
// it. A shallow freeze leaves verified source payloads mutable; even the
// cryptographic verifier must receive the same immutable value as the query.
function immutableJson(value, name, max) {
  const copy = JSON.parse(boundedJson(value, name, max));
  const pending = [copy];
  while (pending.length) {
    const current = pending.pop();
    if (current === null || typeof current !== 'object') continue;
    for (const part of Object.values(current)) {
      if (part !== null && typeof part === 'object') pending.push(part);
    }
    Object.freeze(current);
  }
  return copy;
}

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(name + ' must be an original injected operation');
  return value;
}

/**
 * Source-qualified admission and fulfillment of an exact edition.
 * All seven needed original operations are mandatory, never default to trust.
 * Both x402 and subscription access use this operation; neither owns a second
 * query selector, source-rights check or immutable release store.
 */
export function createNewswireQueryAccess({
  snapshotStore, verifySnapshot, admitQuery, queryReleased, qualifyRights,
  authorizeRequest, now = Date.now, maxSnapshotAgeMs = DAY,
  maxSnapshotItems = DEFAULT_MAX_SNAPSHOT_ITEMS,
  maxSnapshotBytes = DEFAULT_MAX_SNAPSHOT_BYTES,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
} = {}) {
  if (typeof snapshotStore?.read !== 'function') throw new TypeError('original durable snapshotStore.read is required');
  for (const [label, fn] of Object.entries({verifySnapshot, admitQuery, queryReleased, qualifyRights, authorizeRequest, now})) {
    requireFunction(fn, label);
  }
  if (!Number.isSafeInteger(maxSnapshotAgeMs) || maxSnapshotAgeMs < 60_000 || maxSnapshotAgeMs > 366 * DAY)
    throw new RangeError('snapshot freshness window must be bounded');
  for (const [name, number, min, max] of [
    ['maxSnapshotItems',maxSnapshotItems,1,100_000],
    ['maxSnapshotBytes',maxSnapshotBytes,1024,64 * 1024 * 1024],
    ['maxResponseBytes',maxResponseBytes,1024,8 * 1024 * 1024],
  ]) {
    if (!Number.isSafeInteger(number) || number < min || number > max)
      throw new RangeError(name + ' is outside its bounded merchant resource budget');
  }

  async function qualify(rawRequest, stage, invocationContext) {
    const admitted = admitNewswirePaidQueryRequest(rawRequest);
    // This is a cheap schema gate; it does NOT run the customer's paid query.
    const suppliedPredicate = admitQuery(admitted.query);
    if (suppliedPredicate === null || typeof suppliedPredicate !== 'object' || Array.isArray(suppliedPredicate))
      throw new TypeError('original Newswire must admit a bounded query object');
    const predicate = immutableJson(suppliedPredicate, 'admitted Newswire query', 2 * MAX_QUERY_BYTES);
    const originalSnapshot = await snapshotStore.read({digest: admitted.snapshotDigest});
    if (originalSnapshot === undefined || originalSnapshot === null) throw new Error('requested Newswire release snapshot is unavailable');
    // Reject a plainly excessive or unpublished snapshot BEFORE cloning it.
    // The source-owned cryptographic validator remains a separate MUST.
    if (!Array.isArray(originalSnapshot.public) || originalSnapshot.public.length > maxSnapshotItems) {
      throw new RangeError('Newswire release snapshot exceeds admitted item budget');
    }
    const snapshot = immutableJson(originalSnapshot, 'Newswire release snapshot', maxSnapshotBytes);
    const verified = await verifySnapshot({snapshot, digest: admitted.snapshotDigest});
    if (verified !== true || snapshot.digest !== admitted.snapshotDigest ||
        !Array.isArray(snapshot.public) || snapshot.public.length > maxSnapshotItems)
      throw new Error('original Newswire release snapshot is unverified');
    const at = now();
    if (!Number.isSafeInteger(at)) throw new TypeError('observed clock must be epoch milliseconds');
    httpUrl(snapshot.wireUri, 'original publisher wireUri');
    const sourceSubjects = new Set();
    for (const item of snapshot.public) {
      if (item?.isPublic !== true || typeof item.subject !== 'string' || !item.subject ||
          typeof item.url !== 'string' || sourceSubjects.has(item.subject)) {
        throw new Error('Newswire snapshot has an unreleased or conflicting subject');
      }
      sourceSubjects.add(item.subject);
    }
    const refreshedAt = rfc3339Millis(snapshot.verifiedAt, 'snapshot.verifiedAt');
    if (!Number.isFinite(refreshedAt) || refreshedAt > at + 300_000 || at - refreshedAt > maxSnapshotAgeMs)
      throw new Error('Newswire snapshot verification freshness has expired');
    const suppliedRights = await qualifyRights({snapshot, query: predicate, at, stage, invocationContext});
    if (suppliedRights?.admitted !== true || !suppliedRights.evidenceUri ||
        typeof suppliedRights.evidenceUri !== 'string')
      throw new Error('licensed Newswire distribution has not been authorized');
    const rights = Object.freeze({admitted: true, evidenceUri: suppliedRights.evidenceUri, expiresAt: suppliedRights.expiresAt});
    httpUrl(rights.evidenceUri, 'licensed source evidence');
    const expiresAt = rfc3339Millis(rights.expiresAt, 'rights.expiresAt');
    if (!Number.isFinite(expiresAt) || expiresAt <= at) throw new Error('Newswire source rights evidence has expired');
    const authority = await authorizeRequest({snapshot, query: predicate, at, stage, invocationContext});
    if (authority?.admitted !== true) throw new Error('merchant/buyer authorization refused the Newswire query');
    return Object.freeze({snapshot, predicate, admitted, rights});
  }

  async function execute(rawRequest, stage, invocationContext) {
    const result = await qualify(rawRequest, stage, invocationContext);
    const supplied = await queryReleased(Object.freeze({public: result.snapshot.public}), result.predicate);
    const body = requireObject(immutableJson(supplied, 'Newswire purchased query output', maxResponseBytes), 'original Newswire query result');
    if (!Array.isArray(body.items) || body.returnedCount !== body.items.length ||
        !Number.isSafeInteger(body.returnedCount) || body.returnedCount > 100 ||
        !Number.isSafeInteger(body.totalMatched) || body.totalMatched < body.returnedCount ||
        typeof body.truncated !== 'boolean' || body.truncated !== (body.totalMatched > body.returnedCount))
      throw new Error('original Newswire query returned unbounded or inconsistent results');
    const currentSubjects = new Set(result.snapshot.public.map((item) => item.subject));
    if (body.items.some((item) => !item || typeof item.subject !== 'string' ||
        !currentSubjects.has(item.subject)) || new Set(body.items.map(item => item.subject)).size !== body.items.length) {
      throw new Error('original Newswire query returned an unapproved or duplicate source subject');
    }
    if ((Object.hasOwn(body,'settlement') && body.settlement !== null) ||
        (Object.hasOwn(body,'buyerAcceptance') && body.buyerAcceptance !== null)) {
      throw new Error('Newswire data query may not manufacture payment or customer receiving');
    }
    return Object.freeze({
      snapshotDigest: result.snapshot.digest,
      publishedWire: result.snapshot.wireUri,
      result: body,
      qualifiedRightsEvidence: result.rights.evidenceUri,
    });
  }
  return Object.freeze({qualify, execute});
}

export function createNewswirePaidQueryHandlers(options = {}) {
  const access = createNewswireQueryAccess(options);
  async function admit({request} = {}) {
    const result = await access.qualify(request?.body, 'pre-payment', {request});
    return Object.freeze({admitted: true, snapshotDigest: result.snapshot.digest});
  }
  async function execute({intent, settlement} = {}) {
    // Bound to the original actor's durably saved exact paid invocation request.
    const delivery = await access.execute(intent?.request, 'after-settlement', {intent, settlement});
    return Object.freeze({
      type: 'NewswirePaidQueryDelivery',
      schemaVersion: '561.newswire.paid-query.v1',
      ...delivery,
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
  authorizeRequest, now, maxSnapshotAgeMs, maxSnapshotItems, maxSnapshotBytes, maxResponseBytes,
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
    maxSnapshotItems, maxSnapshotBytes, maxResponseBytes,
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
