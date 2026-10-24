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

## International licensed-data inventory

[`./src/international-data-inventory.mjs`](src/international-data-inventory.mjs) qualifies specific global data sources for commercial preparation and agent resale, admitting **World Bank China GDP and CPI inflation series** only under their documented dataset licenses. It creates reproducible source-attributed historical indicator lots, with bounded keyless publisher fetch, null-aware values, rights-review expiry, integrity validation and explicit no-sale-recorded status. [`./src/international-data-inventory-cli.mjs`](src/international-data-inventory-cli.mjs) runs the acquisition on a networked host. The same registry identifies **CHIRPS v3 African rainfall** as an *unacquired GeoTIFF source candidate*, while refusing Chinese NBS website, TAHMO stations, and Shanghai/Shenzhen stock-exchange market feeds as commercial SKUs until explicit resale rights are cleared. No source-only declaration asserts successful purchase, deployed checkout or external customer acceptance. Details and runbook: [International inventory license and receiving contract](docs/INTERNATIONAL-DATA-INVENTORY.md). Focused tests: `node --test test/international-data-inventory.test.mjs`.

## Original Newswire commercial query boundary

The `./paid-newswire-query` export composes the **existing Newswire's** qualified release snapshot and bounded topic/source/time query with this package's original durable x402 `read-data` actor. It requires seller-owned immutable snapshot read/verification, newsroom query schema and execution, source-commercial-rights review, buyer/merchant authorization, and real x402 merchant pricing/facilitator and persistent receipts. Each request pins an exact SHA-256 snapshot, rejects unauthorized/stale/substituted editions before the 402 challenge, and checks source rights and principal authorization again after settlement. No duplicate feed renderer, marketplace, payment ledger, wallet, editorial approval or public-data exclusivity claim is introduced. [Read original seller contract](docs/NEWSWIRE-PAID-QUERY.md). Ten focused standalone Node tests passed; actual native workspace and deployed paid end-user receiving remain owed.


## Qualified short-text merchandise: original fortunes first

The new `./qualified-short-text-inventory` export is a **general product
source**, not another payment provider. It admits content-addressed packs with
source-class-specific commercial rights; parses the traditional Unix
percent-separated `fortune` format without assuming distribution rights; and
samples uniformly from exactly one approved edition and optional tag.
`createQualifiedShortTextShelf` provides a finite, digest-pinned multi-corpus registry with precompiled topic indexes, rights reauthorization on both purchase admission and delivery, and a 20,000-entry/4 MiB capacity guard.
Third-party entries need individually evidenced rights, while unknown and
expired rights refuse.

The first source-owned consumer is `./fortune-product`: fifty newly composed
Unix-style fortunes, simultaneously available as an actual percent-delimited Unix fortune textfile in `data/fortunes/561-original-october-2026.fortune`, sold only through a future ordinary x402 Market compute
binding (`drawRandomFortune` after the existing payment boundary and
`admitRandomFortuneQuery` before it). Reuse the canonical merchant's
facilitator, wallet authority, receipt and process-window cost meter. Neither
this source nor its manifest reports a deployed market route, a signed
payment, a sold fortune or earned cash. Read
[the rights, source and market admission contract](docs/FORTUNE-LICENSED-TEXT-SELLING.md)
and run `node --test test/qualified-short-text-inventory.test.mjs`.

This same corpus/selection law supports future licensed proverbs, idioms,
chengyu and glossary snippets without one-off payment stacks or an unjustified
blanket license on traditional collections.
