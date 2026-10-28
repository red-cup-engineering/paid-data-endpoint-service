# Federal Register regulatory watch

Customer job: maintain a machine-readable watch of relevant federal rulemaking, comment opportunities and effective dates without manually reviewing the whole register.

The original supplier exports `normalizeRegulatoryWatchQuery`, `projectRegulatoryWatch` and `readRegulatoryWatch`. Public deployment uses `GET https://market.561.group/v1/regulatory/federal-register/watch`, initially0.01USDC per query on the merchant's existing Base rail.

Selectors: comma-separated literal `terms` (at most8; `match=any|all`), `agency`, `type`, `cfrTitle`, `docket`, `publishedSince`, `deadlineWithinDays` (0–30), `limit` (1–100), `offset` and `edition`. Dates are civil dates as returned by the source. A response includes source coverage, document revisions, docket/CFR links, comment/effective calendar dates and `next`. Send `next.edition` with the original selectors and `next.offset` on following pages. When the source edition advances, restart at offset0. Keep document revision IDs to detect changed records across watches.

The supplier reads the original `data/records/newswire/federal-register/latest.json` publication, acquired by the existing `publish-federal-register-source-editions.yml` operation every three hours. Source bytes are shared for three minutes, capped at5,000,000bytes and8seconds. Source observations expire after12hours. A failed delivery returns through the existing seller's cancellation boundary. Output contains at most100records and200calendar entries.

House composition invokes this same exported supplier under its existing Work allocation, with no cash transfer between internal services. The Public instance supplies the source URL, freshness policy, price and merchant. The original acquisition owner supplies source editions; the regulatory-watch supplier supplies restriction and projection; the merchant supplies pricing, payment, demand signals and support. Improvements return to these same owners.

Receiving: the actual2026-10-25 edition contains469documents, including2matching “artificial intelligence”,29matching “cybersecurity,security”,53Commerce records,4CFRtitle47records, and100records with comments closing within30days of the receiving clock. These counts describe that edition. Subsequent observations will change them. Editorial publication and subscription entitlement remain with their original providers.


Deadline watches select the existing independent `comment-deadlines.json` acquisition across publication cohorts. The original producer now preserves already acquired abstracts, types, dockets, CFR references, effective dates and correction fields in that distribution, alongside its original source edition and receipt. Other watches select the recent-publication window. Their separate source windows and edition digests travel with every result. A requested deadline horizon must fit its acquired window; a publication-window restriction cannot replace it. The2026-10-26 deadline acquisition returned743records in8requests, including older publications.
