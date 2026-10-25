import { isDeepStrictEqual } from 'node:util';
import { createNewswireQueryAccess } from './paid-newswire-query.mjs';

const CHANNELS = new Set(['machine-data', 'newsletter', 'social']);
const MEDIA_TYPES = new Set(['text/plain', 'text/html', 'text/markdown']);
const SHA = /^sha256:[0-9a-f]{64}$/u;
const MAX_ENTITLEMENT_BYTES = 64 * 1024;

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(label + ' must be an object');
  return value;
}
function text(value, label, max = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new TypeError(label + ' must be bounded nonempty text');
  return value;
}
function bounded(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError(label + ' is outside the subscription scope');
  return value;
}
function bytes(value) { return Buffer.byteLength(JSON.stringify(value), 'utf8'); }
function freezeProjection(value) {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (current === null || typeof current !== 'object' || Object.isFrozen(current)) continue;
    for (const part of Object.values(current)) {
      if (part !== null && typeof part === 'object') pending.push(part);
    }
    Object.freeze(current);
  }
  return value;
}
function operation(value, label) {
  if (typeof value !== 'function') throw new TypeError(label + ' must be an original injected operation');
  return value;
}
function reference(value, label, httpsOnly = false) {
  text(value, label);
  let uri;
  try { uri = new URL(value); } catch { throw new TypeError(label + ' must be an absolute reference'); }
  if (uri.username || uri.password || (httpsOnly ? uri.protocol !== 'https:' :
      !['https:', 'urn:', 'ni:'].includes(uri.protocol)))
    throw new TypeError(label + ' must be a credential-free reference');
  return value;
}
function instant(value, label) {
  const parts = typeof value === 'string' &&
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value)) ||
      !Number.isFinite(Date.parse(parts[1] + 'T00:00:00Z')) ||
      new Date(parts[1] + 'T00:00:00Z').toISOString().slice(0, 10) !== parts[1] ||
      Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59 ||
      (parts[5] !== 'Z' && (Number(parts[5].slice(1, 3)) > 23 || Number(parts[5].slice(4)) > 59)))
    throw new TypeError(label + ' must be a real RFC 3339 instant');
  return Date.parse(value);
}

export function admitNewswireSubscriptionRequest(value) {
  const raw = object(value, 'subscription request');
  const required = ['snapshotDigest', 'subscriptionId', 'profileId', 'channel'];
  if (required.some(key => !Object.hasOwn(raw, key)) ||
      Object.keys(raw).some(key => ![...required, 'limit', 'offset'].includes(key)) ||
      typeof raw.snapshotDigest !== 'string' || !SHA.test(raw.snapshotDigest) || !CHANNELS.has(raw.channel))
    throw new TypeError('subscription request requires an exact snapshot, subscription, profile and channel');
  return Object.freeze({
    snapshotDigest: raw.snapshotDigest,
    subscriptionId: text(raw.subscriptionId, 'subscriptionId'),
    profileId: text(raw.profileId, 'profileId', 256),
    channel: raw.channel,
    ...(raw.limit === undefined ? {} : {limit: bounded(raw.limit, 'limit', 1, 100)}),
    offset: bounded(raw.offset === undefined ? 0 : raw.offset, 'offset', 0, 10_000),
  });
}

function entitlementProjection(value, input, subscriber, at, admitQuery) {
  const raw = object(value, 'current subscription');
  if (bytes(raw) > MAX_ENTITLEMENT_BYTES) throw new RangeError('current subscription exceeds bounded contract size');
  if (raw.admitted !== true || raw.status !== 'active' ||
      raw.subscriptionId !== input.subscriptionId || raw.subscriber !== subscriber)
    throw new Error('current subscription is inactive or belongs to another subscriber');
  const notBefore = instant(raw.notBefore, 'subscription.notBefore');
  const expiresAt = instant(raw.expiresAt, 'subscription.expiresAt');
  if (notBefore > at || expiresAt <= at || expiresAt <= notBefore)
    throw new Error('current subscription is outside its validity period');
  if (!Array.isArray(raw.profiles) || raw.profiles.length < 1 || raw.profiles.length > 32 ||
      new Set(raw.profiles.map(profile => profile?.id)).size !== raw.profiles.length)
    throw new TypeError('subscription requires unique bounded access profiles');
  const profiles = raw.profiles.map(candidate => {
    const profile = object(candidate, 'subscription profile');
    const id = text(profile.id, 'profile.id', 256);
    if (!Array.isArray(profile.channels) || profile.channels.length < 1 || profile.channels.length > 3 ||
        new Set(profile.channels).size !== profile.channels.length || profile.channels.some(channel => !CHANNELS.has(channel)))
      throw new TypeError('subscription profile requires explicit delivery channels');
    const maxPageSize = bounded(profile.maxPageSize, 'profile.maxPageSize', 1, 100);
    const maxOffset = bounded(profile.maxOffset, 'profile.maxOffset', 0, 10_000);
    const maxResponseBytes = bounded(profile.maxResponseBytes, 'profile.maxResponseBytes', 1024, 8 * 1024 * 1024);
    const query = object(profile.query, 'subscription query profile');
    if (Object.hasOwn(query, 'limit') || Object.hasOwn(query, 'offset'))
      throw new TypeError('subscription pagination belongs to profile limits');
    // The original Newswire alone defines and normalizes predicate semantics.
    const admittedQuery = admitQuery({...query, limit: maxPageSize, offset: 0});
    object(admittedQuery, 'admitted subscription query');
    return {id, channels: [...profile.channels], query: structuredClone(admittedQuery), maxPageSize, maxOffset, maxResponseBytes};
  });
  const selected = profiles.find(profile => profile.id === input.profileId);
  if (!selected || !selected.channels.includes(input.channel)) throw new Error('subscription does not admit the selected profile/channel');
  bounded(input.limit ?? selected.maxPageSize, 'requested page size', 1, selected.maxPageSize);
  bounded(input.offset, 'requested offset', 0, selected.maxOffset);
  return freezeProjection({
    subscriptionId: input.subscriptionId,
    subscriber,
    revision: text(raw.revision, 'current subscription revision'),
    contractRef: reference(raw.contractRef, 'subscription contract'),
    notBefore,
    expiresAt,
    wireUri: reference(raw.wireUri, 'subscription resource', true),
    profiles,
    selected,
  });
}

function renditionProjection(value, delivery, maxBytes) {
  const raw = object(value, 'editorial rendition');
  const subjects = delivery.result.items.map(item => item.subject);
  if (raw.snapshotDigest !== delivery.snapshotDigest || !Array.isArray(raw.subjects) ||
      raw.subjects.length !== subjects.length || new Set(raw.subjects).size !== subjects.length ||
      raw.subjects.some(subject => !subjects.includes(subject)))
    throw new Error('editorial rendition must preserve the exact snapshot and source subjects');
  if (!MEDIA_TYPES.has(raw.mediaType) || typeof raw.body !== 'string')
    throw new TypeError('editorial rendition requires an admitted text media type and body');
  if (Buffer.byteLength(raw.body, 'utf8') > maxBytes) throw new RangeError('editorial rendition exceeds the subscription byte budget');
  return Object.freeze({
    snapshotDigest: delivery.snapshotDigest,
    subjects: Object.freeze([...raw.subjects]),
    editionUri: reference(raw.editionUri, 'editorial edition'),
    publicationReceiptUri: reference(raw.publicationReceiptUri, 'editorial publication receipt'),
    mediaType: raw.mediaType,
    body: raw.body,
  });
}

/**
 * Read access to an existing paid subscription. Authentication, billing,
 * current contracts and renewal/revocation remain with their original owners.
 * This operation creates no seller, notification destination or subscription.
 */
export function createNewswireSubscriptionQueryHandlers({
  authenticateSubscriber, resolveSubscription, renderRendition, verifyRendition,
  now = Date.now, ...options
} = {}) {
  operation(authenticateSubscriber, 'authenticateSubscriber');
  operation(resolveSubscription, 'resolveSubscription');
  operation(options.authorizeRequest, 'authorizeRequest');
  operation(options.admitQuery, 'admitQuery');
  operation(now, 'now');
  if (renderRendition !== undefined || verifyRendition !== undefined) {
    operation(renderRendition, 'renderRendition');
    operation(verifyRendition, 'verifyRendition');
  }
  const clock = () => {
    const at = now();
    if (!Number.isSafeInteger(at)) throw new TypeError('observed subscription clock must be epoch milliseconds');
    return at;
  };
  const access = createNewswireQueryAccess({
    ...options, now: clock,
    authorizeRequest: async context => {
      if (context.snapshot.wireUri !== context.invocationContext.subscription.wireUri)
        throw new Error('subscription does not cover this Newswire resource');
      return options.authorizeRequest(context);
    },
  });

  async function current(input, subscriber, stage) {
    const resolved = await resolveSubscription({subscriptionId: input.subscriptionId, subscriber, at: clock(), stage});
    return entitlementProjection(resolved, input, subscriber, clock(), options.admitQuery);
  }

  async function execute({request} = {}) {
    const input = admitNewswireSubscriptionRequest(request?.body);
    const subscriber = text(await authenticateSubscriber({request}), 'authenticated subscriber');
    const subscription = await current(input, subscriber, 'subscription-query');
    const profile = subscription.selected;
    if (input.channel !== 'machine-data' && !renderRendition)
      throw new Error('the original editorial renderer and independent verifier are not configured');
    const query = {...profile.query, limit: input.limit ?? profile.maxPageSize, offset: input.offset};
    const context = Object.freeze({request, subscriber, subscription, channel: input.channel, profileId: input.profileId});
    const queryRequest = {snapshotDigest: input.snapshotDigest, query};
    const delivered = await access.execute(queryRequest, 'subscription-query', context);
    if (delivered.result.returnedCount > query.limit)
      throw new Error('original Newswire exceeded the subscription page limit');
    let rendition;
    if (input.channel !== 'machine-data') {
      const rendered = await renderRendition({channel: input.channel, delivery: structuredClone(delivered)});
      rendition = renditionProjection(rendered, delivered, profile.maxResponseBytes);
      if (await verifyRendition({channel: input.channel, rendition, delivery: structuredClone(delivered)}) !== true)
        throw new Error('the original editorial authority did not receive this rendition');
    }

    // Retained data stays local until both current rights and current subscriber
    // authority are re-observed after potentially slow query/rendering work.
    const requalified = await access.qualify(queryRequest, 'subscription-delivery', context);
    const currentSubscriber = text(await authenticateSubscriber({request}), 'authenticated subscriber');
    if (currentSubscriber !== subscriber) throw new Error('authenticated subscriber changed before delivery');
    const latest = await current(input, subscriber, 'subscription-delivery');
    if (!isDeepStrictEqual(subscription, latest)) throw new Error('subscription revision or scope changed before delivery');
    const at = clock();
    if (latest.expiresAt <= at || instant(requalified.rights.expiresAt, 'rights.expiresAt') <= at)
      throw new Error('subscription or source rights expired before delivery');
    const response = Object.freeze({
      type: 'NewswireSubscriptionDelivery',
      schemaVersion: '561.newswire.subscription-delivery.v1',
      snapshotDigest: delivered.snapshotDigest,
      publishedWire: delivered.publishedWire,
      profileId: input.profileId,
      channel: input.channel,
      subscriptionRevision: latest.revision,
      contractRef: latest.contractRef,
      qualifiedRightsEvidence: requalified.rights.evidenceUri,
      ...(rendition === undefined ? {result: delivered.result} : {rendition}),
      paymentReceipt: null,
    });
    if (bytes(response) > Math.min(profile.maxResponseBytes, options.maxResponseBytes ?? 1024 * 1024))
      throw new RangeError('subscription delivery exceeds the response byte budget');
    return response;
  }
  return Object.freeze({execute});
}
