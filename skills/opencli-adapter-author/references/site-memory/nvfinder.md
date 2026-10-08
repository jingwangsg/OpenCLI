# NVIDIA Indoor Finders

Use `opencli --profile prisma nvfinder flexdesk <action>` for Singapore Suntec
floor 7 reservations: `list`, `create`, `update`, `cancel`, and `replace`.
See [the adapter documentation](../../../../docs/adapters/browser/nvfinder.md)
for flags and replacement semantics.

Verified on 2026-10-08:

- Entry: `https://nvidia.indoorfinders.com/UserSite/Finders.aspx`, **Book a Desk**.
- Singapore Suntec floor 7: location ID `478`; Book a Desk module ID `16`.
- The parent VisualRegistration page accepts `LocID` and `SelectedDate=M/D/YYYY`.
- The read-only `MyRegistrationListDataGet.ashx` POST accepts `UTCOffset=480`.
  With no callback parameter it returns JSON, including every upcoming record
  before grid pagination and saved filters. The grid itself turns request
  failures into an empty list, so a visible empty grid is not proof of no data.
- Calendar Edit and Cancel controls bind exact reservation IDs. Cancel opens
  its confirmation in the parent document. Using the calendar avoids table
  pagination and nested My Reservations editor frames.
- Desk creation: calendar time range -> Check Availability -> map search ->
  Reserve -> form values -> Confirm Reservation -> final confirmation ->
  independent reservation-list read. Keep reservation forms in their parent;
  standalone navigation can leave them uninitialized.
- Prisma native option clicks can dispatch without changing the time. Use
  explicit DOM clicks and verify the selected value.
- Read and validate the existing source before a write. Preserve omitted end
  and notes. Replacement is cancel then create, with destination preflight;
  overlapping reservations are forbidden. Restore only after an explicit
  business rejection, and never replay an uncertain write.
- Additional booked services are preserved by time updates. Automatic desk
  replacement refuses such reservations before cancelling them.

Tests use synthetic browser pages and records; no live credentials or private
responses are stored in fixtures.
