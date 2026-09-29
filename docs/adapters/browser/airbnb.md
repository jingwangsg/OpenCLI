# Airbnb

Search accommodation by destination, dates, adult count, and currency through the
existing Browser Bridge session. No login was required in live checks.

```bash
opencli airbnb search Bangkok --checkin 2026-10-15 --checkout 2026-10-17 --limit 10
opencli airbnb search Tokyo --checkin 2026-10-20 --checkout 2026-10-23 --adults 1 --currency USD --limit 30 -f json
```

`--adults` defaults to 2 (1–16); `--currency` defaults to SGD; `--limit` defaults
to 10 (1–50). Dates are required. Results preserve Airbnb's API ordering and
follow the API's page cursors until the requested count or the end of results.

| Fields | Meaning |
|--------|---------|
| `rank`, `id`, `name`, `description` | Position, listing ID, name, and displayed property type/location |
| `rating`, `reviews` | Rating out of 5 and review count; `null` when absent |
| `price`, `priceUnit`, `currency` | Current displayed price for the **whole stay**; `priceUnit=stay` |
| `nights`, `checkin`, `checkout` | The requested stay |
| `url` | Listing link with dates, adults, and currency; tracking parameters are omitted |

Prices are the search API's displayed stay totals, not a confirmed booking quote.
The command excludes alternate-date recommendations, deduplicates listings across
pages, and fails if the quote's currency or night count does not match the query.
A CAPTCHA or login gate must be completed manually.

## Implementation and verification

Strategy: browser-bootstrapped GraphQL API (`Strategy.COOKIE` in the registry).
The adapter uses the English Singapore regional website and opens `/s/<city>/homes`.
It advances once with the site's Next control to capture the current
`/api/v3/StaysSearch/` request, including the live CSRF and API headers. It then
replays that API directly from its first-page cursor, using browser cookies, and
requests later cursors as needed. Listing ids come from the API's encoded
`DemandStayListing` identity; prices come from its structured display-price
response. No card text is used for price extraction. A search with no Next
control currently cannot bootstrap this API request and reports an error.

Verified live on 2026-09-29: Osaka, 2026-11-28–12-01, SGD, 50 unique listings
through the API. Tests cover API pagination, alternate-date offers, exact currency
and route identity.
