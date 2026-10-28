# Newswire subscription access

## Receiving requirement

An authenticated subscriber can retrieve a bounded page of a provider-defined
Newswire product, either as machine data or as an independently accepted
newsletter or social rendition. Every form names the same immutable Newswire
snapshot and source subjects. The existing x402 query remains available.

## Ownership and contract

The original subscription owner authenticates the customer and resolves the
**current** paid contract. This package stores no subscription, price, payment,
renewal, quota or notification destination. In particular, the existing Release
Notice Distribution Service's notice consent is not authority to query data.
Its owner must explicitly issue the access scopes below before it can supply
this interface. Billing activation and outbound sending are separate operations.

`createNewswireSubscriptionQueryHandlers` consumes the same snapshot store,
verification, query admission/execution, source-rights and merchant-authorization
operations as `createNewswirePaidQueryHandlers`. Additional suppliers are:

- `authenticateSubscriber({request})`: returns the authenticated subscriber ID.
- `resolveSubscription({subscriptionId, subscriber, at, stage})`: returns a
  current verified contract projection, or refuses. Its result contains
  `admitted: true`, `subscriptionId`, `subscriber`, `revision`, `contractRef`,
  `status: "active"`, `notBefore`, `expiresAt`, `wireUri` and `profiles`.
- Each profile contains a unique `id`, explicit `channels` drawn from
  `machine-data`, `newsletter`, `social`, an original Newswire `query`,
  `maxPageSize` (1–100), `maxOffset` (0–10000), and `maxResponseBytes`
  (1024–8388608). The contract defines filtering and whether data is included.
- Editorial channels also need `renderRendition` and independent
  `verifyRendition`. The original content engine returns `snapshotDigest`,
  `subjects`, `editionUri`, `publicationReceiptUri`, `mediaType` and `body`.
  The verifier receives that exact projection and its source query result.

## Obligations

S1. The request contains only `snapshotDigest`, `subscriptionId`, `profileId`,
`channel` and optional `limit`/`offset`; it cannot choose its principal, price,
query predicates, entitlement or output authority. Defaults and overrides stay
inside the selected profile's limits.

S2. Before query execution, authenticate the request, resolve its current active
contract, check its exact subscriber/resource/channel/profile and half-open
validity interval, and run the existing immutable-snapshot and source-rights
qualification. Source rights receive the selected channel and scope.

S3. The original Newswire executes the profile's admitted query. Query output
must remain inside the verified release and the original merchant's limits.
The subscription response also obeys the profile's total byte budget.
The release, admitted query and contract projections are owned immutable values
before verification or policy suppliers receive them, so those suppliers cannot
rewrite content under a previously verified digest or enlarge its scope.

S4. A human rendition is accepted only through the original renderer and an
independent verifier. It names this exact snapshot and exactly the returned
unique source subjects, and carries an edition and publication-receipt URI.
Only text/plain, text/html and text/markdown are supported here.

S5. After query/rendering, resolve the current contract again and require its
revision and complete contract projection to remain unchanged. Requalify source
rights, merchant authority and the immutable snapshot immediately before return.
Expiry, revocation, renewal or a failed current source-rights check refuse this attempt. An
unobserved change after this final check remains the transport owner's concern;
this is not a distributed atomic revocation protocol.

S6. The response exposes only the selected result/rendition, snapshot, contract
revision and source-rights reference. It never copies credentials, delivery
capabilities, private subscriber identity or claims a new payment/receipt.

## Verification and integration

Run the existing paid-query cases and `test/newswire-subscription.test.mjs`.
The subscription cases cover both output forms, reuse across source snapshots,
resource/channel/query bounds, cross-customer refusal, cancellation/expiry while
rendering, rights revocation and invalid rendition identity. Supplier fixtures
establish adapter behavior; original query/release-store integration is recorded
separately against exact source. No test constitutes a billed subscription,
editorial production acceptance or delivery to an external recipient.

`createNewswireCommerce({subscriptionAccess: {...}})` attaches these handlers
to its existing release store while retaining the original x402 seller. It also
returns `subscriptionResources`, ready for the existing HTTP application's
`resources` list. The default resource is `POST /v1/newswire/subscription/query`;
the host may select a fixed local `subscriptionPath`. No listener or independent
server is created. Omit `subscriptionAccess` to preserve the existing composition.

The resource uses the original HTTP composer's shared, bounded JSON intake,
with 16 KiB encoded and decoded limits. It passes the unchanged Fetch Request
to authentication and passes parsed selectors separately to
`subscriptions.execute({request, body})`. Legacy callers may continue to use
`execute({request})` with a parsed `request.body`. URL query selectors are refused.
The original composer receives its own body failures, including when a parent
Web Platform resolves a different installed HTTP edition.

Successful deliveries and access refusals are JSON responses with
`Cache-Control: private, no-store`, `Vary: Authorization, Cookie`, and
`X-Content-Type-Options: nosniff`. These headers are set before this resource's
body intake. A host's hooks that run before resource dispatch retain ownership
of their own failure and cache policy. No credential, private principal or raw
provider error is copied to a response. The body is sent only after the original
subscriber, contract and rights rechecks succeed.

| Condition | HTTP result |
| --- | --- |
| Invalid selectors or JSON | 400 |
| Encoded or decoded body too large | 413 |
| Unsupported request media type or encoding | 415 |
| Missing authenticated subscriber | 403; 401 when the host supplies its authentication challenge |
| Expired, cancelled, mismatched or changed access scope | 403 |
| Provider failure, malformed provider contract or unqualified output | 503 |

For a 401 challenge, the host supplies `subscriptionAuthenticationChallenge`
to commerce (or `authenticationChallenge` to the resource factory). The transport
does not invent the provider's authentication scheme. `NewswireSubscriptionRefusal`
distinguishes known access refusals from unavailable providers. A malformed
provider query or failed contract lookup remains unavailable, rather than being
reported as an observed cancellation.

The original Stripe provider's order/offering/actor bindings and item billing
periods are inputs to the still-required recurring-contract resolver. A completed
Checkout, a Shop purchase grant, an ASSIST gift, or a Market wallet allowance
does not alone establish the current paid contract required here. The installed
host must supply the original principal/order join and current renewal/revocation
evidence; the HTTP resource neither synthesizes that join nor changes billing.

The standalone package pins the actual original crypto, HTTP, x402, Web Platform
and Datom dependencies instead of unresolved `workspace:*` references. Its npm
lock records the full native closure. `npm run check` and `npm test` cover the
existing alpha-chain, paid actor, source inventory and Newswire behavior as well
as subscription access.

For source-owner receiving, run `test/newswire-subscription-receiving.mjs` with
three absolute module paths: current-owner Newswire `query.mjs`, SignCraft
`knowledge-base.mjs`, and Email Newsletter `newsletter-issue.mjs`. The assay uses
their real implementations, real content-addressed release custody, and explicit
fixture authority ports. It checks one snapshot's graph resource/revision,
digest and subjects, two-page machine data with PROV-O, original HTML newsletter
and Markdown social renditions, and revoked-scope refusal. No graph or renderer
is reimplemented in this merchant.
