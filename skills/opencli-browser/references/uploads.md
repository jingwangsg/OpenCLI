# Uploads and native file pickers

## Choose the upload control

Inspect the current account, destination folder or attachment section, and the live upload control. For each file input, check its visibility, enclosing label, `accept`, and `multiple`. Use absolute paths to existing local files.

Start with `browser upload <ref> <absolute-path...>` when the site's file input supports it. If it reports `Page.fileChooserOpened not received` or another chooser-interception error, inspect a screenshot and the native picker before retrying. The chooser may already be open, or the hidden input may not trigger it. If no picker is open, use the observed visible Upload/Add files button and its menu item through structured OpenCLI commands. Do not repeatedly target the same hidden input or replay a private upload API.

Before a batch, record its intended destination, exact filenames, and local byte sizes. An isolated staging directory containing exactly the intended batch makes Select All reviewable. Keep staging files outside unrelated project work.

## Control a macOS picker

Read [blocking-dialogs.md](blocking-dialogs.md) to identify the actual browser PID, unique task window, and current native sheets. Use authorized native control; process names, PIDs, titles, sheet hierarchies, and coordinates must come from the current UI.

1. In one native-control call, activate the verified process, raise the current picker, and open Go to Folder with Cmd+Shift+G if it is not already open.
2. Locate the nested Go to Folder sheet's path field. Prefer AX `set value` to entering a long path character by character: `keystroke` can lose the beginning of a path. Read the field back and require an exact match. If the control cannot accept AX assignment, use an authorized paste operation and restore any changed clipboard.
3. In that same call, reactivate the verified process, raise the nested Go to Folder sheet, check that the process is foreground, and press Return once. Splitting activation and Return across tool calls allows the chat app to take focus. Verify the nested sheet closes and the picker shows the expected directory and file.
4. Verify the selected file or batch, then activate the verified process and click the enabled Open button in one call. Wait for the native picker to disappear before returning to webpage actions.

For a batch, navigate to a **specific intended file inside the staging directory**, rather than only to the directory. In macOS column view, directory-only navigation can leave the parent column focused. Before Cmd+A, focus an item in the **rightmost file list**, check that the list contains the expected number and names of files, then select all. Otherwise Cmd+A can select the parent directory's contents. Inspect the actual selection visually when AX `selected` values are unavailable; an enabled Open button alone does not prove the correct selection.

Do not dump the entire accessibility tree of a large picker. Inspect the task window's sheets and the relevant path field, file list, and Open button. Prefer a single observed click or keypress; a double-click may close one sheet and hit the underlying picker with its second click.

Keep website writes in structured OpenCLI commands. Native controls here only handle the browser's picker; they do not replace form submission or bypass a site's disabled actions.

## Wait for transfers, then verify persistence

A picker selection starts the upload; it does not prove the site saved the file. Inspect the site's transfer queue or progress indicator. An empty or partial file list while transfers remain active is a pending observation, not a reason to upload again.

Keep the same tab and session alive until the batch finishes. Do not reload, navigate away, or close the tab while transfers are active; that can interrupt the batch. For human-paced workflows, use the session lifecycle guidance in `SKILL.md`. If a command yields an execution ID, await completion before taking the next dependent action.

After the queue finishes:

1. Read the intended folder or attachment section and compare every filename and size with the local batch manifest. Use pagination when needed; viewport rows alone may omit saved files.
2. For sites that save uploads immediately, reopen the same destination and confirm the files remain listed under the correct account. When only rounded KB/MB sizes are exposed, compare the site's displayed unit and rounding with the local bytes. A display-size match is not a server checksum comparison.
3. For a form that stages attachments, fill any required workflow fields and submit once within the user's authorization. Reopen the saved record and check its formal attachment list, record ID, final status, and audit trail. A staging list or generic Saved banner does not establish submission.
4. Save a compact upload record with destination or record ID, filenames, sizes, account, and verification time. Record any missing or failed items; retry only those after inspecting the failure.

Distinguish **selected**, **transferring**, **persisted**, **submitted**, and **recipient acknowledged**. Persisted files in a shared folder do not prove the recipient has reviewed or accepted them. Do not report a signed document, completed application, or recipient receipt from upload success alone.
