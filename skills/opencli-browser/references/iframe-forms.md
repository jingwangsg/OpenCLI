# Iframe forms and compact inspection

## Same-origin frames

Discover the iframe once, then scope subsequent inspection and clicks to it:

```bash
opencli --profile work browser booking find --css 'iframe'
opencli --profile work browser booking find --frame '#reservations' --css 'tr[data-row-id="123"] a' --limit 5
opencli --profile work browser booking click --frame '#reservations' 'tr[data-row-id="123"] a.edit'
opencli --profile work browser booking get text --frame '#reservations' 'tr[data-row-id="123"]'
```

Replace the selectors with ones observed on the current page. `--frame` selects exactly one same-origin iframe. Missing, ambiguous, inaccessible, or non-iframe matches fail explicitly. Repeat the same frame selector when acting on numeric refs returned by scoped `find`; omitting it returns `frame_mismatch`. Native clicks account for the iframe position and border.

Supported commands are `find`, `click`, and `get text/value/attributes`; `eval --frame <index>` retains its separate cross-origin index syntax. Use `find --frame ... --css 'input, select, button, [role=option]'` for a compact control inventory. Use a row selector for reservation or record verification instead of repeatedly dumping the full page.

Keep embedded forms in their parent page unless their standalone route has been verified. Many pages initialize from parent state; opening the iframe URL in a new tab can produce empty controls or an empty record list even while the original frame is authenticated.

## Hidden notices and custom time pickers

`find` returns `visible` for every match, including hidden templates. A message found in HTML or a hidden DOM node does not establish a live restriction. Check visibility and the actual control's disabled/readonly state before deciding an operation is unavailable.

For a custom time picker, inspect its dropdown button and the resulting options. If keyboard entry is blocked, choose the displayed option:

```bash
opencli --profile work browser booking click --frame '#editor' '#start-picker button'
opencli --profile work browser booking find --frame '#editor' --role option --name '12:30'
# Click the returned ref with the same --frame, then verify the value.
opencli --profile work browser booking get value --frame '#editor' '#start-time'
```

Do not continue a long Tab sequence or repeatedly try typing after the field rejects input. Scoped discovery should reveal the actual button or option. A successful click proves event dispatch; a saved record must still be read after submission.

## Reusable automation boundary

Use the general frame commands for one-off forms. When the same site workflow repeats, a site adapter can own its verified record selector, date/time format, confirmation step, and saved-record check. Keep account/profile selection explicit and pass dates, record IDs, and times as inputs. A script should stop on a changed form, an ambiguous record, or an uncertain write result; reread the record before retrying a submission.
