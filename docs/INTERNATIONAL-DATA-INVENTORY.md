# International public data as inventory — a typed supplier expansion

**Owner:** Original Red Cup `paid-data-endpoint-service` supplies source-facing adapters and integrates with the existing durable paid-read x402 actor. **Consumer:** Coesite provider market and the 561 Group's existing Market, Bazaar and individual Shops; no second checkout, global catalog, custody account, publisher authority, or invented agency created.

**Native parent:** `ni:///sha-256;UQYu3XYgrzj1YcwPvi1vnBNHxmShE0xWe5JkhUIiwkc`.
**International child:** `ni:///sha-256;y5AbtAwnfGyv_oEdKzoSL2TUTH9gv3dG97qYMZxQpNE`.
**Status:** reusable source qualification and tested normalized Chinese economic indicator ingestion; Africa rainfall discovery is a source-only candidate. Real fetch, raster clipping, persistent content store, merchant license receiving, actual paid settlement, external end-user acceptance, and economic margin **not yet demonstrated**.

## Admission is specific to datasets, not countries

| Candidate | Original source and rights evidence | Commercial posture |
| --- | --- | --- |
| China GDP in current USD (`NY.GDP.MKTP.CD`) | [World Bank indicator](https://data.worldbank.org/indicator/NY.GDP.MKTP.CD?locations=CN) has a CC-BY-4.0 label; [World Bank terms](https://data.worldbank.org/summary-terms-of-use) require attribution and acknowledge third-party exceptions | Qualified *subject to monitoring the exact indicator and underlying provider restrictions*; first normalized time-series SKU |
| China consumer-price inflation (`FP.CPI.TOTL.ZG`) | [World Bank indicator](https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=CN) has a CC-BY-4.0 label and attributes underlying observations to IMF International Financial Statistics | Qualified *subject to the same dataset-specific check*; first normalized time-series SKU |
| CHIRPS v3 rainfall over Africa | [UCSB Climate Hazards Center v3](https://www.chc.ucsb.edu/data/chirps3) identifies CC BY 4.0/public-domain reuse and a citation; daily final files include raster data, often too large to treat like JSON | Source rights qualified; **actual Africa-subset bytes not yet fetched, scoped, checked or made saleable** |
| Shanghai/Shenzhen real-time securities market feeds | [SSE vendor products](https://english.sse.com.cn/markets/dataservice/products/) and [SZSE authorized data services](https://investor.szse.cn/English/services/dataServices/index.html) reserve redistribution to qualified distributors such as CIIS/SSIC | **Held** until an original vendor agreement expressly permits the desired API resale and the approved payee/usage rights are verified |
| Chinese NBS data | [NBS's historic published FAQ](https://www.stats.gov.cn/english/nbs/201312/t20131213_480293.html) explicitly says published data may be used for free, but not for commercial purposes | **Held** pending current terms or independent authorization; no direct commercial SKU from the NBS website |
| TAHMO station observations | [TAHMO data portal](https://tahmo.org/climate-data/) requires login and directs users to data policy | **Held** pending contract and explicit resale rights |

Access to data does not imply ownership or resale rights. The copyright on the software license does not license other people's datasets. An intermediary's permissive label doesn't clear an upstream provider's separately restricted observations. Honor national laws, access terms, personal data rules, Indigenous collective data rights/CARE where applicable, database rights, provider rate limits and attribution. This is a source-qualification record, not a lawyer's certificate. Rights must be rechecked by date and on any provider notice. An individual source can be newly admitted only after source-specific evidence; the registry defaults to refusal.

## Working consumers and products

The World Bank API requires no key. Its `v2` indicator endpoint supports JSON with the country and indicator identifiers; the loader accepts only approved source IDs, one source page, declared years, bounded bytes and valid non-duplicated years. Null values stay null, rather than being silently modeled. It preserves indicator name, unit, original source credit, source/rights URLs and seller-observed timestamp, plus a reproducible content digest and an explicit `no-sale-recorded` state.

In the repository, on a networked host with Node >=22.18:

```sh
node src/international-data-inventory-cli.mjs --sources
node src/international-data-inventory-cli.mjs --source wdi-cn-inflation --from-year 2020 --through-year 2025 > china-inflation.json
node src/international-data-inventory-cli.mjs --source wdi-cn-gdp --from-year 2020 --through-year 2025 > china-gdp.json
node src/international-data-inventory-cli.mjs --chirps3-day 2025-08-01 --variant rnl > africa-rainfall-candidate.json
```

The last command outputs **only an unacquired file reference**, *not* an African rainfall dataset: a real consumer must fetch and measure the original GeoTIFF, clip to an explicit location/CRS, retain nodata cells, document version (`rnl` vs `sat`, preliminary vs final), hash the actual bytes, verify the transformation, then record the real subscriber's accepted use. Preliminary and final data differ in timeliness and station blend; daily CHIRPS v3 dates are labeled using disaggregation and are not a universally consistent local observation window. See [UCSB explanation](https://www.chc.ucsb.edu/data/chirps3). Any file URL needs a real HEAD/download and actual existence check before advertising freshness or supplying a result.

## The same code, many agents

An acquisition Actor purchases nothing when accessing the open source; a wholesale Actor may later charge for verification, normalization, freshness and delivery. A specialist Actor can resell a filtered/refreshed version, retaining original source and parent digests. A Causeway newsroom Actor may consume that output to locate interesting reporting work. Another client may compare rainfall observations for risk assessments. Internal consideration and external revenue are distinct. As with the Federal Register line, no actor may claim exclusive title to freely reusable original data or earn compensation simply for recruiting sellers.

The data admission module does not issue a x402 payment receipt. Sales happen only after a competent seller publishes an original current offer, signs its own payee and terms, serves verified immutable inventory using the existing paid-data actor, obtains original settlement evidence and passes independent acceptance. Source acquisition is not payment. Preserve `Shop ⊂ Bazaar ⊂ Market` as typed relationship, not merchant custody, and honor the existing Coesite parent work.

## Minimal cost discipline

A small time-series JSON response may be cheap. Large geospatial archives can cost more in egress, storage, reprojection, repeated retrieval and raster analysis. Actual measurements, not assertions, decide whether to stock or fetch on demand. Record `sourceBytes`, `storedBytes`, `networkEgressBytes`, `costInCurrency`, `refreshInterval`, `selectedSpatialExtent`, `cacheHit`, `duplicateDigest`, `observedAt`, source's `originalLicenseEvidence` and actual paying receiver. Use no zero-cost placeholder when the value is unknown.

Reuse shared source rights review, canonical lot hashing, stable agency identifiers, transformation lineage and payment boundaries across future jurisdictions. For new sources, add a source-specific descriptor, validation tests with refusal, and one actual consuming task. Avoid proliferating one microservice per public dataset when a provider adapter and typed inventory edition suffice.

## Honest receiving check

Source adapter tests cover the rights allowlist, NBS/TAHMO refusals, expiry, valid official endpoints, complete World Bank page requirement, numeric/null values, stable digest, tamper rejection, unsuccessful upstream HTTP, oversized response refusal and CHIRPS3 manifest remaining marked unacquired. They use constructed fixtures, not proof of a currently live World Bank or rainfall response. Real acceptance requires licensed source agreement/version, dated exact acquisition, a meaningful buyer effect, a deployed seller, an independent payment/acceptance receipt and measured unit economics.

## Paid-read composition with the original seller

`src/international-paid-read.mjs` exposes `createInternationalPaidReadActor`, composed from the existing `createPaidDataEndpointActor(operation: 'read-data')` and existing x402 exact-EVM payment boundary. The authorized seller supplies a durable content-addressed lot store, current signed merchant terms, payee/network/asset, facilitator, durable append and recovered invocation records. The public POST request accepts **only** an exact `sha256:` lot digest. The adapter checks source-qualifying rights **against the seller's observed current date**, availability, immutable content and configured freshness before the payment gate; after actual settlement the original actor calls fulfillment, which reads and checks the same digest again. It returns a delivery and rights/attribution alongside—but separately from—the original x402 settlement receipt. The seller chooses a true source-valid offer; this wrapper does not grant any seller new payment authority.

A `CHIRPS v3` unacquired raster candidate is never accepted by this World Bank paid-read adapter. A full raster ingestion will require a data-type-specific measured transform and its own original seller offer. No payout, HTTP 402, real purchase, station permission or external transaction is implied by the local eleven tests.

```js
import { createInternationalPaidReadActor } from '@red-cup-engineering/paid-data-endpoint-service/international-paid-read';
const actor = await createInternationalPaidReadActor({
  lotStore, // read({digest}) returns a saved exact verified China indicator lot
  sellerOffer, priceTerms, append, recoveredRecords, facilitatorClient,
});
actor.install(app); // install on the seller's existing authorized Express service
```
