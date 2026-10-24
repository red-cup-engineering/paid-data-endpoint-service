# Agricultural data to agents: original source → qualified edition → Newswire → existing seller

**Source Work:** [Red Cup paid-data #11](https://github.com/red-cup-engineering/paid-data-endpoint-service/issues/11)  
**Shared existing source pipeline:** [paid-data #6](https://github.com/red-cup-engineering/paid-data-endpoint-service/issues/6) and [Content Engineering Newswire #22](https://github.com/red-cup-engineering/computer-content-engineering-services-section/issues/22)  
**Original first-party weather producer:** [Red Cup Forecasting](https://github.com/red-cup-engineering/forecasting). Do not scrape or archive its output a second time.  
**Motivating article:** [World Economic Forum, 20 October 2026, Thomas Jung (Syngenta) — How connected data can help feed a planet of 10 billion people](https://www.weforum.org/stories/food-water-and-clean-air/how-connected-data-can-help-feed-a-planet-of-10-billion-people).

## Business decision: sell valuable answers, not exclusive ownership over common facts

A US agricultural statistic or weather forecast is often freely available from its original government issuer. **The thing somebody might buy** from 561 Group is a *rights-qualified, timestamped, source-version-pinned, accurately normalized, task-sized, machine-queryable result* joined across compatible agricultural, weather and other observational series, rather than the implication that public facts have been enclosed. Benchmark every offer against going to NASS/NWS themselves.

Plausible early receiver jobs, **not known customers or earned revenue**, include: (1) exact regional crop-yield history with coverage, units and suppression warnings for an agricultural advisor; (2) independent weather versus growing-period comparisons already backed by the Group's Forecasting provider; and (3) a verifiable change bulletin for revised NASS estimates and correction history. The third is important: NASS routinely revises reports and large datasets. Edition identity and corrected/withdrawn source events must survive into the original Newswire and any paid snapshots.

## What this branch actually implements

- Two **source-owned typed, actively read** agricultural source declarations at `data/records/agricultural-sources/`. Each names publisher, original endpoint, actual upstream source, units, source rights evidence and review deadline. Both hold commercial redistribution/sublicensing for separate evidence review; registration is not an entitlement or sale.
- `src/agricultural-source-admission.mjs` imports those declarations and validates them before catalog and source selection. It projects a **candidate DCAT-shaped JSON-LD catalog** for agents, maintaining original producer credit and review status. The entries intentionally have **no `dcat:distribution`** because no Group-owned release has been acquired and editor-approved from these declarations. This is not an advertised live endpoint or complete conformance certification.
- `src/agricultural-nass.mjs` is a bounded *real* NASS Quick Stats acquisition adapter with injected authenticated network, original content-addressed source store, count-before-get, non-credential source query, exact row-count check, source-shape/units checks, suppression-preserving interpretation, original raw byte SHA-256 digests and mandatory store readback. It produces **an observed-but-unapproved source candidate**, not a published Newswire article or merchant item.
- `src/agricultural-nass-cli.mjs` is the entrypoint on an actually networked, credentialed operating host. Unlike an inert manifest, it calls the original data source and writes/rechecks bytes in the existing store. A source descriptor and a test fixture are **not evidence of a completed live acquisition**; the working operator must report the exact resulting source receipt.
- `test/agricultural-source.test.mjs` exercises source admission, intended rights holds, credential redaction, DCAT candidate refusal, real-byte source custody contract and malformed/incomplete source conditions.

The two manifestations have distinct provenance boundaries: NASS Quick Stats needs **its original API key**; NWS weather should reuse Forecasting's **existing source and run evidence**, not trigger another NWS scraper or imply the NASS adapter applies to meteorology.

## Run a real bounded acquisition, once duly authorized

Request an original NASS Quick Stats API key using [the USDA Quick Stats site](https://www.nass.usda.gov/Quick_Stats/). In the original package's workspace, on a networked host with its original dependencies and Node >=22.18:

```bash
export NASS_API_KEY='<your legitimate USDA Quick Stats key>'
node src/agricultural-nass-cli.mjs \
  --year 2025 --state MN --commodity CORN --statistic YIELD \
  --custody-root /path/to/authorized/original/content-addressed-store \
  --max-rows 250
```

Never place the key in Git, the source declaration, the candidate lot, the output receipt, a query URL circulated to another agent, or a public conversation. Select a private custody root with appropriate access permissions. This operation makes *two* source requests (`get_counts` then `api_GET`), rejects anything outside the selected finite row limit or 4 MiB decoded data-body limit, and rereads both original responses through the existing content-addressed store. Results with original `Value: "(D)"`, `"(Z)"`, etc. retain the exact source string and produce a **null interpreted numeric value**, not a fabricated zero.

This branch has **no supplied USDA key or live source receipt**, no original newsroom approval, no 561 public URL, no seller payment or purchase. Its own tests require independent execution under the original workspace. **Received upstream:** [original paid-data PR #10](https://github.com/red-cup-engineering/paid-data-endpoint-service/pull/10) is now **merged**: its source-byte custody, Newswire edition supply, and original durable seller capabilities are on main, and this agricultural branch has been reconciled onto that main revision. This does **not** constitute an actual NASS observation, source-specific commercial authorization, independent native NASS test execution, editorial Newswire approval, installed collector, or customer acceptance. Those remain separately required before unattended agricultural production.

## Interoperability and what actually qualifies

- **W3C DCAT 3** for publisher, source dataset, distribution and data service *when each exists*. This branch emits a limited candidate projection using standard DCAT 3 dataset properties, ADMS `UnderDevelopment` status and Dublin Core rights statements rather than inventing an unhosted 561 vocabulary; do not claim validation as a fully conforming catalog without an appropriate profile and semantic validator: https://www.w3.org/TR/vocab-dcat-3/
- **W3C PROV-O** for original Entity/Edition versus transformation Activity and responsible Agent *at the original editorial release*. Preserve original observed time, publisher publication/revision time and our retrieval time separately: https://www.w3.org/TR/prov-o/
- **OGC SensorThings** for future source-controlled field and equipment sensor observations where a genuine provider profile is available: https://www.ogc.org/standards/sensorthings/
- **AgGateway ADAPT Standard** for legitimately supported farm operation/file interchange. Don't call telemetry JSON an ADAPT/ISO-11783 file because it has a location and temperature: https://github.com/AgGateway-ADAPT/Standard
- Actual Newswire `RSS/Atom/JSON Feed` data packets and verified human approvals follow original Content Engineering #22, then only the same durable x402 seller/Market/Bazaar/Shop. **No agriculture-specific wallet, payments or second Newswire product**.

An external buyer may pay for qualified transformation, timeliness and provenance. It may not buy an invented exclusive title to government facts, restricted intermediary measurements, or another actor's cooperative/farm data.

## Rights matrix, including producer data

| Category | Source reading | Commercial resale | Enforced limit |
| --- | --- | --- | --- |
| NASS Quick Stats | Credentialed authorized API call, publisher-backed estimates | **Held** pending exact dataset/API/third-party review | Credit original source, identify edition, preserve suppression, observe 50,000 overall NASS limit and smaller elected budget |
| NOAA/NWS Forecasting | Consume original Group weather observations/forecasts | **Held** for selected derived product and any third-party caveat | Preserve original forecast issue/valid time and rights, no invented recorded station |
| Commercial equipment export | Only per-operator consent and actual provider API agreement | **Held** until separate transfer/sublicense authorization and buyer terms | Manufacturer access rights ≠ farmer economic rights |
| Household or Worm Assist logs | Private operator/custodian data | **No sale by default** | An app account or a sensor-reading permission is not a selling grant |
| Indigenous/collective/ecological observations | Original rights-holders and collective authority must be determined | **Held** unless appropriate independent permission obtained | CARE, sacred/ecologically sensitive location safeguards, consent/revocation |

The 2018 [NASS citation request](https://www.nass.usda.gov/Data_and_Statistics/Citation_Request/) says **most**, not all, NASS material is public domain, with acknowledgment requested. It does not independently clear the use of every third-party series nor confer vendor API access. [NWS disclaimer](https://www.weather.gov/disclaimer) must be read for the actual selected product.

## Later: equipment participation with *no speculative advances*

[Original Deere, CNH, Leaf and ADAPT interoperability, data ownership and low-capital integration research](AGRICULTURAL-EQUIPMENT-DATA.md). This is **not** an OEM integration, farm-user authorization, equipment account or buyer contract.

Farmer-in-the-loop sequence:

1. **Operator and rights proof:** the actual operator names fields/equipment/data source, land and equipment rights-holders, cooperative and collective authority, API/OAuth provider permissions, exact values/time/spatial precision, storage/retention, and a revocable purpose grant. Support self-service export first, authenticated provider connectors only when demanded.
2. **Private data quality proposal:** an original observation batch is audited for calibration, timestamp, units, gaps, duplication, disclosure risk and provenance. It stays owner-private; *buyer discovery uses a non-sensitive metadata teaser* until specifically approved.
3. **Named real buyer task:** establish the actual buyer, acceptable precision/freshness, price ceiling, liability and requested redistribution scope **before** financing equipment/data collection. Do not incentivize farmers to submit speculative volume.
4. **Authoritative offer and settlement:** the 561 Group's original source-owned Shop/Market/Bazaar seller quotes the allowed transformed lot. Original grant and buyer approval are separately required at fulfillment. Credits to a contributor are owed only under a real accepted agreement and externally witnessed settlement, with costs and fees deducted according to agreed terms—not because a data table appeared.
5. **Correction and withdrawal:** a withdrawn operator grant stops *future* sales, retains necessary audit and prior authorized settlement evidence, and triggers downstream source-revision notices. No claim to retroactively claw back copies already licensed is made without contractual/legal basis.

No equipment purchases, farmer payments, automatic telemetry extraction or outreach are authorized merely by building this prerequisite.

## Receiving scorecard

For a genuine pilot, collect `issuer`, `source dataset`, `edition URI and digest`, `observedAt`, `publisher revisedAt`, `count`, `bytes`, `missingness`, `units`, `rights evidence/date`, `per-row transformation provenance`, `editorial approval`, `Newswire release`, `consumer need`, `external quote`, `external delivery/settlement`, `actual download/compute/storage/engineering costs`, `refund/dispute` and `net margin`.

No value should be inferred from test results, synthetic requests or view counters. Success requires an actual customer/agent saving effort or purchasing a useful attributable result, and a measured comparison against direct access to the free source.
