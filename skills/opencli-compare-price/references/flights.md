# Flights

Use this reference for flight comparisons. Check each command's live `--help` before use.

## Shortlist

- For flexible dates, use one site's date grid or a bounded set of date searches to choose promising **outbound and return date pairs**. Keep direct/stop, airport, and duration filters fixed while ranking pairs.
- When nonstop flights are required and dates are fixed, `opencli google flights <from> <to> --depart YYYY-MM-DD --return YYYY-MM-DD -f json` selects Google Flights' lowest shown itinerary with **both legs nonstop** and lists its booking-provider quotes in SGD. Use another search when connections are allowed. This is one metasearch observation, even when it lists Expedia, Booking.com, Trip.com, and others.
- `opencli trip flight-round` reads Trip.com's full outbound API inventory, including flight numbers, connection cities and layover minutes, with each outbound priced for a round-trip search. `opencli ctrip flight-round` also shows outbound rows. Both require the return leg to be selected or inspected before calling the itinerary identical to another offer.
- `opencli --profile edge fliggy flight <from> <to> --depart <date> --return <date> --outbound <comma-separated flight numbers> --inbound <comma-separated flight numbers>` uses the signed-in browser profile to call Fliggy's flight API for an **exact round trip**. It returns a tax-inclusive CNY quote and connection durations. Use it after the reference site identifies both legs; it does not search flexible dates.
- For a connecting itinerary on Google Flights, open a date-specific `https://www.google.com/travel/flights?hl=en&curr=SGD&q=Flights%20from%20SIN%20to%20KIX%20on%202026-11-27%20through%202026-12-06` search in an OpenCLI browser session and select the exact flight numbers. Pass the resulting `/travel/flights/booking?tfs=...&curr=SGD` URL to `opencli --profile edge google flight-offers <url>` for API-backed provider quotes. Follow the Booking.com option into `flights.booking.com` and read its own offer before counting Booking as independently checked. `opencli booking search` is for hotels; `opencli google flights` currently handles nonstop round trips only. Use browser `wait selector`/`wait text` or a specific network response after navigation, not `wait time`.

## Match and price

Match each leg by travel date, origin and destination **airport codes** (for example SYD and WSI are different), operating airline and flight number when exposed, departure/arrival times, and stops. Codeshares can be the same physical flight but a different fare product. Confirm the passenger count, cabin/fare family, baggage, changes/refunds, and whether two one-way tickets are being sold separately.

Compare the full round-trip total with required taxes and payment fees. Treat baggage, seats, or card charges as additional cost if the chosen fare excludes them. A one-way fare plus another one-way fare is not automatically the site's round-trip offer. If flight number is absent from an adapter, open the flight detail or booking page to confirm the match; until then mark identity provisional.
