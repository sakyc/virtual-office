# Rupiah usage estimates

Runtime update 2026-10-25: Express now injects active prices from the shared model
catalog (owner screenshot defaults plus exact-ID admin overrides). Dashboard
estimates therefore use the same current rates as billing, not the historical
standalone table below. Failed catalog reads give unavailable estimates, never
fallback prices. Supplier prices remain multiplied by captured/current FX and 2.
The screenshot rate card is owner-supplied, not independently provider-verified;
see `chat-models.md` for exact-name matching, validity, limitations and precedence.
FX retrieval is independent of the historical standalone price table's expiry.
Historical saved usage is not retroactively debited; estimates are still not
invoices. The old fixed table is retained only as the standalone module default
for isolated compatibility tests, not as Express runtime billing authority.

Implemented 2026-10-25. This is a read-only cost preview, NOT a wallet,
invoice, top-up service, or authorization to charge existing usage. No migration,
schema change, database write, or paid model request is required. Restart the API
and refresh the usage page. Missing estimates do not disable existing AI features.

## Verified sources and supported prices

The public Anthropic pricing page returned HTTP 200 on 2026-10-25:
https://platform.claude.com/docs/en/about-claude/pricing
The model overview also returned HTTP 200 and exposed the current model IDs:
https://platform.claude.com/docs/en/models/overview

Prices below are USD per million tokens for standard direct API text usage:

| Exact model ID | New input | Output | Cache read |
| --- | ---: | ---: | ---: |
| claude-sonnet-5-5 | 2 | 10 | 0.10 |
| claude-opus-5-5 | 4 | 20 | 0.20 |
| claude-fable-5-1 | 10 | 50 | 0.25 |
| claude-haiku-4-5-20251001 | 1 | 5 | 0.10 |

Do not fuzzy-match aliases/model families to these prices. Haiku 5.5 has a
prompt-length-dependent price; its correct request-level tier cannot be recovered
from model-level aggregates, so it remains explicitly unpriced in this preview.
Other unlisted models also remain unpriced. Pricing support does not add models
to the chat allowlist or prove provider-account access.

The static reviewed table expires on 2026-11-24T00:00:00Z. Verify the source and
update the reviewed table/tests before extending validity. Do not turn expiry
into a fabricated zero-price fallback. This estimate excludes tools, batch/fast
mode, special regional pricing, taxes, payment fees and provider adjustments;
it is not an invoice reconciliation service.

## Exchange rate and calculation

The server fetches only the fixed public endpoint (no API key or tenant data):
https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR
Its successful live response during implementation was USD 1 = IDR 18108,
dated 2026-10-23. This is a reference rate, not a bank conversion guarantee.

The daily rate is cached at most six hours and rejected if dated in the future
or more than five days old (weekends/holidays accommodated). Fetch timeout is
five seconds, calls are coalesced, failures backed off for one minute, redirects
rejected. Stale/invalid rates and failed fetches never become zero-cost estimates.
There is no network request at startup, no background database task, and tests
mock all exchange-rate calls.

`estimated IDR = token cost in USD × reference IDR/USD × 2`.
Amounts use BigInt fixed-point arithmetic. Public amounts are integer strings;
rounding is upward to whole rupiah once per displayed amount. A period is rounded
once from the exact combined numerator, not by adding rounded request amounts.
This means a displayed total can differ from the sum of individual roundings.

## Coverage and tenant boundaries

The existing usage endpoint retains session and server-resolved tenant scoping.
Owners/admins see their workspace; other authorized roles see only their own
usage. The added aggregate query covers the full selected period, not only the
50 recent requests. Each recent request also gets its own preview. No pricing,
markup, currency or tenant overrides are accepted from the client.

Completed rows need all token categories present. Unresolved usage is not free.
Existing aggregate cache-write counts have no 5-minute/1-hour split, so rows with
cache writes remain unpriced rather than assuming the cheaper duration. A mixed
period shows a clearly partial known subtotal plus excluded-request reasons,
never an authoritative total or a balance. The UI labels every amount as an
estimate recalculated at CURRENT rates: old requests are NOT retroactively billed
or represented as having a historical pricing snapshot.

The UI no longer shows 5-hour/weekly quota cards. Existing unconfigured observation
fields remain in the API for compatibility, without enforcement. Saldo AI and
top-up are explicitly inactive. Actual debits require a separate durable wallet,
funding verification, request-time price/FX snapshots, cache-duration evidence,
atomic reservation/settlement and reconciliation; none is simulated here.
