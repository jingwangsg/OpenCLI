# WhatsApp Desktop (macOS)

OpenCLI controls the signed-in native WhatsApp Mac app through macOS Accessibility. It does not use WhatsApp Web. The terminal running OpenCLI needs Accessibility permission in macOS System Settings. Control selection and buttons use AX actions, without screen-coordinate clicks.

## Chats and messages

```bash
opencli whatsapp status -f json
opencli whatsapp chats --limit 20 -f json
opencli whatsapp read --limit 30 -f json
opencli whatsapp read --phone 6588004444 --limit 30 -f json
opencli whatsapp open 6588004444 -f json
opencli whatsapp search 'Alex' -f json
```

`status` distinguishes a running app from a loaded chat list (`chat_list_present`) and reports when a native file picker is open. `chats` reads the visible chat list, including each row's `selected` state. `read` reads messages currently loaded in the app, rather than the entire history. `open` and `read --phone` select a chat in the desktop app. `search` returns chat and contact matches from the desktop search panel; it checks that the query reached the search field and did not alter the chat draft.

## Send

```bash
opencli whatsapp send 6588004444 'Hello' -f json
opencli whatsapp draft 6588004444 'Hello' -f json
opencli whatsapp send-chat 'Family group' 'Hello everyone' -f json
opencli whatsapp draft-chat 'Family group' 'Hello everyone' -f json
opencli whatsapp send-image 6588004444 /absolute/path/photo.jpg -f json
opencli whatsapp send-file 6588004444 /absolute/path/document.pdf -f json
opencli whatsapp send-current 'Family group' 'Hello everyone' -f json
opencli whatsapp draft-current 'Family group' 'Hello everyone' -f json
opencli whatsapp clear-draft 'Family group' -f json
opencli whatsapp clear-chat 'Family group' -f json
```

Phone numbers include the country code and contain digits only. `send` opens the phone chat through the WhatsApp URL scheme without activating the app, checks the prefilled text, presses Send through Accessibility, and checks the outgoing message. `send-chat` selects one visible chat by exact name and sends in the same command; it also works for groups. `send-current` checks the exact already-open chat name. For a selected phone chat, these commands use the same background URL route; group chats and chats without a verified phone need foreground text input. `send-chat` and `send-current` stop if a different draft exists. `send-image` and `send-file` require an empty composer, check the recipient in the attachment preview, and verify the outgoing attachment. Their attachment entry can require the foreground app.

`draft`, `draft-chat`, and `draft-current` follow the matching send routes but leave the verified text in the composer without pressing Send. They reject a different existing draft. Use `clear-draft` to remove the text later. `draft-chat` and `draft-current` also work for groups.

`clear-chat` uses the exact current chat name and the app's **Clear all messages** action. It rejects an unsent draft and verifies that no messages remain in the loaded chat. An empty chat may disappear from the chat list but can be reopened.

To delete one message, copy its exact `description` from `read`:

```bash
opencli whatsapp read --limit 30 -f json
opencli whatsapp delete-message 'You' '<exact description from read>' -f json
opencli whatsapp delete-message 'Friend' '<exact outgoing description from read>' --everyone -f json
```

Without `--everyone`, this chooses **Delete for me**. With `--everyone`, it chooses **Delete for everyone** only if WhatsApp offers that button; it never falls back to local deletion. The command requires one exact message match in the named current chat and verifies that only that message was selected before deleting.

If a command reports that Send was pressed but verification failed, inspect the chat before retrying. A retry could duplicate a message.

Commands check the expected Accessibility state immediately, then poll for it with a bounded deadline. They do not use fixed pauses before checking. File sends have a longer outer deadline so the native picker and delivery checks can report a specific outcome before OpenCLI stops the process.

## Other desktop controls

```bash
opencli whatsapp inspect -f json
opencli whatsapp tree --limit 200 -f json
opencli whatsapp press 'New Chat' -f json
opencli whatsapp click 'New Chat' -f json
opencli whatsapp set 'Compose message' 'Draft text' -f json
opencli whatsapp set-focused '/absolute/path/to/file' -f json
opencli whatsapp key escape -f json
```

`inspect` lists interactive controls. `tree` also shows labels, titles, and available Accessibility actions. `press` and `click` activate a control through Accessibility without moving the pointer. Both accept an exact label or title and `--nth 0` when several controls share it. `set` writes and checks a labeled text field; `set-focused` works with an unlabeled focused field such as a native file picker. `key` dispatches Return, Escape, Tab, Backspace, arrow keys, Cmd+F, Cmd+N, and Cmd+Shift+G. Text entry, keyboard shortcuts, search, image paste, and the file picker's Go to Folder shortcut may temporarily activate WhatsApp because the app does not expose a writable AX value for every field. Native system dialogs may ignore `key`; `send-file` handles the file picker directly. These controls expose desktop workflows such as groups, calls, updates, and chat settings as the app's Accessibility tree permits. Inspect the current tree before acting because labels and available controls change with the screen.

`press`, `click`, and `key` confirm only that an action was dispatched. Read the next `status`, `tree`, or `chats` result to confirm the intended screen change.

## Batch chat cleanup

`delete-chats` defaults to a read-only preview. Supply the exact visible chat numbers to remove and one number to keep:

```bash
opencli whatsapp status -f json
opencli whatsapp chats --limit 100 -f json
opencli whatsapp delete-chats '<phone1>,<phone2>' --keep '<kept-phone>' -f json
opencli whatsapp delete-chats '<phone1>,<phone2>' --keep '<kept-phone>' --execute -f json
```

The command rejects duplicate or ambiguous phone matches and a missing kept chat. For one target, `--execute` opens that row's Accessibility **More** action, checks the exact chat name in the deletion confirmation, and verifies that only the target row disappeared. For multiple targets, it checks the selected set and the `Delete N chats` action before deleting. If it reports an uncertain outcome after the final action, inspect `chats` before retrying. The command only operates on rows currently loaded in the Chats list; it does not silently search archived or unloaded chats.

Voice recordings, message reactions, and call flows require the desktop controls above and have not been given dedicated commands.

WhatsApp's [Mac desktop help](https://faq.whatsapp.com/5472030609512325/?cms_platform=mac-desktop&helpref=platform_switcher) says contacts cannot yet be added or edited in the Mac app. This adapter cannot change contact names or notes there.
