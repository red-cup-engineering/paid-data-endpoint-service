# paid-data-endpoint-service

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
