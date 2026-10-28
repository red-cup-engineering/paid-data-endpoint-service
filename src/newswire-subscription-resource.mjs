import { admitNewswireSubscriptionRequest, NewswireSubscriptionRefusal } from './newswire-subscription.mjs';

const MAX_REQUEST_BYTES = 16 * 1024;
const PRIVATE_HEADERS = Object.freeze({
  'cache-control': 'private, no-store',
  'vary': 'Authorization, Cookie',
  'x-content-type-options': 'nosniff',
});

function response(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...PRIVATE_HEADERS, ...headers } });
}

/** A resource for the existing HTTP application composer, with no listener,
 * credentials, subscription store or billing effects of its own. */
export function createNewswireSubscriptionResource({ subscriptions, path = '/v1/newswire/subscription/query', authenticationChallenge } = {}) {
  if (typeof subscriptions?.execute !== 'function')
    throw new TypeError('original Newswire subscription handlers are required');
  if (typeof path !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/u.test(path))
    throw new TypeError('subscription resource requires a fixed local path');
  if (authenticationChallenge !== undefined && (typeof authenticationChallenge !== 'string' ||
      !authenticationChallenge.trim() || authenticationChallenge.length > 1024 || /[^\x20-\x7e]/u.test(authenticationChallenge)))
    throw new TypeError('authentication challenge must be a bounded HTTP field value');

  return Object.freeze({
    match: path,
    methods: Object.freeze(['POST']),
    body: Object.freeze({ maxBytes: MAX_REQUEST_BYTES, maxEncodedBytes: MAX_REQUEST_BYTES }),
    async handler(context) {
      for (const [name, value] of Object.entries(PRIVATE_HEADERS)) context.responseHeaders.set(name, value);
      if (context.url.search) return response({ error: 'invalid-subscription-request' }, 400);
      // The original composer owns both bounded intake and BodyReadError.
      // Let that same installed supplier classify its own parser failures.
      const body = await context.input.json();
      try {
        admitNewswireSubscriptionRequest(body);
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError)
          return response({ error: 'invalid-subscription-request' }, 400);
        return response({ error: 'subscription-delivery-unavailable' }, 503);
      }
      try {
        const delivery = await subscriptions.execute({ request: context.request, body });
        return response(delivery);
      } catch (error) {
        if (error instanceof NewswireSubscriptionRefusal) {
          if (error.status === 401) {
            // The access provider chooses its authentication scheme. A 401
            // must carry its challenge; do not invent a Bearer or cookie login.
            return authenticationChallenge === undefined
              ? response({ error: error.code }, 403)
              : response({ error: error.code }, 401, { 'www-authenticate': authenticationChallenge });
          }
          return response({ error: error.code }, error.status);
        }
        // Provider failures and unqualified output do not become a claim that
        // the customer is unauthorized. Never expose provider diagnostics.
        return response({ error: 'subscription-delivery-unavailable' }, 503);
      }
    },
  });
}
