# Agoda

Search hotels by city, stay dates, adult count, and currency using the existing
Browser Bridge session. The search is for **one room**.

```bash
opencli agoda search Bangkok --checkin 2026-10-15 --checkout 2026-10-17 --limit 10
opencli agoda search Tokyo --checkin 2026-10-20 --checkout 2026-10-23 --adults 1 --currency USD -f json
opencli agoda search 9395 --checkin 2026-10-15 --checkout 2026-10-17 --limit 50
```

The destination accepts a city name or an Agoda city ID. Ambiguous city names
return candidates instead of silently selecting a different city. `--adults`
defaults to 2 (1–16), `--currency` to SGD, and `--limit` to 10 (1–50).

| Fields | Meaning |
|--------|---------|
| `rank`, `id`, `name`, `area` | Position, hotel ID, hotel name, and displayed neighborhood |
| `stars`, `rating`, `reviews` | Property stars, guest rating out of 10, and review count |
| `price`, `priceUnit`, `currency` | Per-night price including taxes and fees, with `priceUnit=night` |
| `totalPrice` | Whole-stay price including taxes and fees from the same room offer |
| `taxesIncluded` | `true` for the API's inclusive price fields |
| `nights`, `checkin`, `checkout` | The requested stay |
| `url` | Hotel link with stay length, adults, and currency |

Results preserve the site's API ordering, including sponsored hotels. API pages
are requested as needed, so the result set includes properties that the page has
not rendered yet. Sold-out hotels are excluded. `totalPrice` is a listing quote
for the selected room offer, not a final checkout amount. Unknown stars, ratings,
and review counts are `null`.

## Implementation

Strategy: browser-signed GraphQL API (`Strategy.COOKIE` in the registry).
City resolution is a public lookup via
`/api/cronos/search/GetUnifiedSuggestResult/3/1/1/0/en-us/`. Both Bangkok and Tokyo
lookups were checked without cookies. Result URLs identify city IDs; the adapter
does not copy tracking or signed query parameters into searches.

Searches use `/search?city=...&checkIn=...&checkOut=...&adults=...&rooms=1&currency=...`.
The page creates a `citySearch` request to `/graphql/search`; OpenCLI captures its
current headers and body, then calls that API directly with the profile's cookies.
The adapter checks city, dates, nights, adults and currency before replaying the
request. Incrementing its API page number was verified to return a different
page; no browser scrolling or card parsing is used for prices.

The English website was used for verification. Login/CAPTCHA challenges require
manual completion. No booking or account changes are performed.

Verified live on 2026-09-29: Osaka, 2026-11-28–12-01, SGD, 50 unique hotels
through the API; Tokyo, 2026-11-29–12-02, SGD, API replay and page two. Tests
cover sold-out listings, pagination, stay prices and city resolution.
