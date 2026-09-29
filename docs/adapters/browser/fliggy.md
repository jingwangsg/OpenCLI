# Fliggy (飞猪)

`opencli fliggy flight` compares an **exact international round-trip itinerary** through the signed-in browser profile. Give every flight number in travel order for both directions:

```bash
opencli --profile edge fliggy flight SIN OSA \
  --depart 2026-11-27 --return 2026-12-06 \
  --outbound CX636,CX566 --inbound CX567,CX635 \
  --site-session persistent -f json
```

Use city IATA codes (`SIN`, `OSA`, `TYO`), not airport codes when the city has multiple airports. This command checks one adult economy fare and returns the lowest unrestricted agent quote offered for those exact flight numbers. The result includes the tax-inclusive round-trip CNY price, fare and tax components, and connection durations in minutes. It is a selected quote, not a checkout or payment total.

The adapter opens Fliggy's international flight results origin in the selected profile, then calls the site's `flight_search_result_poller.do` JSONP endpoint from that origin with the profile's current cookies and browser headers. It queries three read-only API stages: outbound inventory, returns conditioned on the exact outbound flights, and agent products conditioned on the exact round trip. It verifies both routes, dates and flight numbers before returning a price. It skips restricted fares such as student-only products. The page navigation establishes the same origin. The command does not click result cards. When the API returns `isContinue`, it repeats the pending stage using the server's `delayForNextPoll` until results are complete, with a bounded timeout.

If the account or verification state changes, complete the visible login or challenge in the same `--profile` and retry. The private site API can change without notice; an incomplete or malformed API response is reported as an error instead of a partial price. A quote does not reserve a seat, and baggage/changes/refunds should be checked on the selected fare before purchase.
