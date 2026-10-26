## Autonomous regulatory watch

The `./regulatory-watch` supplier serves the existing continuously acquired Federal Register window. Machine buyers can select topics, agencies, CFR titles, dockets and upcoming comment deadlines, receiving original document revisions and an edition-pinned continuation cursor. The original acquisition runs every three hours; cache sharing avoids fetching a fresh source for every buyer. [Operation and API](docs/REGULATORY-WATCH.md).
<!-- regulatory-watch-end -->

# paid-data-endpoint-service

## Subscription access to the same released data

`./newswire-subscription` exports `createNewswireSubscriptionQueryHandlers`.
`createNewswireCommerce` accepts `subscriptionAccess` to attach it to the same
immutable release store used by the x402 seller. An authenticated current
contract selects the resource, query profile, page limits and delivery channel;
the request cannot expand that scope. The handler rechecks current contracts
and source rights after query or rendering work, before returning data.

Machine responses retain the original query and PROV-O identities. Newsletter
and social responses require the original content renderer and an independent
editorial verifier, with the same snapshot and source subjects. The handler
returns content; it creates no subscription, bill or outbound message. See
[the executable contract](docs/NEWSWIRE-SUBSCRIPTION-ACCESS.md) for suppliers,
refusal rules and original-query integration receiving.

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Forms one durable x402 actor for one paid read, write, or data-rights trade operation.

## Agent public-data inventory pilot

`./src/federal-register-inventory.mjs` acquires a source-attributed, content-addressed Federal Register inventory lot. Its reseller transform produces another attributable, content-addressed lot for a genuine buyer task; neither operation claims a payment, exclusivity over public facts or deployed commerce. The no-key CLI is `produce-federal-register-inventory`. See [the operating and rights contract](docs/FEDERAL-REGISTER-INVENTORY.md) and run `node --test test/federal-register-inventory.test.mjs`. The eventual paid fulfillment should reuse this package's existing x402 read-data actor and the original Coesite provider market, not stand up another catalog.

The paid-read adapter `./src/federal-register-paid-read.mjs` now connects an exact source-lot digest to the **existing** durable x402 read-data actor and original payment boundary. It requires the seller's true price/payee/facilitator, durable lot store and journal; admission refuses stale or mismatched lots before a payment challenge, and settlement delivery verifies again. This source is not a deployed merchant. Run `node --test test/federal-register-inventory.test.mjs test/federal-register-paid-read.test.mjs` for ten focused tests.

## International licensed-data inventory

[`./src/international-data-inventory.mjs`](src/international-data-inventory.mjs) acquires World Bank series through deployment-owned JSON source declarations. The shipped datasets include China GDP, China CPI inflation, and United Kingdom population; another supported country or indicator is added through data. The original China lots retain their v1 bytes and digests, while new source IDs use v2 digests that bind the complete dataset definition and rights edition. Operators select a bounded `--sources-file`, and pass the same captured declarations into the existing paid-read merchant. Buyers continue requesting an exact lot digest. The repository includes the real five-year GB population acquisition, normalized inventory lot and receipt. CHIRPS v3 retains its original raster acquisition workflow, and sources requiring distribution agreements retain their authored held states. See the [international inventory runbook](docs/INTERNATIONAL-DATA-INVENTORY.md) and [source declaration schema](data/source-declarations/international.schema.json).

## Original Newswire commercial query boundary

The `./paid-newswire-query` export composes the **existing Newswire's** qualified release snapshot and bounded topic/source/time query with this package's original durable x402 `read-data` actor. It requires seller-owned immutable snapshot read/verification, newsroom query schema and execution, source-commercial-rights review, buyer/merchant authorization, and real x402 merchant pricing/facilitator and persistent receipts. Each request pins an exact SHA-256 snapshot, rejects unauthorized/stale/substituted editions before the 402 challenge, and checks source rights and principal authorization again after settlement. No duplicate feed renderer, marketplace, payment ledger, wallet, editorial approval or public-data exclusivity claim is introduced. [Read original seller contract](docs/NEWSWIRE-PAID-QUERY.md). Ten focused standalone Node tests passed; actual native workspace and deployed paid end-user receiving remain owed.
