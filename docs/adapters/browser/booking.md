# Booking.com

**Mode**: Browser profile + GraphQL API · **Domain**: `www.booking.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli booking search` | Search hotels by destination + check-in/check-out dates |

## Usage Examples

```bash
# Basic — 2 adults, 1 room
opencli booking search Tokyo --checkin 2026-06-15 --checkout 2026-06-17

# Force result locale and currency
opencli booking search Paris --checkin 2026-07-01 --checkout 2026-07-03 \
  --lang en-us --currency USD

# Family stay — 2 adults + 2 children, 1 room
opencli booking search Singapore --checkin 2026-06-15 --checkout 2026-06-20 \
  --adults 2 --children 2

# Start at result 26; the command requests further API pages up to --limit
opencli booking search Tokyo --checkin 2026-06-15 --checkout 2026-06-17 --offset 25

# JSON output for downstream tooling
opencli booking search Tokyo --checkin 2026-06-15 --checkout 2026-06-17 -f json
```

## Output

### `search`

| Column | Type | Notes |
|--------|------|-------|
| `rank` | int | 1-based position within this query (carries `--offset` so paginated calls stay sortable) |
| `name` | string | Hotel display name. May be localized by browser session cookies — see *Locale handling* below |
| `country` | string | ISO-3166 alpha-2 country code from the property record |
| `slug` | string | URL path slug — stable cross-locale identifier, round-trips into the canonical detail URL |
| `star_rating` | int \| null | Booking star rating (1–5) when the API supplies one |
| `review_score` | float \| null | Aggregate guest score on a 1.0–10.0 scale (e.g. `8.6`) |
| `review_count` | int \| null | Number of reviews backing the score |
| `price_amount` | float \| null | Displayed whole-stay price from the API, rounded to cents; it remains a listing quote |
| `price_currency` | string | ISO 4217 currency code from the API; empty when there is no price. Pass `--currency USD` (or similar) to request and verify one currency |
| `distance` | string | Distance-from-centre string (locale-formatted, e.g. `3.4 km from centre` / `离中心地区3.4千米`); empty when Booking does not supply one |
| `recommended_room` | string | Name of the recommended room configuration, when available |
| `url` | string | Canonical `https://www.booking.com/hotel/<country>/<slug>.html` |

`null` semantics: a `null` field means Booking did not expose that field for
the property (e.g. no star rating or price for the selected dates). Failures
raise typed errors instead of silently returning empty rows.

## Validation (no silent clamp)

- `--checkin` / `--checkout` must be `YYYY-MM-DD`; checkout must be strictly after checkin.
- `--adults` `1..30`, `--rooms` `1..30`, `--children` `0..10` — out-of-range throws `ArgumentError` (no silent clamp).
- `--limit` `1..100`, `--offset` `0..1000` — out-of-range throws `ArgumentError`.
- `--lang` must be one of the supported Booking locales (e.g. `en-us`, `zh-cn`, `ja`, `ko`, `de`, `fr`, `es`); anything else throws `ArgumentError`.
- `--currency` must be a 3-letter ISO 4217 code (`USD`, `JPY`, `CNY`, …); symbols like `US$` throw `ArgumentError`.

## Locale handling

The URL path encodes the requested locale (`searchresults.<lang>.html`) and
`selected_currency` forces ISO 4217 price symbols. **But** bound browser
session cookies can still override hotel name strings to the user's preferred
language even when `--lang en-us` is set. The `slug`, `url`, `country`, and
numeric fields stay stable regardless — prefer `slug` (not `name`) as the
round-trip key. The API supplies an ISO currency code, which the adapter checks
against `--currency` when provided.

## Anti-bot

If Booking shows a verification page, complete it in the same connected browser
profile and retry. The adapter reports verification or API errors instead of
silently substituting another platform's prices.

## Notes

- Strategy: `Strategy.COOKIE` + `browser: true`. The page supplies CSRF and the current browser User-Agent; the adapter sends a minimal `FullSearch` GraphQL query directly to `/dml/graphql` with profile cookies. No sort button or result card is required, so localized and zero-result pages can use the same path.
- Pagination advances by the API's `nbResultsPerPage`, which may be 20 or 25; the requested page size is not assumed to be the returned page size. GraphQL errors, redirects, wrong currencies, repeated pages and page-cap exhaustion are reported as errors. Recommended offers for different dates are excluded.
- Verified live on 2026-09-29: Chinese Osaka search, 2026-11-28–12-01, SGD, 45 unique properties across three API pages; English Tokyo search, 2026-12-05–12, SGD. Tests cover actual page sizes, empty results, alternate dates, currency and session context.
