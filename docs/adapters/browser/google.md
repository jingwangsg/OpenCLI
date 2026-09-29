# Google

**Mode**: 🌐 / 🔐 Mixed · **Domains**: `google.com`, `suggestqueries.google.com`, `news.google.com`, `trends.google.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli google flights <from> <to> --depart <date> --return <date>` | Compare booking-provider quotes for Google Flights' lowest shown nonstop round trip on specified dates |
| `opencli google flight-offers <url>` | Read provider quotes for an already selected Google Flights itinerary through its booking API |
| `opencli google images <keyword>` | Search Google Images and extract visible photo/image results |
| `opencli google news [keyword]` | Get Google News headlines (top stories or search) |
| `opencli google search <keyword>` | Search Google and extract results from the page |
| `opencli google suggest <keyword>` | Get Google search suggestions |
| `opencli google trends` | Get Google Trends daily trending searches |

## What works today

- Public API commands work without a browser:
  - `news` — RSS feed, supports top stories and keyword search
  - `suggest` — JSON API, no auth needed
  - `trends` — RSS feed, supports different regions
- `google search` uses browser mode to extract results from google.com.
- `google images` uses browser mode to extract visible Google Images results. By default it opens image previews and decodes Google's `imgurl` value so `imageUrl` is the original file URL when Google exposes it. Use `--resolve false` to skip preview clicks and return faster thumbnail-only rows.
- `google flights` uses one browser filter action to obtain the current Google request context. It pins one adult and economy, then calls `GetShoppingResults` for both flight selections and `GetBookingResults` for provider quotes. Flight numbers, local dates/times and prices come from these API responses; it does not read flight-card labels or click outbound/return cards. The final provider quotes must match both selected flight numbers. The booking URL encodes the selected airports, dates and flight numbers.
- `google flight-offers` accepts a `/travel/flights/booking?tfs=...&curr=SGD` URL and checks the captured API criteria against the URL's decoded itinerary and SGD context before replaying its booking request. Provider flight numbers must match the selected legs. Both commands report Google Flights quotes, not verified checkout prices on the provider sites. `separateTickets` is `null`: this API projection does not establish the ticketing relationship.

## Current limitations

- `google search` may trigger CAPTCHA in Standalone browser mode. Extension mode (with an established Chrome session) is more reliable.
- `google images` uses the same browser-backed Google session as `search`, so it can hit the same CAPTCHA or consent-page limitations.
- `google flights` pins SGD and still needs the English Stops/Nonstop filter to bootstrap the browser-generated request context. Those headers cannot be omitted: a simplified request returned no WSI flights despite the complete request returning offers. Search and booking RPC arrays are internal formats and are validated before returning results.
- Google frequently changes its DOM structure. If `search` stops returning results, selectors may need updating.
- Image result pages are especially dynamic; some rows may still expose only thumbnail URLs if Google does not load an `imgurl` value after the preview opens.
- Snippet extraction may return empty for some results depending on Google's layout.

## Usage Examples

```bash
# Search Google Images / photos
opencli google images "golden gate bridge at sunset" --limit 10

# Faster thumbnail-only image search
opencli google images "golden gate bridge at sunset" --limit 10 --resolve false

# Get top news headlines
opencli google news --limit 5

# Search news for a topic
opencli google news "artificial intelligence" --limit 10 --lang en --region US

# Search Google
opencli google search "typescript tutorial" --limit 10

# Compare direct round-trip fares for both Sydney airports
opencli google flights SIN WSI --depart 2026-12-01 --return 2026-12-04 -f json
opencli google flights SIN SYD --depart 2026-12-01 --return 2026-12-04 -f json

# Cross-check the route on Trip.com and Ctrip
opencli trip flight-round SIN WSI --depart 2026-12-01 --return 2026-12-04 -f json
opencli ctrip flight-round SIN WSI --depart 2026-12-01 --return 2026-12-04 -f json

# Get search suggestions
opencli google suggest python

# Output as JSON
opencli google search "machine learning" -f json

# Get trending searches in Japan
opencli google trends --region JP --limit 10
```

## Prerequisites

- `suggest`, `news`, `trends` do not require Chrome.
- `search`, `images`, `flights`, and `flight-offers` require:
  - Chrome running (or Standalone mode will auto-launch)
  - For best results, use the [Browser Bridge extension](/guide/browser-bridge) with an established Google session

## Notes

- `suggest` defaults to `--lang zh-CN`; other commands default to `--lang en`.
- `news` supports `--lang` and `--region` parameters for localized results.
- `trends` traffic values are raw strings (e.g. "500K+", "1,000,000+"), not numeric.
- `search` output includes three result types: `result` (standard), `snippet` (featured answer box), and `paa` (People Also Ask).
- `images` output includes `rank`, `title`, `imageUrl`, `thumbnailUrl`, `sourceUrl`, `source`, `width`, and `height`. With default preview resolution, `imageUrl` is the original image URL when Google provides one; otherwise it falls back to the visible thumbnail URL.
- `images --resolve false` skips preview clicks, so it is faster but more likely to return thumbnail URLs in `imageUrl`.
- `flights` returns one row per booking option for the selected itinerary. Every price is quoted by Google Flights; `separateTickets` remains unknown (`null`) for this API projection. The `url` opens the exact Google Flights itinerary. For independent site quotes, use the existing `trip flight-round` and `ctrip flight-round` commands; those commands show the outbound leg with a round-trip price and do not verify the return leg.
