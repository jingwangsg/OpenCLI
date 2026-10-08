# Saved forms and draft exports

Use these procedures with the existing `browser` commands. Keep the site's actual field names and record IDs in task-local evidence, not in this skill.

## Keep the intended record

- Bind the existing authenticated task tab and use the same explicit profile and session throughout. After login, continue in that tab. An expired owned-tab lease can create a new blank tab while the user's authenticated tab remains open.
- Before a write, check the current URL and the site's record/application identifier. A correct profile alone does not identify the record. If the tab or record changes unexpectedly, inspect and rebind rather than replaying writes on a replacement tab.
- Do not pin an old target ID in a script after binding a tab. Let the named binding resolve its target. Finish with `unbind` to preserve the user's tab.

## Inspect once, then fill

- Take one fresh `state` per page transition. For follow-up fields, use a narrow `find --label`, `--role`, or `--css` query and inspect visible matches. Learn selectors from the live page; do not guess a field ID from a label.
- Selects can make `state` and `find` large. Keep only the relevant control's ID/ref, label, visibility, and selected value in the working output; inspect its option list only when choosing a new option. Do not print full page HTML or hidden form/session tokens while diagnosing a field.
- Use `fill` for exact text replacement and require `filled: true` and `verified: true`. This confirms the current control value only. Use `check` for a desired radio/checkbox state and `select` for native selects. Resolve autocomplete choices when using `type`.
- Await every dependent command. A yielded execution is still running. Do not read a screenshot/export path or issue the next action until the execution completes.

## Save and reopen

1. Check the edited control value and the intended record ID.
2. Inspect the actual Save/Next action and click it once within the user's authorization.
3. Wait for a relevant new control, result message, or review value, then take a fresh snapshot. Waiting for a selector/text already present before the click does not prove a transition.
4. Reopen the saved record or its review page and read the changed value. Require the same record ID and the expected value before reporting persistence.

Some forms save partially completed sections without marking them complete. For a task to finish the online form, also run its authorized Next/Continue validation and check section completion marks and the availability of the next workflow stage. A saved-value readback alone does not prove that the website considers the section complete. If a workflow tab is disabled, inspect the unfinished sections; do not force-click the disabled tab.

`filled/verified`, `clicked`, a staged attachment, a saved draft, and a submitted/approved record are different observations. Saving a draft does not authorize a later signature, payment, or final submission.

If a click reports success without the expected result, inspect the current URL, controls, validation messages, `click_method`, and `hit`. If a command stalls or its result contradicts the visible UI, take and inspect a screenshot before another retry. Overlays, native dialogs, session-expiry notices, and failed image loads can be immediately visible even when DOM reads are blocked. Do not wait repeatedly for a guessed selector. For an ordinary navigation link, its href observed on the current page may be opened directly after checking for unsaved data and required handlers; do not replay a POST or bypass a Save/Submit handler.

After a timeout or connection error, inspect the same tab before retrying a mutation. An unsuccessful CLI observation does not prove the site did nothing. If DOM reads also hang, inspect a screenshot for a blocking JavaScript/before-unload dialog or a session-expiry notice before issuing more DOM commands. Use the structured `dialog` command only after identifying what is being accepted or dismissed; recover an expired application in the same tab and verify its record ID again. A bridge transport failure belongs in connection/profile diagnosis; creating another login session does not establish recovery.

## Export the saved draft

For confirmed browser dialogs or native UI blockers, read [blocking-dialogs.md](blocking-dialogs.md).

- Prefer the site's own download/print action. Use `wait download` with the expected filename or URL pattern, then validate the actual local file type and page count; a PDF viewer DOM is not the document.
- If the site only exposes Review pages, a read-only DOM extraction followed by local rendering can create a review copy. Label it as a saved webpage snapshot and state whether it is unsubmitted; do not describe it as an official confirmation or native application export.
- For multiple pages, enumerate the expected sections and capture each once with the same record ID. Stop at the review boundary. Never advance through signature/submission merely to complete an export.
- Keep credentials, retrieval answers, cookies, and hidden form tokens out of delivered artifacts and repository fixtures. If raw HTML is needed temporarily, use a private task folder and remove it after verifying the sanitized artifact.
- Render to a fresh output path. Require the expected section/field coverage, inspect the rendered pages, and only then replace the working copy. A renderer timeout and an older file already at the destination are not proof of a new export.
- When copying to cloud storage, verify the copied bytes or hash and update the existing tracker with the verified saved values and remaining issues. A copied placeholder does not supersede a verified source fact.
