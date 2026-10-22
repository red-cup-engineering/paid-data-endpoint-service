# Newswire x402 topic-query seller: original service composition

**Source-only adapter, not a live selling endpoint.** This package composes the original Red Cup paid-data actor with the existing Newswire's published-query operation. It does not invent another RSS/Atom/JSON Feed renderer, newsroom, x402 facilitator, wallet, price policy, seller identity, or royalty on public information.

## Commercial purpose

One original licensed datum may become several useful topic newswires and value-added services, across any source family: public notices, research, environment, industry, court records, geographical changes, government statistics, program openings, enterprise events, or more. The general product is provenance-bearing, accepted, time-bound query and retrieval from our actual original Newswire, not a country/industry-specific scraper or licensed-market feed resale without terms.

Free canonical public feed access remains available wherever lawful. The paid product can offer bounded topic, genre, source and time filtering, archive/delta windows, original release identities and PROV-O proof/reference lookup. Quoted service price and measured latency must come from the original selling merchant, not from dataset assertions. No payment for recruitment, internal paper sales or exclusive rights over public facts.

## Source-injected original responsibilities

createNewswirePaidQueryHandlers requires all of:

- snapshotStore.read({digest}): the original durable Newswire release store; cannot return drafts.
- verifySnapshot({snapshot,digest}): true ONLY for the verified exact content-addressed, independently accepted release with no unreleased items; a supplied digest string is not cryptographic verification.
- admitQuery(query): the original bounded Newswire query schema, not a new seller-side parser.
- queryReleased({public}, query): the original Newswire's bounded query over newsroom-released public items; preserves edition identity, source attribution and honest truncation.
- qualifyRights({snapshot,query,at,stage,invocationContext}): genuine source and audience commercial rights, seller-provided evidence URL and valid expiry. Called before challenge AND after settlement.
- authorizeRequest({snapshot,query,at,stage,invocationContext}): genuine merchant/grant/buyer-budget admission, with the original HTTP request context pre-payment and original intent plus settlement context after settlement.
- now(): observed UTC epoch-millisecond clock.

An admitted request has EXACTLY {snapshotDigest: "sha256:<64 lowercase hex>", query: <original Newswire bounded query object>}; JSON query length is capped at 4KiB and result item count at 100. The source release is pinned by digest and cloned on both reads. The seller's latest verification time, NOT age of historic stories, is constrained by the seller-defined freshness window (default 24 hours). Absent, stale, changed, unlicensed or revoked source reads must refuse before challenge or fulfillment.

## Original payment protocol and inventory identity

createNewswirePaidQueryActor creates ONE original createPaidDataEndpointActor({operation:"read-data"}) using the current Red Cup x402 exact-EVM boundary. The hiring competent seller supplies offer, priceTerms (chain, asset, atomic price and payee), a real facilitator, the durable append/recovered intent/terminal journal and the above injected source operations. No merchant key, payment scheme or ledger is derived from Newswire data.

- HTTP: POST /x402/newswire/query/invoke
- Public original offer: GET /x402/newswire/query/offer
- Original operation result: GET /x402/newswire/query/result/:id

A paid delivery includes the original snapshot digest, wire identity, original bounded query output and rights evidence reference. It intentionally carries a null payment receipt: the original durable x402 actor owns settlement evidence and terminal outcome, and the downstream consumer independently receives delivered value. A paid-before-refusal case goes to the original seller's refund/aftercare process; do not fabricate chargeback or delivery.

Buyer authentication and authorization follow the original principal-scoped policy, not a new bot/MLM actor wallet. Internal Group charges never become external income.

## Type and source contract

The release snapshot must be a genuinely verified immutable original record with at least digest, wireUri, verifiedAt (RFC 3339), and public (accepted source items). The upstream owned verifier decides how its canonical bytes are hashed. The adapter does not compute or attest the original newsroom's digest. A source-specific license page or PROV-O file is evidence to evaluate, NOT an independent grant of commercial distribution authority. Corrections and withdrawals remain owned by the original Newsroom and AOE source-acquisition/cursor paths. A paid query cannot resurrect suppressed content by replaying an old public edition unless its current rights and authorization explicitly allow that archive use.

## Receiving checks

Run: node --check src/paid-newswire-query.mjs
Run: node --test test/paid-newswire-query.test.mjs

Ten local Node 22.16 tests pass. They inspect source pinning, malformed and price-injected request refusal, prepayment admission without paid execution, exact payment-context forwarding to original authorizer, second postsettlement rights check, revoked rights, altered source, stale/invalid freshness, inconsistent result bounds, and delegation to original merchant/journal/payment boundary.

Still owed: original full workspace CI at required Node >=22.18, original Newswire release-custody installer, source-authority/rights receiving, live seller configuration, true HTTP 402, approved buyer-signed x402 settlement, original terminal receipt and independent useful customer acceptance. No live sale or revenue is claimed.

Original work: https://github.com/red-cup-engineering/computer-content-engineering-services-section/issues/22 and /issues/20; Rete Agentium https://github.com/emsenn/rete-agentium-filum/issues/2; Coesite multi-provider commerce https://github.com/coesite-operations/capability-market-services-section/issues/5 .

## Resource, customer-trust, and economic admission (2026-10-22 repair)

The adapter now rejects the following independently of the injected verifier's acceptance:

- A released snapshot containing denied, unpublished, duplicate or unidentifiable subjects, a non-HTTPS publisher wire, or source identifiers with conflicting active content;
- An original version larger than the seller's selected `maxSnapshotItems` (default 10,000), `maxSnapshotBytes` (default 8 MiB) or `maxResponseBytes` (default 1 MiB), with explicit nonzero bounded configuration. Size limits apply before untrusted source cloning and after querying; they are upper bounds, **not claimed physical compute measurements**. Very large archives require an original indexed storage/query service, not widening these numbers without evidence;
- Non-RFC3339 snapshot/rights timestamps or original rights evidence that is not a credential-free HTTPS URL; expired permission still stops *postsettlement* fulfillment;
- Query output containing subjects outside the exact verified released snapshot, inconsistent `totalMatched`/`returnedCount`/`truncated` claims, or a non-null fabricated `settlement` / `buyerAcceptance` embedded in an ordinary data query result.

The original seller still must authenticate the source store's complete content hash, legal rights and buyer principal; these guards are necessary defense-in-depth, **not proof of any of those facts**. The adapter never chooses an actual payee, deploys a merchant, issues automatic refunds or records external earnings. Any post-payment refusal remains a real original seller aftercare obligation and cannot count as accepted delivery.

The exact source-only suite `node --test test/paid-newswire-query.test.mjs` is covered by `.github/workflows/newswire-paid-query.yml` on Node 22.18. A PR/Action created without a successfully run job does not satisfy the native suite gate; live source and signed merchant receiving remain separate.
