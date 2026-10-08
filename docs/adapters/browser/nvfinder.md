# NVIDIA Finder

`nvfinder` is the NVIDIA Indoor Finders namespace. Its `flexdesk` command manages
your own FlexSpace reservations at Singapore Suntec, floor 7. Dates and times
use Singapore time; `today` is resolved in `Asia/Singapore`.

```bash
opencli --profile prisma nvfinder flexdesk list --date today
opencli --profile prisma nvfinder flexdesk create --date 2026-11-03 --desk SIN-07-A207 --start 14:00 --end 18:00
opencli --profile prisma nvfinder flexdesk update --date today --start 14:00
opencli --profile prisma nvfinder flexdesk cancel --date today --id 123456
opencli --profile prisma nvfinder flexdesk replace --date today --desk SIN-07-A207
```

Use an already signed-in Browser Bridge profile. The adapter verifies the
NVIDIA account and location before proceeding. `list` returns matching upcoming
reservations. `create` requires a desk, start, and end. `update` changes only the
supplied start, end, or notes. `cancel` and `replace` require exactly one matching
reservation; use `--id` when the date is ambiguous. `replace` preserves the
original times and notes unless overridden. Times must be available in the
site's time picker; unsupported times fail rather than being rounded.

Write actions submit the site's own confirmation once, then independently read
the reservation list to verify the record, date, desk, times, and notes. Repeating
an identical create or update returns `unchanged` without submitting again.
Network failures, malformed responses, and uncertain writes fail instead of
returning an empty list or automatically resubmitting.

The site disallows overlapping reservations and has no atomic desk replacement.
`replace` validates the destination form before cancelling the source. If the
destination booking receives an explicit rejection, it attempts to restore the
source and reports the resulting reservation ID. A failed restoration or an
uncertain write is reported as an error; replacement cannot guarantee that the
released desk remains available. It does not bypass overlap or booking policies.
Reservations with additional booked services cannot be replaced automatically,
because those services cannot be safely copied to a different desk. Ordinary
time updates leave the site's existing service selections intact.

## Verified implementation boundary

Strategy: `PAGE_FETCH` for reads, `UI_SELECTOR` for writes. Reads use an internal
endpoint; writes follow the visible reservation workflow.

The visible **My Reservations** action loads all upcoming records through
`MyRegistrationListDataGet.ashx`; its response includes reservation IDs,
location IDs, dates, times, desks, and notes. The UI stores the complete response
before applying pagination or saved filters. A same-origin POST with
`UTCOffset=480` and no JSONP callback returns ordinary JSON; this read contract
was checked against two visible reservations and two offset inputs. The adapter
uses that read rather than the displayed grid because the site's error handler
renders an empty grid on request failure, and early draining of the current
Browser Bridge capture queue can lose unfinished responses. The request stays
in the authenticated browser, checks HTTP/auth/JSON failures, and reads the
complete response. Cookies remain in the browser; there is no Node-side
credential export or replay of private write endpoints.

Writes use the calendar's Edit/Cancel actions and the map's desk search/Reserve
form, preserving parent-frame initialization. Availability is checked for the
requested time range before selecting a desk. Time options use explicit DOM
clicks because Prisma native clicks were observed to dispatch without changing
the selected time. New and replacement flows are covered by synthetic browser
fixtures; live verification reads existing reservations without creating or
cancelling bookings for testing. An identical live update was also checked and
returned `unchanged` without submitting a write.
