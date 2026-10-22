# Federal Register inventory — source-to-agent commercialization

**Status:** runnable and locally tested data-acquisition/derivation code, **not** a live priced endpoint, a paid purchase, an independent customer acceptance or external revenue. This is one SKU in the existing paid-data-endpoint service, not a new marketplace or a proprietary claim over government facts.

## Producing inventory already useful to the Group

The Federal Register's public keyless JSON API supplies published document metadata; this producer transforms one bounded result page into a deterministic SHA-256 content-addressed inventory lot. Each row retains its official document number and URL, title, originating agencies, type, publication date, optional comment-closing date and the source-supplied abstract. Null close dates mean unknown/not provided, **not** permanently open.

In the repository on Node.js, with network egress:

```sh
node src/federal-register-inventory-cli.mjs \
  --since 2026-10-01 --until 2026-10-21 \
  --agency environmental-protection-agency --per-page 30 > fr-epa-inventory.json
```

A second seller/consumer role can produce a differentiated deadline lot from the same free source:

```sh
node src/federal-register-inventory-cli.mjs \
  --since 2026-10-01 --until 2026-10-21 \
  --agency environmental-protection-agency --per-page 30 \
  --comment-close-from 2026-10-21 --comment-close-by 2026-11-15 \
  --actor 'actor:example-internal-comment-watch' \
  --service 'Deadline-window filtering and monitoring' > fr-comment-window.json
```

Dates above are examples; use the correct window for each actual run. Outputs are **unpaid** inventory lots: they neither create a sale nor charge an agent. A seller's actor label is attribution only, not independent proof of identity, merchant authority or a revenue event.

Importable source interface:

```js
import { acquireFederalRegisterInventory, deriveFederalRegisterInventory } from "@red-cup-engineering/paid-data-endpoint-service/federal-register-inventory";
const wholesale = await acquireFederalRegisterInventory({
  search: { since: "2026-10-01", until: "2026-10-21", perPage: 50 },
});
const specialist = deriveFederalRegisterInventory(wholesale, {
  filters: { commentsCloseOnOrAfter: "2026-10-21", commentsCloseBy: "2026-11-15" },
  actorId: "actor:qualified-internal-comment-watch",
  service: "Time-bounded public-comment triage",
});
```

The program returns one page (up to 100 documents). A missing next-page claim is **unknown**, not complete coverage. To acquire more than 2,000 Federal Register results, partition by publication dates rather than claiming deeper pagination. Live egress was unavailable in the isolated development environment and must be verified from a deployed node before claiming current inventory.

## One enterprise, multiple genuine roles

| Role | Added service | Proof required |
| --- | --- | --- |
| Collector | Retrieve, normalize and hash official records | Source URL, observed time, digest and actual data |
| Wholesale seller | Offer a priced read from a current lot | Original merchant's live quote, payment rail, payee and fulfilled read |
| Specialist reseller | Filter, maintain, monitor, transform, compare or validate | Parent digest, distinct output, attributable transform and a useful receiver |
| Bazaar broker | Discover consenting seller-controlled offers | Original identities, quote validity, lawful provider matching, direct checkout |
| End-user agent | Carry out Causeway publishing, Lenticule research or deadline work | Real receiving effect, acceptance and measured independent usefulness |

One corporate principal can carry all five roles while keeping their actual effects and costs separate. Do **not** turn circular self-purchases into artificial external revenue or invent independent merchant identities. A genuine agent may also republish unchanged Federal Register material freely; no seller can impose exclusivity over the public facts. A broker cannot charge compulsory fees simply because agents can already access the source.

## Source rights and customer integrity

National Archives FAQs describe a right to reproduce and republish Federal Register content under **1 CFR 2.6**. The official government edition remains authoritative, not this index. Do not use official OFR/NARA seals or claim government endorsement. Check special rights in any separately protected attachments or joined sources. Preserve source URLs, provenance and limits; the metadata is not legal advice. Do not transform public access into a presumption that personal, tribal or culturally restricted datasets are resale-eligible.

The FTC's MLM guidance requires attention to real ultimate-user demand and prohibits deceptive recruitment/inventory-loading schemes. This product gives no recruitment bounty, distributor quota, exclusive selling right to public facts, or earnings promise.

References:
- [National Archives republication permission](https://www.archives.gov/federal-register/faqs)
- [OFR REST API and usage restrictions](https://www.federalregister.gov/reader-aids/developer-resources/rest-api)
- [FTC guidance on MLM structures](https://www.ftc.gov/business-guidance/resources/business-guidance-concerning-multi-level-marketing)
- [Cloudflare gateway beta access](https://developers.cloudflare.com/monetization-gateway/)

## Integration and receiving gates

The seller-specific paid fulfillment belongs in Red Cup's **existing** `createPaidDataEndpointActor({ operation: "read-data", ... })`, only after source inventory, price/asset/rail, recipient, facilitator, Actor authority and durable settlement records are qualified. This code currently does not wire a payment boundary. Cloudflare's Monetization Gateway is in closed beta; do not assume the Group has access.

Coesite's original provider-market service discovers qualified provider-authored offers. `shop.561.group` is seller-specific, `bazaar.561.group` can buy from independent providers by original seller terms, and `market.561.group` observes broader markets. No forked catalog, new wallet, automatic third-party entitlement or fake checkout is authorized. See [Bazaar requirement #5](https://github.com/coesite-operations/capability-market-services-section/issues/5) and [real internal-exchange requirement #13](https://github.com/coesite-operations/capability-market-services-section/issues/13).

Before asserting a viable paid SKU, separately observe and record (1) legally reusable source lot; (2) actual independent buyer task; (3) live original-merchant offer; (4) payment settlement; (5) delivered data; (6) independent receiver acceptance; (7) source and compute cost, post-fee margin and free-source alternative. Internal economic transfers and external invoices remain separately attributed. Existing native Cold Red Gate request: `UQYu3XYg`.

## Tests

`node --test test/federal-register-inventory.test.mjs` verifies deterministic digests, rights/source disclosures, parent-to-reseller lineage, deadline filtering, duplicate and tampered record rejection, unsafe source refusal, bounded API queries and non-JSON/failed HTTP responses. Its document rows are **synthetic test fixtures**, not an actual October 2026 Federal Register pull, current source warranty or purchased inventory.

## Exact-digest paid reads through the original x402 actor

The library now exports `createFederalRegisterPaidReadActor` and `createFederalRegisterPaidReadHandlers` from `@red-cup-engineering/paid-data-endpoint-service/federal-register-paid-read`. This is a source-owned **integration adapter**, not a second payment stack. It chooses the original `createPaidDataEndpointActor(operation: 'read-data')` and the original x402 exact-EVM Express boundary, which own durable invocation identity, settlement verification, idempotent receipts and refusal. It provides the application-specific admission and fulfillment behavior.

The seller's authorized deployment must supply:
- a qualified **sellerOffer**, source-versioned price terms with chain/asset/payee, and an independently approved facilitator or facilitator client;
- `lotStore.read({ digest })` over immutable durably stored exact lot versions; returned JSON is copied and validated before use;
- `append(record)` and recovered intent/terminal `Map` values from the original durable invocation journal, retaining settlement evidence across restarts;
- the competent original actor's authorization, networking policy, customer access rights and native storefront publication.

Example *shape*, not a live offer:

```js
import { createFederalRegisterPaidReadActor } from "@red-cup-engineering/paid-data-endpoint-service/federal-register-paid-read";
const actor = await createFederalRegisterPaidReadActor({
  lotStore,             // actual immutable store; rejects absent or mismatched digests
  sellerOffer,          // authenticated merchant-authored terms
  priceTerms,           // original network, atomic amount, token and payee
  append,               // original durable journal append
  recoveredRecords,     // original persisted intent and terminal maps
  facilitatorClient,    // independently selected and authorized x402 facilitator
});
actor.install(app); // existing Express app; no separate storefront or wallet
```

The paid method is `POST /x402/federal-register-inventory/invoke` with **exactly** `{"lotDigest":"sha256:..."}` in the JSON body. The public contract is `GET /x402/federal-register-inventory/offer`, and the original actor owns `GET /x402/federal-register-inventory/result/:id`. Before the challenge, admission verifies the exact requested digest, canonical Federal Register records, provenance notice, immutable availability and seller-configured freshness (default 24 hours). After an actual settlement, execution rechecks the same content before the original receipt records delivery. A stale, absent, mutated or substituted lot is refused, not silently replaced. A customer may always obtain the original government facts directly for free.

**Current receiving boundary:** ten focused local tests cover pure source merchandising, request/digest isolation, freshness, tampering, reseller lineage and boundary-injection wiring. Test doubles do **not** prove settlement or deployment. The full monorepo/workspace test suite, source-lot persistence, real merchant authority, live facilitator, serving process, real 402 challenge, actual paid settlement and independent end-user acceptance remain unverified. A successfully fetched fixture is not a completed purchase. Follow the existing Coesite Bazaar and 561 Group internal-economy original Work rather than generating internal fake paid activity.
