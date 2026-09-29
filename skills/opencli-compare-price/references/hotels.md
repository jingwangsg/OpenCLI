# Hotels

Use this reference for hotel comparisons. Check each command's live `--help` before use.

## Shortlist

- Search one broad platform with the same check-in/out dates, guest count, room count, and area filter. `opencli booking search`, `opencli agoda search`, `opencli airbnb search`, `opencli trip hotel-search`, and `opencli ctrip hotel-search` are possible sources when available in the live registry. Booking.com and Airbnb expose displayed whole-stay prices; Trip.com and Agoda expose both nightly and whole-stay prices. Compare whole-stay amounts only when occupancy and room terms match.
- Keep a few promising properties. Match a property by canonical URL or site ID plus address; names and translated names alone can refer to different buildings. For sites needing a numeric city ID, use that site's search/suggestion command rather than guessing it.

## Match and price

Compare the **same room offer**: room category, occupancy, bed configuration, breakfast/meal plan, refundable deadline, prepayment/pay-at-property terms, and any package or member-only condition. A cheaper nonrefundable room is a separate option from a refundable room.

Use the total for the entire stay, including taxes, service/resort fees, and mandatory local charges. Booking.com's `price_amount` is a per-stay listing price. Agoda supplies `priceUnit` and `taxesIncluded`; a nightly or pre-tax quote is not a payable stay total. Other sites may show a starting room price until a room is selected. Open the selected offer or checkout summary before ranking prices when the listing does not expose the final total.
