# Blocking dialogs

## Inspect before retrying

At the first unexplained stall or ineffective action, take and inspect a screenshot. If browser screenshots also block, use an authorized desktop screenshot or a user-provided screenshot. Repeated DOM reads cannot resolve a dialog that blocks JavaScript execution.

Identify the dialog before acting:

| Visible UI | How to handle it |
|---|---|
| Webpage modal or validation message | Inspect its live DOM controls and use structured browser commands. |
| JavaScript alert, confirm, prompt, or before-unload confirmation | Prefer `browser <session> dialog accept` or `dismiss`, after checking the exact action being confirmed. |
| Native file picker or browser chrome UI | Use an authorized native UI workflow, with the correct process and window identified first. |
| Optional browser autofill prompt, such as “Save address?” | Keep it separate from the website's Save confirmation. Use Not now/Close when appropriate; a task to fill a form does not authorize saving its contents to a browser account. |

A screenshot showing a dialog is evidence of the UI state. A later `no_javascript_dialog` response is not evidence that the earlier screenshot was wrong: the command may have reached the handler only after the dialog was closed.

## Locate the actual browser instance

On macOS, multiple running instances can share the name “Microsoft Edge”. AppleScript `tell application "Microsoft Edge"`, `activate`, or `front window` can address a different instance from the OpenCLI profile. A verified profile/session does not identify the target of a separate native UI tool.

Inspect the matching process's PID, window titles, and dialog button labels. Require a unique task window/process. Raise the **dialog window**, then confirm that the intended dialog is foreground; raising the main browser window can leave the confirmation behind an autofill popover. Discover PIDs and positions live rather than storing them as permanent mappings.

The chat app can regain focus between tool calls. Keep process activation, dialog raise, foreground verification, and the intended key/click in **one native-control call**. For nested sheets, target the active sheet, such as Go to Folder, rather than the underlying picker. Verify the active sheet disappears after confirmation; an AX success response alone is insufficient.

## Native UI fallback

If the structured dialog command cannot handle a dialog confirmed by screenshot, inspect the native controls within the verified task process. Respect the native tool's access restrictions and existing task authorization; handling a blocker does not authorize another action.

An AppleScript/AX click or Return key can report success without dismissing the UI. Verify the dialog disappears before continuing. Resolve focus and the active sheet in one call before switching input mechanisms. In an earlier macOS workflow, a native CGEvent mouse down/up pair posted to `.cghidEventTap` worked after AX activation and `postToPid` had no visible effect; a later file-picker workflow completed with AX path assignment and Return after atomic foreground activation. Use CGEvent fallback only when the correctly focused AX action is confirmed ineffective, with authorized native control and fresh coordinates. AX positions are logical screen coordinates; screenshot pixels may have a different scale.

For native file selection, read [uploads.md](uploads.md) before typing paths or selecting a batch.

Do not loop clicks blindly or accept every confirmation. For “Leave site?”, check the pending navigation and whether edited data has been saved. When that is uncertain, Cancel preserves the current form. Signing, payment, final submission, and other consequential confirmations retain their own authorization boundary.

## Verify each result

Treat these as separate observations:

1. The input/click command completed.
2. The blocking dialog disappeared.
3. The expected page loaded in the same intended tab/profile.
4. The intended record ID and saved values were read back.

After a dialog is closed, await any yielded execution until it completes. Refresh the state before using refs. A wait for a selector already present, or a hidden control, does not prove a transition; check visibility and the expected page/record.

If the destination is `about:blank` or an unexpected page, stop dependent writes and inspect session/tab ownership and pending navigation. In the observed workflow, accepting Leave exposed an unexpected blank destination; the exact source of that navigation was not established. Recover and reread the saved record instead of assuming the requested operation completed.

## Webpage clicks that do not activate the control

Inspect `click_method`, `hit`, validation messages, disabled state, and the resulting page before retrying. `clicked: true` reports dispatch, not a completed website action.

For a confirmed ineffective native click, `browser click <target> --method js` uses the same target resolution and dispatches a DOM click. It does not reproduce every mouse/focus event. If the site uses an `onfocus` handler before Save/Next, use structured `focus <target>` first. Respect disabled controls and do not use DOM clicks to bypass a site's unavailable actions.

Keep website writes in structured OpenCLI commands. Do not replace this workflow with mutating `eval`, private request replay, or broader CDP permissions.
