# International data inventory

The original Red Cup `paid-data-endpoint-service` acquires publisher data,
normalizes it into immutable inventory lots, and serves those lots through its
existing durable x402 paid-read actor. Coesite, Market, Bazaar and Shops consume
the same producer and merchant interfaces.

**Native parent:** `ni:///sha-256;UQYu3XYgrzj1YcwPvi1vnBNHxmShE0xWe5JkhUIiwkc`  
**International child:** `ni:///sha-256;y5AbtAwnfGyv_oEdKzoSL2TUTH9gv3dG97qYMZxQpNE`

## Add supported datasets through source declarations

`data/source-declarations/international.json` contains deployment-owned JSON
declarations. A World Bank declaration specifies a unique source ID, its
two-letter country and three-letter country code, indicator, title, unit,
original source credit, and reviewed rights edition. Another supported country
or indicator uses the same adapter.

The operator can provide another complete declaration map with
`--sources-file FILE`. The file loader accepts a regular JSON file up to
32 MiB; admission accepts up to 20,000 named declarations. Each record is
validated and deeply frozen before acquisition or merchant work begins.
Source IDs must match their map keys, URL components must be primitive bounded
codes, and review dates must identify valid calendar days and an ordered window.

The schema is published as
`@red-cup-engineering/paid-data-endpoint-service/international-source-declarations.schema.json`.
The declaration module is exported at `/international-source-declarations`.
Runtime admission also checks matching map keys, date relationships and the
reserved dataset identities.

The shipped declarations contain eight sources:

| Source | Dataset or source family | Current declaration |
| --- | --- | --- |
| `wdi-cn-gdp` | China GDP, `NY.GDP.MKTP.CD` | Qualified World Bank indicator |
| `wdi-cn-inflation` | China consumer-price inflation, `FP.CPI.TOTL.ZG` | Qualified World Bank indicator |
| `wdi-gb-population` | United Kingdom population, `SP.POP.TOTL` | Qualified World Bank indicator |
| `chirps3-africa-rainfall` | CHIRPS v3 rainfall | Source qualified; raster acquisition and geographic processing use the climate-data workflow |
| `sse-market-data`, `szse-market-data` | Exchange market feeds | Held for their distribution agreements |
| `china-nbs-website` | NBS website data | Held for commercial-use authorization |
| `tahmo-stations` | Station-network observations | Held for the station-network agreement |

These are distinct authored datasets and source families. Adding aliases,
repeated parameter windows or synthetic offer counts does not expand the
underlying dataset supply.

## Stable inventory editions

The seven original source IDs retain their original non-rights definitions.
The existing China indicator lots keep
`561.international-inventory.v1`, with byte-identical URLs, lot JSON and digests
for unchanged inputs. A rights review can be renewed under the same dataset ID;
rights remain part of the existing digest, so that edition receives a new digest.

New source IDs use `561.international-inventory.v2` in the same inventory format.
Its digest includes the complete non-rights source definition in addition to
the source ID, requested years, records and rights edition. Metadata includes
`countryISO3`. Changes to a dataset's country, indicator, unit, title or source
credit therefore change its content address even if its numeric records happen
to match another dataset.

Verification derives the required version from the reserved source identity
and the operator's admitted declarations. Acquisition captures that declaration
map once before awaiting the publisher response, and uses the same captured
map to build and verify the lot. Paid-read handlers likewise capture the map
when the merchant is constructed. Updating a caller-owned object during a
request cannot replace the selected dataset or rights edition.

## Acquire and inspect inventory

On a networked host with Node >=22.18:

```sh
node src/international-data-inventory-cli.mjs --sources
node src/international-data-inventory-cli.mjs --sources --sources-file /srv/data/sources.json
node src/international-data-inventory-cli.mjs --source wdi-cn-gdp --from-year 2020 --through-year 2024
node src/international-data-inventory-cli.mjs --sources-file data/source-declarations/international.json --source wdi-gb-population --from-year 2020 --through-year 2024 > gb-population.json
node src/international-data-inventory-cli.mjs --chirps3-day 2025-08-01 --variant rnl
```

The World Bank adapter requests one bounded publisher page, checks country and
indicator identity, admits finite numeric values and explicit nulls, and
sorts distinct years within the requested interval. It preserves attribution,
units, original source credit, rights, source URL and acquisition time.
The CHIRPS command creates the existing raster candidate for the climate-data
acquisition workflow.

Programmatic callers pass the same operator-owned declaration map through the
existing APIs:

```js
import { readFile } from 'node:fs/promises';
import {
  admitInternationalSourceDeclarations,
  acquireWorldBankSeries,
  verifyWorldBankInventoryLot,
} from '@red-cup-engineering/paid-data-endpoint-service/international-data-inventory';

const sourceDeclarations = admitInternationalSourceDeclarations(
  JSON.parse(await readFile('/srv/data/sources.json', 'utf8')),
);
const lot = await acquireWorldBankSeries({
  sourceId: 'wdi-gb-population',
  fromYear: '2020',
  throughYear: '2024',
  sourceDeclarations,
});
verifyWorldBankInventoryLot(lot, { sourceDeclarations });
```

## Received United Kingdom population lot

The additional population declaration was reviewed against the
[World Bank country/indicator page](https://data.worldbank.org/indicator/SP.POP.TOTL?locations=GB),
[WDI indicator glossary](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/SP.POP.TOTL)
and [dataset terms](https://data.worldbank.org/summary-terms-of-use).
The indicator is labeled CC BY-4.0 and credits the UN Population Division,
national statistical offices, Eurostat and the UN Statistics Division.
The declaration carries that credit, the attribution requirement and the
review window.

At `2026-10-26T04:47:57.455Z`, the original acquisition API received HTTP 200,
`application/json;charset=utf-8`, and 1,106 source bytes for 2020–2024.
It produced and verified this inventory lot:

```text
sha256:692993d90a5ce5c2815c6c491c301d339b18258032eea1143b64f2ad82d6b1b7
```

| Year | Population, people |
| --- | ---: |
| 2020 | 66,740,000 |
| 2021 | 66,978,000 |
| 2022 | 67,636,000 |
| 2023 | 68,526,000 |
| 2024 | 69,281,000 |

The publisher response, normalized lot and acquisition receipt are stored in
`data/international/wdi-gb-population-2020-2024-20261026.{source,lot,receipt}.json`.
The lot retains the existing inventory sales state; the merchant records
settlement through the paid-read actor when a buyer purchases it.

## Serve through the existing merchant

The public paid-read request remains exactly:

```json
{"lotDigest":"sha256:692993d90a5ce5c2815c6c491c301d339b18258032eea1143b64f2ad82d6b1b7"}
```

The seller supplies the declaration map, content-addressed lot store, current
offer and price terms, payment boundary, durable append and recovered records.
Admission checks the lot before the payment boundary; fulfillment checks the
same digest again when the original actor invokes execution.

```js
import { createInternationalPaidReadActor } from
  '@red-cup-engineering/paid-data-endpoint-service/international-paid-read';

const actor = await createInternationalPaidReadActor({
  sourceDeclarations,
  lotStore,
  sellerOffer,
  priceTerms,
  append,
  recoveredRecords,
  facilitatorClient,
});
actor.install(app);
```

The operations owner refreshes inventory, reviews source terms by the declared
date, retains required attribution, and stocks the resulting digest in the
seller's immutable lot store. Record acquired bytes, stored bytes, refresh
time, egress, transformations, price and realized margin with the original
merchant's settlement and delivery records. Each new public offer should name
a useful dataset and a receiving customer need.

## Receiving checks

The original inventory and paid-handler checks remain in place. Added receiving
checks compare both existing China lots byte-for-byte, rebuild the real GB lot,
check v2 definition binding and version selection, retain a captured source
across awaited fetch/store operations, preserve the buyer's exact request
schema, and enforce the operator file budget. The static declaration schema is
also checked against all eight shipped records using the original JSON Schema
service.
