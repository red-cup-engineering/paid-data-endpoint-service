# Fortunes as the first qualified short-text x402 product

**Source owner:** Red Cup Engineering / paid-data-endpoint-service.
**Merchant owner:** Causeway's existing market.561.group seller, not this package.
**Product status:** source candidate. No deployment, paid challenge, actual purchase, settled cash, or buyer acceptance is claimed by this file.

## The platform move

The shared `./qualified-short-text-inventory` export ingests and qualifies small
text corpus lots, including the historical Unix `fortune` percent-on-its-own-line
format. Every lot has an edition, source class, digest, item IDs/tags, explicit
commercial-delivery/redistribution rights and a provenance-bearing selection.
The same source can supply proverbs, chengyu, glossary readings, riddles and
agent-generated editorial material without another protocol or seller gateway.

`./fortune-product` is the first installed original product:
50 newly drafted, Unix-style aphorisms in
`data/fortunes/561-original-october-2026.json`. The material was prepared
under the Leader's October 22 request to create original fortunes where
external commercial clearance is not demonstrated. Its source rights claim
does not assert exclusive copyright in AI-assisted text; it does not grant
anybody rights to third-party traditional quotations.

The qualified pack ID and edition identify what was selected. Each paid
response includes the pack's SHA-256 identity, entry ID, entry digest,
attribution and normalized topic tags. Selection uses Node's cryptographically
secure random bytes with rejection sampling, so modulo bias does not favor
some texts. Random selection is **not** a scientific forecast, a promise of
luck or a verifiably unbiased external lottery.

The output's `paymentReceipt: null` is deliberate. Settlement evidence,
return/cancel/recovery, original SKU identity, received work and seller
accounting belong to the original x402 merchant and existing durable receipt
sources. A plain function result must not fabricate a payment.

## Traditional fortune datasets: candidates, not merchandise

| Corpus/source | Source observation | Commercial-sales ruling here |
| --- | --- | --- |
| Traditional NetBSD/fortune-mod datfiles and `fortunes` packages | Original historical `Notes` says the quote collection was assembled from many owners without comprehensive rights clearance, warns sellers to check | **Held.** Software/package distribution does not clear selling each quotation. |
| Debian `fortunes` and `fortunes-min` | Distribution packages have thousands of quotations from varied works | **Held.** An installed data package does not establish a blanket commercial excerpt license. |
| `Kronuz/fortunate` and comparable redistributions | One distributor reports its database as CC BY 4.0 | **Held pending chain-of-title per entry.** A wrapper's license declaration is not proof that its upstream quotations are actually licensed. |
| Newly composed 561 corpus | Produced specifically for this project, with no historical fortune quote copied | **Source-qualified for seller-controlled testing.** Editorial receiving, runtime/market permission and actual settlement remain independent. |

Primary source readings:

- https://sources.debian.org/src/fortune-mod/1%3A1.99.1-7/Notes
- https://packages.debian.org/en/bookworm/fortunes
- https://github.com/shlomif/fortune-mod
- https://github.com/Kronuz/fortunate

No third-party corpus has been copied or declared saleable here.
Keep source accession separate from commercial merchandise.

## Source onboarding without new software per dataset

1. Recover the *actual data file*, publisher/license edition and individual
   quotation/translation creators. Do not infer that a software license or
   "publicly hosted" means the content is commercially redistributable.
2. Parse a bounded `fortune` file using `parseUnixFortuneData`. The parser
   never grants rights: each resulting string is an unqualified candidate.
3. Construct a typed pack with `sourceKind: "third-party"`, dated
   identified reviewer, HTTPS source license evidence, affirmative permission
   for commercial delivery and redistribution, and **item-level evidence**
   for every text/translation. Anything absent, contradicted or expired
   remains held. Do not silently drop obligations such as attribution.
4. Call `qualifyShortTextPack` and persist the resulting canonical digest and
   evidence; a historical source filename alone is not a stable edition.
   Re-assay rights and pack digest at real seller admission, and deny a
   revoked or changed lot. Do not add a public SKU for held packs.
5. Use `admitShortTextSelection` before payment and
   `selectQualifiedShortText` only when the existing paid operation
   executes. A `tag` filter is the only public selection knob. There is
   no buyer-controlled seed, index, price, license waiver or raw pack upload.

The **implemented** `createQualifiedShortTextShelf({packs, authorizeUse})`
is a finite, revision-pinned in-memory registry of up to 128 distinct
qualified corpus editions. One source-qualified shelf can supply many
different corpus products without duplicating x402 or adding one API server
per dataset. Buyers must specify the exact `packId`, `edition` and
`packDigest` already listed by the seller; request-time supplied texts,
seeds, indexes or rights are refused. The first Fortune product binds these
internally to its one original pack and exposes only the safe `tag` filter.

Third-party packs additionally require the selling host's injected live
`authorizeUse` callback, checked independently at `before-payment` and
`after-settlement`; lack of that host policy always refuses, including when
the pack's old rights record looked permissive. Authorization is bounded to
one source/edition, not a global x402 or workspace privilege. Every paid
sample carries `sourceUrl` and `rightsEvidenceUrl` when present alongside
attribution; avoid stripping license obligations at the buyer interface.

Distinct upstream rights, source costs and supplier scopes remain separately
typed, not aggregated into one false all-permissive license. The shelf
currently holds qualified JSON lots in process memory; source acquisition,
persistent corpus storage, durable payment receipts and live rights-policy
attestation are duties of their existing original source/merchant hosts.

## Existing seller integration contract (not activated)

One original Market catalog operation should bind:

- **GET** `/v1/text/fortune`; category `data`; tentative fixed
  `$0.01` USDC per accepted selection, subject to actual pricing/cost approval.
- **Compute**:
  `@red-cup-engineering/paid-data-endpoint-service/fortune-product`
  export `drawRandomFortune`, arguments `["query"]`.
- **Admission**: same package subpath, `admitRandomFortuneQuery`.
- **Input**: optional lowercase `tag`, no other query parameters.
- **Output**: the `561.qualified-short-text-sample.v1` shape plus
  interpretation, commercialScope and null local receipt field.
- **Payment**: source owner's current x402 v2 exact, network, asset,
  independently authorized payee, facilitator and durable recovery.
- **Discoverability**: only after seller source/compiled identity,
  public response, schema, priced 402 challenge, and paid fulfillment
  are received on the *same running version*. Until then keep the
  offer held/unlisted and outside externally submitted Bazaar indexes.

Do not deploy this feature by deploying an unsafe Market main:
`causeway-services/market.561.group` currently documents a missing
`MARKET_ACCESS_GRANTS` binding, omitted `NODE_MARKET_ORIGIN` and an
existing outage/rollback. The canonical Merchant #4 issue controls cutover.

## Economics, rights, and receivers

A fortune is a **priced selection and delivery**, not a declaration that
one random index is worth a GPU-hour. Measure per invocation: displayed
USD/atomic price and fee rail, attempt/402, selection count, prepare CPU
and memory process-window scope, bytes returned, facilitator receipt,
independently observed settlement, customer-accepted response,
actual cloud/energy cost where measurable, tax/refund, and net outside
settled contribution. Unknown cost is unknown, not zero; internal transfers
are not customer sales. Reuse Market's existing settlement resource meter
and SKU identity rather than invent another finance ledger.

The meaningful extension is adding *licensed content packs and typed
source/rights admissions* to a platform that already sells arbitrary bound
exports. Selling chengyu, idioms, glossary readings, small proofs and other
computations then becomes a new qualified pack/export declaration rather
than a new payment implementation.

## Tests

`node --test test/qualified-short-text-inventory.test.mjs` covers Unix
parsing, rights failures, edition tampering, duplicate and oversized
entries, hostile query controls, unbiased rejection-sampled indexes and
the first 50-entry product. This focused suite needs only Node 22 and
built-in modules; the full parent workspace tests retain their existing
package/registry prerequisites. Passing this test is not deployment
or external-sales proof.
