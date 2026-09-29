---
name: opencli-compare-price
description: Compare the same flight itinerary or hotel room across booking platforms with OpenCLI. Use for airfare or hotel price comparisons, including flexible-date shortlisting and cross-platform deal checks; do not use for booking or payment.
---

# compare_price

Find a small set of exact candidates on one reference platform, then compare those candidates across the requested platforms. Relative price order is a useful search heuristic, not evidence that the order holds on every platform.

## Workflow

1. Fix the comparison scope: flights need origin/destination airports, dates or flexibility, one-way/round trip, passengers, cabin, and stop/baggage constraints; hotels need stay dates, guests/rooms, location, and required room/cancellation terms. Ask only for missing constraints that change the answer.
2. Check `opencli <site> <command> --help -f yaml` for known platforms; use `opencli list -f json` when coverage is unclear. For browser-backed commands, run `opencli doctor`, choose a fixed connected `--profile`, and use `--site-session persistent` when reusing a login or completed verification. Use the user's named platforms; otherwise choose a reference platform with broad coverage and usable filters.
3. Prefer a read-only site API when its real request can be captured from the connected profile and replayed with the current headers/cookies. Verify that the response belongs to the requested route/stay and matches visible prices. Keep credentials in process memory; if an opaque header binds the request body, use the captured response or page UI rather than pretending that editing the payload performs a new search. Wait for result selectors, text, or network events; fixed sleeps are not a readiness check.
4. On the reference platform, compare dates/properties/flights and record a few promising **exact candidates**, including the constraints that make each offer comparable. Read [flights](references/flights.md) or [hotels](references/hotels.md) for the identity fields and current adapter boundaries. The lowest listing price alone does not identify a matching bookable offer.
5. Search those same candidates on other platforms. Match the flight legs or hotel room and terms before comparing amounts. A metasearch site's provider quotes are leads from **one source**; count a provider as independently checked only after reading its own offer or checkout page.
6. Compare payable totals for the same passengers or stay, currency, taxes, mandatory fees, and included services. Label each price as search/listing quote, selected offer, or checkout total. Convert currencies with a current rate only when needed, and keep card/FX fees separate if unknown.
7. If another platform reverses the reference ranking, a candidate is unavailable, or offers differ materially, expand the shortlist and recheck. Do not claim a global minimum from an incomplete scan. Stop when the requested platforms and the cheapest comparable candidates have been checked, or report the remaining access/coverage gap.

Present a compact table of candidate, platform, total, included terms, verification level, observation time, and link. Lead with the lowest **confirmed comparable** price; if none was confirmed, identify the lowest displayed quote as provisional. Do not book, submit passenger details, or pay without an explicit request. If login or verification blocks a required site, read `opencli skills read opencli-autofix references/browser-blockers.md` and work through that browser SOP before marking its price unverified.
