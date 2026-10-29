# API Capability Marketplace: a design prototype

A small web app that prototypes how a travel-tech company could **package its technical capabilities as paid partner APIs and price them**. Built to show product thinking: what to sell, how to charge for it, where the money leaks, and what a partner sees.

> **Read this first.** Everything here is a *design prototype*, not a shipped product. The company is **fictional**, all data is **invented** and labelled "illustrative", and the research comes from **public sources only** (see [Sources](#sources)). Nothing here reflects inside knowledge of any real company's pricing, architecture or economics.

## Quick start

Needs Node 22.9+ (developed on Node 24); `npm run seed` relies on `--env-file-if-exists`.

```bash
npm install
npm run dev        # http://localhost:3000
```

That is the whole setup. With no environment variables the app runs in **file mode**: it reads `seed/*.json` and writes your edits to `.data/` (git-ignored). Nothing else to install, no database.

```bash
npm test           # pure-logic tests; no database, no network (< 30 s)
npm run typecheck
npm run build
```

### Using MongoDB Atlas (optional)

The data model targets MongoDB. To run against Atlas instead of files:

1. Create a free **M0** cluster. Create a database user with `readWrite` on the database `marketplace_demo` only. Allow your IP.
2. Copy `.env.example` to `.env` and fill in `MONGODB_URI` (and keep `MONGODB_DB=marketplace_demo`). `.env` is git-ignored; never commit it.
3. `npm run seed` loads the seed data. It refuses to run unless `MONGODB_DB` is exactly `marketplace_demo`, and only drops and re-creates this app's collections.
4. `npm run dev`. When `MONGODB_URI` is set the app uses Mongo; set `DATA_MODE=file` to force file mode again. If Atlas is unreachable, Mongo mode fails fast (5 s) with a clear message instead of hanging.

The Mongo adapter (`lib/repo/mongo.ts`) is written against the same interface as the file adapter, but it is **not covered by the automated tests**, which are offline by design. Treat it as manually verified: seed, open `/mapping`, generate proposals, approve one, and check the `audit_log` collection.

## What is in it

| Page | Feature | What it shows |
|---|---|---|
| `/` | Catalog | Six fictional capabilities, each with a product card and an OpenAPI spec (`public/openapi/*.yaml`) |
| `/calculator` | 1. Cost-per-booking calculator, 2. Excess-search tiers | Four ways to charge, side by side, with break-even volumes and per-capability excess fees |
| `/mapping` | 4. Dedupe / property mapping | Duplicate hotel records across three suppliers, a match score and merge proposal, human approve/reject |
| `/mapping/audit` | 4. Audit log | Append-only log of why each match was proposed and decided |
| `/cache` | 3. Cache toggle | Hit rate and cache lifetime sliders: supplier cost saved versus expected failed checkouts |
| `/deals` | 5. Custom deals | Committed-volume discounts for a large bank versus a small agency; versioned price books |
| `/onboarding` | 6. SDK, sandbox, onboarding | Sign up, get a sandbox key, make a first call with the SDK, see time-to-first-call |

## Product decisions (plain language)

**Why these capabilities.** A travel marketplace's real products are not "an API", they are jobs partners need done: find availability (Search), get clean property data (Content & Property Mapping), match room types (Room Mapping), spot duplicates (Dedupe), get a final price (Pricing), and know the taxes (Taxes & Fees). Each is priced by the unit of work it costs to deliver, so price tracks cost.

**Why Search has a look-to-book allowance.** Partners run hundreds to thousands of searches per booking, and every search costs the platform an upstream call. A flat per-search price makes the platform subsidise browsing-heavy partners. A *look-to-book (L2B) allowance* with a *fee per excess search* is how several public price lists handle it (see Sources). It lets a disciplined partner pay a small fixed fee, and charges a wasteful one for the cost it creates.

**Why four price shapes.** Different partners want different things. A small agency wants a predictable flat fee. A large bank wants a unit price it can plan around. A platform wants to be paid in proportion to cost *and* to value. The calculator compares:

| Model | Partner pays | Good for | Risk to the platform |
|---|---|---|---|
| Flat | fixed monthly fee | predictable budgets | heavy users are under-priced |
| Per search | rate x searches | simplicity | partner bill ignores bookings, so cost per booking drifts with L2B |
| Per confirmed booking | rate x confirmed bookings | aligned with partner revenue | browsing cost is hidden inside the booking price |
| Hybrid | platform fee + fee on excess searches | most cases | needs a sensible allowance |

**Why cost per booking is the number that matters.** A per-search rate looks cheap, but what a partner really pays is `rate per search x look-to-book`. See the worked example.

## Pricing logic

Definitions used throughout (all inputs are adjustable):

| Symbol | Meaning | Default |
|---|---|---|
| `S` | searches per month (10k to 5B on a log-scale slider; the UI also shows searches per day and per second on a 30-day month) | 5,000,000 |
| `r` | look-to-book: searches per *attempted* booking | 1,000 |
| `c` | share of attempted bookings that confirm | 0.85 |
| `h` | cache hit rate | 0.30 |

- **Volume ranges by segment are judgement, not sourced:** agency roughly 100k to 5M searches a month, OTA 5M to 1B+, bank or loyalty 10M to 200M. They are labelled illustrative in the UI.
- Attempted bookings `B = S / r`. Confirmed bookings `Bc = B x c`. The effective look-to-book on confirmed bookings is `S / Bc = r / c`.
- Allowances and excess fees are measured against **confirmed** bookings, which is how L2B allowances are usually stated.
- Supplier cost = `S x (1 - h) x cost per search + Bc x cost per booking` (only cache misses call suppliers). Suppliers are blended 50/30/20.
- Money is plain numbers in USD with no intermediate rounding; rounding happens only on display.
- Each model's monthly bill is a straight line in volume (`bill = a + b x S` once `r` and `c` are fixed), so the **break-even volume between two models is closed form**, `S* = (a2 - a1) / (b1 - b2)`. It is shown as "None" when the lines are parallel or never cross inside the allowed range.
- Excess-search tiers: `bill = F + S x max(0, 1 - A x c / r) x e`, where `F` is the platform fee, `A` the included allowance and `e` the fee per excess search.

### Worked example (all numbers illustrative)

Defaults: `S = 5M`, `r = 1,000`, `c = 0.85`, `h = 0.30`, agency segment.

| Step | Calculation | Result |
|---|---|---|
| Confirmed bookings | 5,000,000 / 1,000 x 0.85 | **4,250** |
| Effective look-to-book | 1,000 / 0.85 | **1,176 : 1** |
| Supplier cost | 3.5M x $0.000132 + 4,250 x $0.214 = $462.00 + $909.50 | **$1,371.50** |
| Flat bill | fixed | $12,000.00 |
| Per-search bill | 5M x $0.0004 | $2,000.00 |
| Per-booking bill | 4,250 x $0.65 | $2,762.50 |
| Hybrid bill | $3,000 + excess; 1,176 is under the 1,500 allowance, so no excess | $3,000.00 |
| Partner cost per booking (per-search) | $2,000 / 4,250 | **$0.47** |

Now let the partner browse more: `r = 5,000`.

- Per-search cost per confirmed booking: `$0.0004 x 5,000 / 0.85` = **$2.35** (was $0.47).
- Per-booking price: still **$0.65**.
- Hybrid at `r = 5,000`: 5M x (1 - 1,500 x 0.85 / 5,000) = 3,725,000 excess searches x $0.005 = $18,625.00 on top of $3,000, so **$21,625.00**. The excess fee is the lever that stops browsing-heavy partners being cheap to serve and costly to host.

The same arithmetic is pinned in `tests/pricing.test.ts`.

## Dedupe / property mapping

The same hotel shows up under several supplier codes with messy data: abbreviations ("St." vs "Street"), transposed digits, geo drift of 50 to 300 m, missing phones. The seed has 12 invented hotels x 3 fictional suppliers plus one decoy with the same name in a different city, and the scenario pairs below (55 records in all).

- **Blocking** (avoid comparing everything with everything): only compare records from *different* suppliers that share the first three characters of the postal code, or are within 500 m.
- **Signals**, each 0 to 1: name (Jaro-Winkler on normalised, sorted tokens, or token overlap, whichever is higher), address (token overlap on street, city, postal), geo (`1 - distance / 300 m`, floored at 0), phone (exact match on digits).
- **Weights**: name 0.35, address 0.30, geo 0.25, phone 0.10. If a phone is missing on either side, its weight is redistributed over the other signals and the audit reason says so.
- **Thresholds**: score of 0.85 or more is proposed as *strong*; 0.60 to 0.85 as *review*; below 0.60 is not proposed.
- **Nothing auto-merges.** A human approves or rejects. Approval writes the proposal status, the canonical hotel and the audit entry in one transaction. Approving a pair when one side is already in a canonical hotel *joins* it, so a cluster of three ends as one hotel with three members. A repeated decision is a no-op.
- **Audit log** is append-only: the only write path is `appendAudit()`, and the repository rejects updates to that collection.

Weights and thresholds are invented starting points, not tuned on real data. Rule version is `v2`: v1 did not fold accents, so "Hôtel" and "Hotel" differed; v2 folds them. Weights and thresholds are unchanged.

### Seeded scenarios (all invented)

Besides the 12 clean clusters, the seed has 8 deliberate test pairs and 2 orphans, so the queue shows a real score spread (42 proposals, 0.63 to 0.98: 12 strong, 30 in the review band). The intended outcome is what a reviewer should do. Nothing auto-merges, so several intended approves and rejects land in the review band. `tests/matching.test.ts` asserts that every intended non-match scores below the 0.85 auto band, and the pairs are listed in `seed/dedupe_scenarios.json`.

| Pair | Case | Intended | Score | Band |
|---|---|---|---|---|
| Ironbark Grand Downtown / Airport | Same brand, different property | Reject | 0.26 | not proposed |
| Pelham Street Hotel / Residences | Sister properties, same address, different phone | Reject | 0.79 | review |
| Meridian Lakeside Inn / Cedarwood Waterfront Lodge | Rebrand: new name, same address, location, phone | Approve | 0.85 | review |
| Hôtel Beauclerc / Beauclerc Hotel (Québec) | Bilingual name | Approve | 0.98 | strong |
| Harlow Bridge Hotel (two feeds) | Coordinates about 300 m off, no phone on one side | Approve | 0.72 | review |
| Tamarak Ridge Lodge / Tamarack Ridge Lodge & Spa | Typo, extra words, missing street line | Approve | 0.79 | review |
| Northwind Suites, 410 / 1850 Main Street | Same chain, same road, 1.2 km apart | Reject | 0.59 | not proposed |
| Harbourview Inn North / South | Neighbouring wings, different phones | Reject | 0.73 | review |

Lantern Hill Cabins and Fennimore Station Hotel have no counterpart and are never proposed. Scores are rounded from the seeded data and pinned by the band assertions in the tests.

## Cache toggle

Caching trades cost against freshness. A cached price can change before the traveller checks out, and a "price changed at checkout" failure costs real money and trust.

- `stale rate = min(12%, 0.0015 x lifetime in minutes x (1 + 2 x hit rate))`. Higher hit rates mean more of the traffic rides on old prices, so staleness grows with both knobs. The shape and every number are **invented**.
- Expected failed checkouts = confirmed bookings x stale rate, each costed at an invented $4.00.
- Savings = searches served from cache x the blended supplier cost per search.
- Worked example (defaults, 10-minute lifetime): stale rate 2.4%, so 102 failed checkouts a month, **$408**. The cache saves 1.5M upstream searches, worth **$198** at $0.000132 each. **Net: -$210.** At invented, very cheap upstream prices the cache does not pay for itself on call cost alone; the page shows the supplier price per search above which it would. The honest reading is that the case for caching rests on speed and on avoiding supplier excess-search fees, which this model does not capture.
- The hit-rate slider carries a warning above 70%, because "up to ~70% of upstream calls" is a vendor claim.

## Custom deals

A large partner will not pay list price. The question is what to give for what. Here the currency is **committed monthly volume**:

| Slice of monthly volume | Discount on that slice (invented) |
|---|---|
| first 1M | 0% |
| 1M to 10M | 8% |
| 10M to 100M | 15% |
| above 100M | 22% |

- **Graduated, like income tax.** Each slice of volume gets its own tier's discount; reaching a higher tier discounts only the volume above the threshold. An earlier all-units design (the whole bill drops to the new tier's rate) had a cliff: committing 10M billed less than committing 9.5M. Graduated tiers make the bill rise monotonically with volume, so committing more can never lower it (pinned by a test).
- **Take-or-pay, and discounts only on committed volume.** The partner pays for `max(actual, committed)` volume, and only the committed part earns graduated discounts; volume above the commitment is billed at list. So a token commitment saves almost nothing, the bill falls as the commitment approaches actual usage, and it rises again above usage (unused commitment). The page flags a partner whose usage falls short.
- **Example.** The fictional bank commits 60M searches a month: 1M at list + 9M at 8% off + 50M at 15% off is **$20,712 instead of $24,000** at list, a blended 13.7% off ($0.000345 a search). The platform gives up $3,288 of margin in return for predictable volume. The fictional agency (800k searches, no commitment) pays list.
- **Versioned price books.** Editing a deal never overwrites. It inserts the next version, marks the previous one `superseded`, and writes an audit entry, all in one transaction. An edit based on a stale version, or a concurrent write to the same version, is rejected with a 409 (backed by a unique `{partnerId, version}` index). The discount is always recomputed from the tier table, never taken from the request.

## SDK, sandbox and onboarding

A partner's first hour decides whether they integrate. The prototype covers that path end to end: sign up on `/onboarding`, get a sandbox key, make a first call with the SDK, and see how long it took.

```ts
import { MarketplaceClient } from "./sdk";

const client = new MarketplaceClient({ apiKey: "sbx_...", baseUrl: "http://localhost:3000/api/v1/sandbox" });
const quote = await client.search({ hotelId: "H-1001", checkIn: "2027-03-01", nights: 2 });
const booking = await client.book({ rateKey: quote.rateKey, guestName: "Test Guest" });
```

- **Sandbox.** `POST /api/v1/sandbox/{search|book|content-mapping|room-mapping|dedupe|pricing|taxes}` with `Authorization: Bearer sbx_...`. Responses are deterministic stand-ins (same input, same output) and labelled illustrative. Keys come from `POST /api/v1/onboarding/signup`; only the SHA-256 of a key is stored, and the plaintext is shown once.
- **Retry policy.** The SDK retries up to 3 times (4 calls in total) on HTTP 429, any 5xx, and network errors, with exponential backoff from 200 ms plus jitter. It never retries other 4xx responses. Errors are typed: `AuthError` (401/403), `ValidationError` (other 4xx), `RateLimitError` (429), `UpstreamError` (5xx or network), all extending `MarketplaceError`. Known limit: there is no per-attempt timeout and `Retry-After` is ignored; production would add `AbortSignal.timeout` per attempt and honour `Retry-After`, capped.
- **Idempotency.** `book` always sends an `Idempotency-Key` and reuses the same key across retries, so a retry after a lost response or a 5xx cannot double-book. Repeating a key with the same body returns the stored response with an `Idempotent-Replayed: true` header; repeating it with a **different body returns 422 `idempotency_key_reused`** (compared by a SHA-256 of the canonical, key-order-independent body), so a key can never silently return someone else's booking. The store is **in memory and resets when the server restarts**, and it is bounded (5,000 entries), so this is a demo of the contract, not a durable guarantee.
- **Simulating failures.** Send `X-Sandbox-Simulate: 429|500|502|503` to force that failure and watch the SDK retry.
- **Time-to-first-call** is the onboarding metric: seconds from signup to the first successful authenticated call, recorded once per session and shown on `/onboarding` and at `GET /api/v1/onboarding/{sessionId}`. A partner team watches it because every minute between "key issued" and "first 200" is where integrations stall.

## Sources

Public pages read 2026-10-28. Secondary sources, mostly vendor pages: treat figures as **vendor claims** and ranges, not facts.

| Topic | Plain meaning | Source |
|---|---|---|
| Look-to-book ratio | Partners run hundreds to thousands of searches per booking; suppliers throttle or fee the excess | phptravels.com/blog/look-to-book-ratio-travel-api; lodgingbase.com/solutions/edge-cache |
| Per-call price hides real cost | Cost per booking = per-search rate x L2B; the cheap rate can cost more | zentrumhub.com/blog/hotel-api-aggregator-pricing |
| Excess-search fees | Duffel lists $0.005 per excess search above 1,500:1; NDC Gateway lists $0.05 above 400:1 (as listed Oct 2026) | duffel.com/pricing; ndcgateway.com/en-US/pricing |
| Cache vs fresh price | Caches can cut up to ~70% of upstream calls (vendor claim) but risk "price changed at checkout" | lodgingbase.com; Sabre/OAG commentary via phptravels |
| Hotel and room mapping | One hotel appears under many supplier codes; room mapping is harder than property mapping | giata.com; vervotech.com/hub/duplicate-hotel-mapping |
| Pricing shapes | Per-call, per-booking, subscription, net-rate margin, often combined | zentrumhub.com; developers.amadeus.com/get-started/monetization-842 |

Default rates borrow the *shape* of the public excess-fee examples. The numbers are not a claim about any company.

## Limits (honest)

- **Invented data.** Suppliers, partners, hotels, prices, costs, stale-price rates and every parameter are made up for illustration.
- **Fictional company.** This is not modelled on, and does not describe, any real company.
- **No marketplace P&L experience is implied.** This shows how I would frame the problem, not results from running one.
- **Public-source research only,** mostly vendor marketing, so figures skew optimistic.
- **Matching is a heuristic** tuned on 55 hand-made records. Real catalogues are larger, messier and need evaluation against labelled data. Candidate generation is O(n²) and canonical-hotel union scans every canonical hotel, which is fine at this size and not at catalogue scale.
- **Known gaps in dedupe.** Refreshing a still-open proposal (new score or rule version) does not write its own audit entry, so the audit "why" can lag the row. Transitive merges are not reconciled: after A-B and B-C are approved, A-C stays in the queue.
- **Do not deploy as-is.** There is no authentication: anyone who can reach the app can approve matches, edit deals and mint sandbox keys, and signup has no rate limit. It is built to run locally. Add auth and limits before any public hosting, especially against a real Atlas database.
- **Single process.** File mode serialises writes inside one Node process (transactions queue behind each other). It is not safe across multiple processes sharing one `.data/` folder. The idempotency store is in memory and resets on restart.
- **Per-capability tiers assume every capability is called S times a month** (content mapping and pricing included); a real price book would use each capability's own volume.
- **Mongo mode is manually verified, not covered by automated tests** (the tests are deliberately offline).
- **Out of scope:** payments, real supplier calls, auctions or ranking models, multi-language SDKs, real authentication, hosting.

## What I would measure after launch

- Cost per confirmed booking by partner segment, against the platform's supplier cost per booking.
- Share of partners above their L2B allowance, and how much excess revenue that produces versus the support and churn it causes.
- Look-to-book distribution per partner over time (does the allowance change behaviour?).
- Dedupe precision and recall against a labelled sample; reviewer approve/reject rate and time per decision.
- Time-to-first-call for new partners.

## Repository layout

```
app/            Next.js pages and API routes (app/api/v1/*)
components/     small shadcn-style UI primitives and the calculator
lib/pricing/    calculator, excess tiers, cache model (pure)
lib/matching/   text helpers, scoring, blocking, proposal service
lib/repo/       repository interface with file and mongo implementations, audit log
public/openapi/ one OpenAPI spec per capability
seed/           invented seed data (generated deterministically: npm run seed:gen)
scripts/        Atlas loader (npm run seed)
tests/          vitest, pure logic
```

## Licence

Original code. Cite the sources above rather than copying vendor text.
