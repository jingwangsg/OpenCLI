import AppKit
import ApplicationServices

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success
        ? value as AnyObject? : nil
}

func string(_ element: AXUIElement, _ name: String) -> String {
    (attribute(element, name) as? String) ?? ""
}

func children(_ element: AXUIElement) -> [AXUIElement] {
    (attribute(element, kAXChildrenAttribute as String) as? [AXUIElement]) ?? []
}

func parent(_ element: AXUIElement) -> AXUIElement? {
    guard let value = attribute(element, kAXParentAttribute as String) else { return nil }
    return (value as! AXUIElement)
}

func actions(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyActionNames(element, &names) == .success else { return [] }
    return names as? [String] ?? []
}

func descendants(_ root: AXUIElement, limit: Int = 1200) -> [AXUIElement] {
    var result: [AXUIElement] = []
    var queue = [root]
    while !queue.isEmpty && result.count < limit {
        let element = queue.removeFirst()
        result.append(element)
        queue.append(contentsOf: children(element))
    }
    return result
}

func poll<T>(seconds: TimeInterval, _ probe: () -> T?) -> T? {
    let deadline = ProcessInfo.processInfo.systemUptime + seconds
    while true {
        if let value = probe() { return value }
        let remaining = deadline - ProcessInfo.processInfo.systemUptime
        if remaining <= 0 { return nil }
        RunLoop.current.run(until: Date().addingTimeInterval(min(0.05, remaining)))
    }
}

func clean(_ text: String) -> String {
    text.unicodeScalars.filter { ![0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069].contains($0.value) }
        .map(String.init).joined().trimmingCharacters(in: .whitespacesAndNewlines)
}

func digits(_ text: String) -> String {
    String(text.filter(\.isNumber))
}

func phoneFromChatFields(_ rawLabel: String, _ rawSummary: String) -> String? {
    let label = clean(rawLabel).replacingOccurrences(
        of: #",\s*\d+\s+unread messages?$"#, with: "", options: .regularExpression)
    let labelDigits = digits(label)
    if label.hasPrefix("+"), (8...15).contains(labelDigits.count) { return labelDigits }

    let summary = clean(rawSummary)
    for marker in ["Sent to +", "Received from +"] {
        guard let range = summary.range(of: marker, options: .backwards) else { continue }
        let tail = summary[range.upperBound...]
        let number = digits(String(tail.prefix {
            $0.isNumber || $0.isWhitespace || ["+", ",", "-", "(", ")"].contains(String($0))
        }))
        if (8...15).contains(number.count) { return number }
    }
    return nil
}

func phoneFromChatRow(_ row: AXUIElement) -> String? {
    phoneFromChatFields(string(row, kAXDescriptionAttribute as String),
                        string(row, kAXValueAttribute as String))
}

func chatRows(_ window: AXUIElement) -> [AXUIElement]? {
    guard let list = descendants(window).first(where: {
        clean(string($0, kAXDescriptionAttribute as String)) == "List of chats"
    }) else { return nil }
    return children(list).filter {
        ["AXButton", "AXStaticText"].contains(string($0, kAXRoleAttribute as String)) &&
        !string($0, kAXValueAttribute as String).isEmpty
    }
}

func isSelected(_ row: AXUIElement) -> Bool {
    (attribute(row, kAXSelectedAttribute as String) as? Bool) ?? false
}

func isChatMultiSelectMode(_ window: AXUIElement) -> Bool {
    guard let list = descendants(window).first(where: {
        clean(string($0, kAXDescriptionAttribute as String)) == "List of chats"
    }) else { return false }
    return descendants(list).contains {
        string($0, kAXRoleAttribute as String) == "AXButton" &&
        clean(string($0, kAXDescriptionAttribute as String)) == "Delete"
    }
}

func emit(_ object: Any) {
    guard JSONSerialization.isValidJSONObject(object),
          let data = try? JSONSerialization.data(withJSONObject: object),
          let output = String(data: data, encoding: .utf8) else {
        fail("Could not encode WhatsApp result")
    }
    print(output)
}

func fail(_ message: String) -> Never {
    fputs("\(message)\n", stderr)
    exit(1)
}

func appWindow(_ app: NSRunningApplication) -> AXUIElement {
    guard let window = openWindow(app) else { fail("no open window") }
    return window
}

func openWindow(_ app: NSRunningApplication) -> AXUIElement? {
    let application = AXUIElementCreateApplication(app.processIdentifier)
    return (attribute(application, kAXWindowsAttribute as String) as? [AXUIElement])?.first
}

func selectedChat(_ window: AXUIElement) -> (String, AXUIElement)? {
    for element in descendants(window) {
        let description = clean(string(element, kAXDescriptionAttribute as String))
        if description.hasPrefix("Messages in chat with ") {
            return (String(description.dropFirst("Messages in chat with ".count)), element)
        }
    }
    return nil
}

func isSelfChat(_ window: AXUIElement, chat: String, phone: String) -> Bool {
    guard chat == "You" else { return false }
    return descendants(window).contains {
        let label = clean(string($0, kAXDescriptionAttribute as String))
        return string($0, kAXRoleAttribute as String) == "AXButton" &&
            label.hasPrefix("+") && digits(label) == phone
    }
}

func openRowMenu(_ app: NSRunningApplication, row: AXUIElement, chat: String) -> AXUIElement {
    let moreActions = actions(row).filter { clean($0).hasPrefix("Name:More") }
    guard moreActions.count == 1,
          AXUIElementPerformAction(row, moreActions[0] as CFString) == .success else {
        fail("could not open the chat row menu")
    }
    guard let menu = poll(seconds: 2, { () -> AXUIElement? in
        let window = appWindow(app)
        let elements = descendants(window)
        guard elements.contains(where: {
            string($0, kAXRoleAttribute as String) == "AXHeading" &&
                clean(string($0, kAXDescriptionAttribute as String)) == chat
        }), elements.contains(where: {
            string($0, kAXRoleAttribute as String) == "AXButton" &&
                clean(string($0, kAXDescriptionAttribute as String)) == "Clear chat"
        }) else { return nil }
        return window
    }) else { fail("chat row menu did not open for the expected chat") }
    return menu
}

func chatMessages(_ group: AXUIElement) -> [String] {
    let messageTypes = ["message", "photo", "document", "video", "audio", "sticker"]
    return descendants(group).compactMap { element -> String? in
        guard string(element, kAXRoleAttribute as String) == "AXStaticText" else { return nil }
        let description = clean(string(element, kAXDescriptionAttribute as String))
        return messageTypes.contains(where: {
            description.lowercased().hasPrefix("\($0), ") ||
                description.lowercased().hasPrefix("your \($0), ")
        }) ? description : nil
    }
}

func selectedMessageDeleteButton(_ window: AXUIElement, description: String) -> AXUIElement? {
    let elements = descendants(window)
    let selected = elements.filter {
        string($0, kAXRoleAttribute as String) == "AXStaticText" &&
            clean(string($0, kAXValueAttribute as String)) == "Selected"
    }
    guard selected.count == 1,
          clean(string(selected[0], kAXDescriptionAttribute as String)) == description else { return nil }
    let buttons = elements.filter {
        string($0, kAXRoleAttribute as String) == "AXButton" &&
            clean(string($0, kAXDescriptionAttribute as String)) == "Delete"
    }
    return buttons.count == 1 ? buttons[0] : nil
}

func deleteMessageOption(_ window: AXUIElement, name: String) -> AXUIElement? {
    let elements = descendants(window)
    guard elements.contains(where: {
        string($0, kAXRoleAttribute as String) == "AXHeading" &&
            clean(string($0, kAXDescriptionAttribute as String)) == "Delete message?"
    }) else { return nil }
    let buttons = elements.filter {
        string($0, kAXRoleAttribute as String) == "AXButton" &&
            clean(string($0, kAXDescriptionAttribute as String)) == name
    }
    return buttons.count == 1 ? buttons[0] : nil
}

func composer(_ window: AXUIElement) -> AXUIElement? {
    descendants(window).first {
        string($0, kAXRoleAttribute as String) == "AXTextArea" &&
        clean(string($0, kAXDescriptionAttribute as String)) == "Compose message"
    }
}

func outgoingDescriptions(_ group: AXUIElement, prefix: String) -> [String] {
    descendants(group).map { clean(string($0, kAXDescriptionAttribute as String)) }
        .filter { $0.hasPrefix(prefix) }
}

func hasNewOutgoing(_ before: [String], _ after: [String]) -> Bool {
    let previous = Set(before)
    return after.count > before.count || after.contains { !previous.contains($0) }
}

func openChat(_ app: NSRunningApplication, phone: String, text: String? = nil) -> AXUIElement {
    guard phone.count >= 8 && phone.count <= 15 && digits(phone) == phone else {
        fail("phone must contain 8–15 digits with country code")
    }
    let previousWindow = openWindow(app)
    let previousChat = previousWindow.flatMap { selectedChat($0)?.0 }
    if text == nil, let previousWindow, let previousChat {
        let selectedRow = chatRows(previousWindow)?.first(where: {
            isSelected($0) && phoneFromChatRow($0) == phone &&
                (clean(string($0, kAXDescriptionAttribute as String)) == previousChat || previousChat == "You")
        })
        if digits(previousChat) == phone || selectedRow != nil ||
           isSelfChat(previousWindow, chat: previousChat, phone: phone) {
            return previousWindow
        }
    }
    var url = URLComponents()
    url.scheme = "whatsapp"
    url.host = "send"
    url.queryItems = [URLQueryItem(name: "phone", value: phone)]
    if let text { url.queryItems?.append(URLQueryItem(name: "text", value: text)) }
    guard let target = url.url else { fail("could not open chat for \(phone)") }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = false
    NSWorkspace.shared.open(target, configuration: configuration)
    guard let verified = poll(seconds: 6, { () -> AXUIElement? in
        guard let window = openWindow(app), let input = composer(window) else { return nil }
        if let text, string(input, kAXValueAttribute as String) != text { return nil }
        if let (chat, _) = selectedChat(window) {
            let headerPhone = digits(chat)
            let matchingRow = (chatRows(window) ?? []).contains {
                let description = clean(string($0, kAXDescriptionAttribute as String))
                return isSelected($0) && phoneFromChatRow($0) == phone &&
                    (description == chat || chat == "You")
            }
            let newPrefilledChat = text != nil && chat != previousChat &&
                string(input, kAXValueAttribute as String) == text
            if headerPhone == phone || matchingRow || newPrefilledChat ||
               isSelfChat(window, chat: chat, phone: phone) {
                return window
            }
        }
        return nil
    }) else { fail("could not verify chat for \(phone); no message was sent") }
    return verified
}

func postKey(_ code: CGKeyCode, to pid: pid_t, command: Bool = false, shift: Bool = false) {
    let source = CGEventSource(stateID: .hidSystemState)
    var flags: CGEventFlags = []
    if command { flags.insert(.maskCommand) }
    if shift { flags.insert(.maskShift) }
    if command {
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: 55, keyDown: true) else {
            fail("could not create Command key event")
        }
        down.flags = flags
        down.postToPid(pid)
    }
    if shift {
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: 56, keyDown: true) else {
            fail("could not create Shift key event")
        }
        down.flags = flags
        down.postToPid(pid)
    }
    for down in [true, false] {
        guard let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else {
            fail("could not create keyboard event")
        }
        event.flags = flags
        event.postToPid(pid)
    }
    if shift {
        guard let up = CGEvent(keyboardEventSource: source, virtualKey: 56, keyDown: false) else {
            fail("could not release Shift key")
        }
        if command { up.flags = .maskCommand }
        up.postToPid(pid)
    }
    if command {
        guard let up = CGEvent(keyboardEventSource: source, virtualKey: 55, keyDown: false) else {
            fail("could not release Command key")
        }
        up.postToPid(pid)
    }
}

func paste(_ item: NSPasteboardWriting, to pid: pid_t, replace: Bool = false,
           focus: () -> Bool, until observed: () -> Bool) -> Bool {
    let previousApp = NSWorkspace.shared.frontmostApplication
    if previousApp?.processIdentifier != pid {
        let launcher = Process()
        launcher.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        launcher.arguments = ["-a", "WhatsApp"]
        do { try launcher.run(); launcher.waitUntilExit() } catch { fail("could not activate WhatsApp") }
        guard launcher.terminationStatus == 0 else { fail("could not activate WhatsApp") }
        guard poll(seconds: 1, {
            NSWorkspace.shared.frontmostApplication?.processIdentifier == pid ? true : nil
        }) != nil else { fail("WhatsApp did not become active") }
    }
    defer { if previousApp?.processIdentifier != pid { previousApp?.activate() } }
    guard focus() else { return false }
    if replace, let value = item as? NSString, value.length == 0 {
        postKey(0, to: pid, command: true)
        postKey(51, to: pid)
        return poll(seconds: 4, { observed() ? true : nil }) != nil
    }
    let pasteboard = NSPasteboard.general
    let saved = (pasteboard.pasteboardItems ?? []).map { item -> NSPasteboardItem in
        let copy = NSPasteboardItem()
        for type in item.types {
            if let data = item.data(forType: type) { copy.setData(data, forType: type) }
        }
        return copy
    }
    defer {
        pasteboard.clearContents()
        if !saved.isEmpty { pasteboard.writeObjects(saved) }
    }
    pasteboard.clearContents()
    guard pasteboard.writeObjects([item]) else { fail("could not place item on clipboard") }
    if replace { postKey(0, to: pid, command: true) }
    postKey(9, to: pid, command: true)
    return poll(seconds: 4, { observed() ? true : nil }) != nil
}

func submitMessage(_ app: NSRunningApplication, text: String, expectedChat: String? = nil) -> String {
    var window = appWindow(app)
    if let expectedChat, selectedChat(window)?.0 != expectedChat {
        fail("chat changed before Send; no message was sent")
    }
    let outgoing = "Your message, \(text), "
    let before = selectedChat(window).map { outgoingDescriptions($0.1, prefix: outgoing) } ?? []
    let buttons = descendants(window).filter {
        string($0, kAXRoleAttribute as String) == "AXButton" &&
        clean(string($0, kAXDescriptionAttribute as String)) == "Send"
    }
    guard buttons.count == 1 else { fail("send button is ambiguous; message remains a draft") }
    guard AXUIElementPerformAction(buttons[0], kAXPressAction as CFString) == .success else {
        fail("could not press Send; message remains a draft")
    }
    guard let chat = poll(seconds: 3, { () -> String? in
        window = appWindow(app)
        if let (chat, group) = selectedChat(window),
           (expectedChat == nil || chat == expectedChat),
           hasNewOutgoing(before, outgoingDescriptions(group, prefix: outgoing)) {
            return chat
        }
        return nil
    }) else { fail("Send was pressed, but delivery could not be verified; do not retry blindly") }
    return chat
}

func prepareCurrentMessage(_ app: NSRunningApplication, chat: String, text: String) {
    var window = appWindow(app)
    guard !text.isEmpty, selectedChat(window)?.0 == chat else {
        fail("current chat does not match the expected chat; no message was sent")
    }
    guard let input = composer(window) else { fail("chat composer is unavailable") }
    let draft = string(input, kAXValueAttribute as String)
    guard draft.isEmpty || draft == text else {
        fail("chat has a different unsent draft; no message was sent")
    }
    let selectedRows = chatRows(window)?.filter(isSelected) ?? []
    if draft.isEmpty, selectedRows.count == 1,
       (clean(string(selectedRows[0], kAXDescriptionAttribute as String)).hasPrefix("+") ||
        chat == "You" ||
        clean(string(selectedRows[0], kAXValueAttribute as String)).contains("Sent to +")),
       let phone = phoneFromChatRow(selectedRows[0]) {
        window = openChat(app, phone: phone, text: text)
        guard selectedChat(window)?.0 == chat else {
            fail("chat changed while preparing message; no message was sent")
        }
    } else if draft.isEmpty {
        guard paste(text as NSString, to: app.processIdentifier, replace: true, focus: {
            AXUIElementPerformAction(input, kAXPressAction as CFString) == .success &&
                AXUIElementSetAttributeValue(input, kAXFocusedAttribute as CFString, true as CFTypeRef) == .success
        }, until: {
            let current = appWindow(app)
            return selectedChat(current)?.0 == chat &&
                composer(current).map({ string($0, kAXValueAttribute as String) }) == text &&
                descendants(current).contains {
                    string($0, kAXRoleAttribute as String) == "AXButton" &&
                    clean(string($0, kAXDescriptionAttribute as String)) == "Send"
                }
        }) else { fail("message draft did not become ready; no message was sent") }
    }
    window = appWindow(app)
    guard let updatedInput = composer(window),
          string(updatedInput, kAXValueAttribute as String) == text else {
        fail("could not paste and verify message draft; inspect the chat before retrying")
    }
}

func runAppleScript(_ lines: [String]) {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    process.arguments = lines.flatMap { ["-e", $0] }
    do { try process.run() } catch { fail("could not control native file picker") }
    if poll(seconds: 5, { !process.isRunning ? true : nil }) == nil {
        process.terminate()
        process.waitUntilExit()
        fail("native file picker did not respond")
    }
    guard process.terminationStatus == 0 else { fail("native file picker action failed") }
}

func parseChatDeletion(_ arguments: [String]) -> (targets: [String], keptPhone: String, execute: Bool) {
    guard arguments.count > 3 else { fail("missing target phones, kept phone, or execution mode") }
    let targets = arguments[1].split(separator: ",", omittingEmptySubsequences: false)
        .map { $0.trimmingCharacters(in: .whitespaces) }
    let keptPhone = arguments[2]
    guard !targets.isEmpty, Set(targets).count == targets.count,
          targets.allSatisfy({ (8...15).contains($0.count) && digits($0) == $0 }),
          (8...15).contains(keptPhone.count), digits(keptPhone) == keptPhone,
          !targets.contains(keptPhone), ["true", "false"].contains(arguments[3]) else {
        fail("use unique digit-only target phones and a different digit-only --keep phone")
    }
    return (targets, keptPhone, arguments[3] == "true")
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard let operation = arguments.first else { fail("missing operation") }
if operation == "_parse-chat-row" {
    guard arguments.count > 2 else { fail("missing chat row fields") }
    emit([["phone": phoneFromChatFields(arguments[1], arguments[2]) ?? ""]])
    exit(0)
}
// Validated before the app checks so bad input fails without launching WhatsApp.
let deletionRequest = operation == "delete-chats" ? parseChatDeletion(arguments) : nil
let running = NSRunningApplication.runningApplications(withBundleIdentifier: "net.whatsapp.WhatsApp").first
if operation == "status" {
    guard let app = running else {
        emit([["running": false, "window": "", "chat": "", "chat_list_present": false, "file_picker_open": false]])
        exit(0)
    }
    guard let window = openWindow(app) else {
        emit([["running": true, "window": "", "chat": "", "chat_list_present": false, "file_picker_open": false]])
        exit(0)
    }
    let elements = descendants(window)
    let chatListPresent = elements.contains {
        clean(string($0, kAXDescriptionAttribute as String)) == "List of chats"
    }
    let filePickerOpen = elements.contains {
        string($0, kAXRoleAttribute as String) == "AXSheet" &&
        clean(string($0, kAXDescriptionAttribute as String)) == "open"
    }
    emit([["running": true, "window": string(window, kAXTitleAttribute as String),
           "chat": selectedChat(window)?.0 ?? "", "chat_list_present": chatListPresent,
           "file_picker_open": filePickerOpen]])
    exit(0)
}
if operation == "reset" {
    guard let app = running, let window = openWindow(app) else {
        fail("no accessible WhatsApp window; check for an update dialog")
    }
    if let input = composer(window), !string(input, kAXValueAttribute as String).isEmpty {
        fail("chat has an unsent draft; clear it before resetting WhatsApp")
    }
    guard app.terminate(), poll(seconds: 10, { app.isTerminated ? true : nil }) != nil else {
        fail("WhatsApp did not quit")
    }
    let launcher = Process()
    launcher.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    launcher.arguments = ["-a", "WhatsApp"]
    do { try launcher.run(); launcher.waitUntilExit() } catch { fail("could not relaunch WhatsApp") }
    guard launcher.terminationStatus == 0 else { fail("could not relaunch WhatsApp") }
    let ready = { () -> [String: Any]? in
        guard let reopened = NSRunningApplication.runningApplications(withBundleIdentifier: "net.whatsapp.WhatsApp").first,
              let reopenedWindow = openWindow(reopened), chatRows(reopenedWindow) != nil,
              let search = descendants(reopenedWindow).first(where: {
                  string($0, kAXRoleAttribute as String) == "AXStaticText" &&
                  clean(string($0, kAXDescriptionAttribute as String)) == "Search"
              }), string(search, kAXValueAttribute as String).isEmpty else { return nil }
        return ["chat": selectedChat(reopenedWindow)?.0 ?? "", "search_cleared": true]
    }
    guard poll(seconds: 15, ready) != nil else {
        fail("WhatsApp reopened, but the chat list or cleared search was not verified")
    }
    // load-bearing: an update dialog can take over the window a few seconds after launch; re-verify after it would show.
    RunLoop.current.run(until: Date().addingTimeInterval(5))
    guard let state = ready() else { fail("WhatsApp restart did not remain usable; check for an update dialog") }
    emit([state])
    exit(0)
}
guard let app = running else { fail("desktop app is not running") }
if openWindow(app) == nil {
    let launcher = Process()
    launcher.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    launcher.arguments = ["-g", "-a", "WhatsApp"]
    do { try launcher.run(); launcher.waitUntilExit() } catch { fail("could not open WhatsApp window") }
    guard launcher.terminationStatus == 0 else { fail("could not open WhatsApp window") }
}
guard var window = poll(seconds: 3, { openWindow(app) }) else { fail("no open window") }

switch operation {
case "chats":
    let limit = Int(arguments.dropFirst().first ?? "20") ?? 20
    guard let chatList = chatRows(window) else { fail("chat list is unavailable") }
    let multiSelectMode = isChatMultiSelectMode(window)
    var rows: [[String: Any]] = []
    for element in chatList {
        let name = clean(string(element, kAXDescriptionAttribute as String))
        let summary = clean(string(element, kAXValueAttribute as String))
        rows.append(["chat": name, "phone": phoneFromChatRow(element) ?? "",
                     "summary": summary, "selected": multiSelectMode && isSelected(element)])
        if rows.count >= limit { break }
    }
    emit(rows)

case "read":
    if arguments.count > 1 && !arguments[1].isEmpty {
        window = openChat(app, phone: arguments[1])
    }
    guard let (chat, group) = selectedChat(window) else { fail("no chat selected") }
    let limit = Int(arguments.dropFirst(2).first ?? "30") ?? 30
    let messages = chatMessages(group).map { ["chat": chat, "description": $0] }
    emit(Array(messages.suffix(max(0, limit))))

case "search":
    guard arguments.count > 1, !arguments[1].isEmpty else { fail("missing search query") }
    let query = arguments[1]
    window = appWindow(app)
    guard let search = descendants(window).first(where: {
        string($0, kAXRoleAttribute as String) == "AXStaticText" &&
        clean(string($0, kAXDescriptionAttribute as String)) == "Search"
    }) else {
        fail("search field is unavailable")
    }

    let application = AXUIElementCreateApplication(app.processIdentifier)
    let draftBefore = composer(window).map { string($0, kAXValueAttribute as String) }
    guard paste(query as NSString, to: app.processIdentifier, replace: true, focus: {
        guard AXUIElementPerformAction(search, kAXPressAction as CFString) == .success,
              AXUIElementSetAttributeValue(search, kAXFocusedAttribute as CFString, true as CFTypeRef) == .success else {
            return false
        }
        return poll(seconds: 0.75, { () -> Bool? in
            guard let focused = attribute(application, kAXFocusedUIElementAttribute as String) else { return nil }
            let element = focused as! AXUIElement
            return clean(string(element, kAXDescriptionAttribute as String)) == "Search" ? true : nil
        }) != nil
    }, until: {
        let current = appWindow(app)
        return descendants(current).contains {
            string($0, kAXRoleAttribute as String) == "AXStaticText" &&
            clean(string($0, kAXDescriptionAttribute as String)) == "Search" &&
            string($0, kAXValueAttribute as String) == query
        } && composer(current).map({ string($0, kAXValueAttribute as String) }) == draftBefore
    }) else { fail("search query was not verified; inspect the current chat draft") }
    window = appWindow(app)
    let limit = Int(arguments.dropFirst(2).first ?? "30") ?? 30
    guard let results = descendants(window).first(where: {
        clean(string($0, kAXDescriptionAttribute as String)) == "Search results"
    }) else { fail("search results are unavailable") }
    let filters = Set(["Photos", "GIFs", "Links", "Videos", "Documents", "Audio", "Polls", "Events"])
    let rows = descendants(results).compactMap { element -> [String: String]? in
        guard string(element, kAXRoleAttribute as String) == "AXButton" else { return nil }
        let description = clean(string(element, kAXDescriptionAttribute as String))
        guard !description.isEmpty && !filters.contains(description) else { return nil }
        return ["description": description,
                "value": clean(string(element, kAXValueAttribute as String))]
    }
    emit(Array(rows.prefix(max(0, limit))))

case "open":
    guard arguments.count > 1 else { fail("missing phone") }
    window = openChat(app, phone: arguments[1])
    emit([["phone": arguments[1], "chat": selectedChat(window)?.0 ?? ""]])

case "send", "draft":
    guard arguments.count > 2 else { fail("missing phone or text") }
    let phone = arguments[1], text = arguments[2]
    guard !text.isEmpty else { fail("message is empty") }
    if operation == "draft" {
        window = openChat(app, phone: phone)
        guard let existing = composer(window).map({ string($0, kAXValueAttribute as String) }),
              existing.isEmpty || existing == text else {
            fail("chat has a different unsent draft; draft was not changed")
        }
        if existing == text {
            emit([["phone": phone, "chat": selectedChat(window)?.0 ?? "", "drafted": true, "text": text]])
            break
        }
    }
    window = openChat(app, phone: phone, text: text)
    guard let input = composer(window), string(input, kAXValueAttribute as String) == text else {
        fail("draft differs from requested text; no message was sent")
    }
    if operation == "draft" {
        emit([["phone": phone, "chat": selectedChat(window)?.0 ?? "", "drafted": true, "text": text]])
        break
    }
    let chat = submitMessage(app, text: text)
    emit([["phone": phone, "chat": chat, "sent": true, "text": text]])

case "send-current", "draft-current":
    guard arguments.count > 2 else { fail("missing expected chat or text") }
    let expectedChat = arguments[1], text = arguments[2]
    prepareCurrentMessage(app, chat: expectedChat, text: text)
    if operation == "draft-current" {
        emit([["chat": expectedChat, "drafted": true, "text": text]])
    } else {
        _ = submitMessage(app, text: text, expectedChat: expectedChat)
        emit([["chat": expectedChat, "sent": true, "text": text]])
    }

case "send-chat", "draft-chat":
    guard arguments.count > 2 else { fail("missing chat name or text") }
    let label = arguments[1], text = arguments[2]
    guard !isChatMultiSelectMode(window) else { fail("exit chat selection mode before sending") }
    guard let rows = chatRows(window) else { fail("chat list is unavailable") }
    let matches = rows.filter { clean(string($0, kAXDescriptionAttribute as String)) == label }
    guard matches.count == 1 else {
        fail("chat name does not match exactly one visible chat; no message was sent")
    }
    if !isSelected(matches[0]),
       AXUIElementPerformAction(matches[0], kAXPressAction as CFString) != .success {
        fail("could not open chat; no message was sent")
    }
    let openedChat = poll(seconds: 2) { () -> String? in
        window = appWindow(app)
        if let row = chatRows(window)?.first(where: {
            clean(string($0, kAXDescriptionAttribute as String)) == label
        }), isSelected(row) {
            return selectedChat(window)?.0
        }
        return nil
    }
    guard let openedChat else { fail("chat did not open; no message was sent") }
    prepareCurrentMessage(app, chat: openedChat, text: text)
    if operation == "draft-chat" {
        emit([["chat": openedChat, "drafted": true, "text": text]])
    } else {
        _ = submitMessage(app, text: text, expectedChat: openedChat)
        emit([["chat": openedChat, "sent": true, "text": text]])
    }

case "delete-message-select":
    guard arguments.count > 3, ["me", "everyone"].contains(arguments[3]),
          !arguments[2].isEmpty, let (chat, group) = selectedChat(window), chat == arguments[1] else {
        fail("use the exact current chat, message description, and deletion scope")
    }
    let description = arguments[2]
    guard arguments[3] == "me" || description.hasPrefix("Your ") else {
        fail("Delete for everyone requires an outgoing message")
    }
    let matches = descendants(group).filter {
        string($0, kAXRoleAttribute as String) == "AXStaticText" &&
            clean(string($0, kAXDescriptionAttribute as String)) == description
    }
    guard matches.count == 1 else { fail("message description is not unique in the current chat") }
    let before = chatMessages(group)
    let previousPid = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
    let appAX = AXUIElementCreateApplication(app.processIdentifier)
    if previousPid != app.processIdentifier {
        guard AXUIElementSetAttributeValue(appAX, kAXFrontmostAttribute as CFString, true as CFTypeRef) == .success,
              poll(seconds: 2, {
                  NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier ? true : nil
              }) != nil else { fail("WhatsApp did not become frontmost; no message was deleted") }
    }
    window = appWindow(app)
    guard let (activeChat, activeGroup) = selectedChat(window), activeChat == chat else {
        fail("chat changed before deletion; no message was deleted")
    }
    let targets = descendants(activeGroup).filter {
        string($0, kAXRoleAttribute as String) == "AXStaticText" &&
            clean(string($0, kAXDescriptionAttribute as String)) == description
    }
    guard targets.count == 1,
          AXUIElementPerformAction(targets[0], kAXShowMenuAction as CFString) == .success else {
        fail("could not open the target message menu; no message was deleted")
    }
    let menuItem = poll(seconds: 2) { () -> AXUIElement? in
        window = appWindow(app)
        let items = descendants(window).filter {
            string($0, kAXRoleAttribute as String) == "AXMenuItem" &&
                clean(string($0, kAXTitleAttribute as String)) == "Delete"
        }
        return items.count == 1 ? items[0] : nil
    }
    guard let menuItem,
          AXUIElementPerformAction(menuItem, kAXPressAction as CFString) == .success else {
        fail("Delete menu item was unavailable; no message was deleted")
    }
    guard poll(seconds: 2, { () -> AXUIElement? in
        window = appWindow(app)
        return selectedMessageDeleteButton(window, description: description)
    }) != nil else { fail("target was not the only selected message; no message was deleted") }
    emit([["before_count": before.count,
           "tombstones_before": before.filter { $0.contains("You deleted this message.") }.count,
           "previous_app_pid": previousPid]])

case "delete-message-confirm":
    guard arguments.count > 3, ["me", "everyone"].contains(arguments[3]),
          selectedChat(window)?.0 == arguments[1] else { fail("selected chat changed") }
    let description = arguments[2]
    guard let deleteButton = selectedMessageDeleteButton(window, description: description) else {
        fail("target is not the only selected message")
    }
    _ = AXUIElementPerformAction(deleteButton, kAXPressAction as CFString)
    let optionName = arguments[3] == "everyone" ? "Delete for everyone" : "Delete for me"
    if poll(seconds: 1.5, { () -> AXUIElement? in
        window = appWindow(app)
        return deleteMessageOption(window, name: optionName)
    }) != nil {
        emit([["ready": true]])
    } else {
        window = appWindow(app)
        if descendants(window).contains(where: {
            string($0, kAXRoleAttribute as String) == "AXHeading" &&
                clean(string($0, kAXDescriptionAttribute as String)) == "Delete message?"
        }) { fail("\(optionName) is unavailable; no other delete option was chosen") }
        guard selectedMessageDeleteButton(window, description: description) != nil else {
            fail("message selection changed before the delete options opened")
        }
        emit([["ready": false]])
    }

case "delete-message-finish":
    guard arguments.count > 6, ["me", "everyone"].contains(arguments[3]),
          let beforeCount = Int(arguments[4]), let tombstonesBefore = Int(arguments[5]),
          let previousPid = Int(arguments[6]) else { fail("missing delete verification state") }
    let chat = arguments[1], description = arguments[2], scope = arguments[3]
    let optionName = scope == "everyone" ? "Delete for everyone" : "Delete for me"
    guard let option = deleteMessageOption(window, name: optionName) else {
        fail("\(optionName) is unavailable; no other delete option was chosen")
    }
    _ = AXUIElementPerformAction(option, kAXPressAction as CFString)
    let deleted = poll(seconds: 2, { () -> Bool? in
        window = appWindow(app)
        guard let (currentChat, currentGroup) = selectedChat(window), currentChat == chat else { return nil }
        let after = chatMessages(currentGroup)
        guard !after.contains(description) else { return nil }
        if scope == "everyone" {
            return after.filter { $0.contains("You deleted this message.") }.count > tombstonesBefore ? true : nil
        }
        return after.count < beforeCount ? true : nil
    }) != nil
    if deleted {
        if previousPid > 0 && previousPid != app.processIdentifier {
            let previousAX = AXUIElementCreateApplication(pid_t(previousPid))
            _ = AXUIElementSetAttributeValue(previousAX, kAXFrontmostAttribute as CFString, true as CFTypeRef)
        }
        emit([["chat": chat, "description": description, "scope": scope, "deleted": true]])
    } else {
        window = appWindow(app)
        if deleteMessageOption(window, name: optionName) != nil {
            emit([["deleted": false, "state": "dialog"]])
        } else if selectedMessageDeleteButton(window, description: description) != nil {
            emit([["deleted": false, "state": "selected"]])
        } else {
            fail("\(optionName) was pressed, but the outcome could not be verified")
        }
    }

case "clear-chat":
    guard arguments.count > 1, let (chat, group) = selectedChat(window), chat == arguments[1] else {
        fail("current chat does not match the expected chat; no messages were cleared")
    }
    guard !isChatMultiSelectMode(window) else { fail("exit chat selection mode before clearing") }
    guard composer(window).map({ string($0, kAXValueAttribute as String).isEmpty }) == true else {
        fail("current chat has an unsent draft; clear it first")
    }
    if chatMessages(group).isEmpty {
        emit([["chat": chat, "cleared": true]])
        break
    }
    guard let selectedRows = chatRows(window)?.filter(isSelected), selectedRows.count == 1 else {
        fail("could not identify the selected chat row; no messages were cleared")
    }
    window = openRowMenu(app, row: selectedRows[0], chat: chat)
    let clearAllOption: () -> AXUIElement? = {
        window = appWindow(app)
        let elements = descendants(window)
        guard elements.contains(where: {
            string($0, kAXRoleAttribute as String) == "AXHeading" &&
                clean(string($0, kAXDescriptionAttribute as String)) == "Clear chat"
        }) else { return nil }
        let matches = elements.filter {
            string($0, kAXRoleAttribute as String) == "AXStaticText" &&
                clean(string($0, kAXDescriptionAttribute as String)).hasPrefix("Clear all messages")
        }
        return matches.count == 1 ? matches[0] : nil
    }
    var allMessages: AXUIElement?
    for _ in 0..<3 {
        if let option = clearAllOption() { allMessages = option; break }
        window = appWindow(app)
        let clearButtons = descendants(window).filter {
            string($0, kAXRoleAttribute as String) == "AXButton" &&
                clean(string($0, kAXDescriptionAttribute as String)) == "Clear chat"
        }
        guard clearButtons.count == 1 else { break }
        _ = AXUIElementPerformAction(clearButtons[0], kAXPressAction as CFString)
        allMessages = poll(seconds: 1.5, clearAllOption)
        if allMessages != nil { break }
    }
    guard let allMessages,
          AXUIElementPerformAction(allMessages, kAXPressAction as CFString) == .success else {
        fail("Clear all messages action was unavailable; no messages were cleared")
    }
    guard poll(seconds: 5, { () -> Bool? in
        window = appWindow(app)
        guard let (currentChat, currentGroup) = selectedChat(window), currentChat == chat else { return nil }
        return chatMessages(currentGroup).isEmpty ? true : nil
    }) != nil else { fail("Clear all messages was pressed, but the chat still shows messages") }
    emit([["chat": chat, "cleared": true]])

case "clear-draft":
    guard arguments.count > 1, let (chat, _) = selectedChat(window), chat == arguments[1] else {
        fail("current chat does not match the expected chat; draft was not changed")
    }
    guard let input = composer(window) else { fail("chat composer is unavailable") }
    if string(input, kAXValueAttribute as String).isEmpty {
        emit([["chat": chat, "cleared": true]])
        break
    }
    guard paste("" as NSString, to: app.processIdentifier, replace: true, focus: {
        AXUIElementPerformAction(input, kAXPressAction as CFString) == .success &&
            AXUIElementSetAttributeValue(input, kAXFocusedAttribute as CFString, true as CFTypeRef) == .success
    }, until: {
        let current = appWindow(app)
        return selectedChat(current)?.0 == chat &&
            composer(current).map({ string($0, kAXValueAttribute as String).isEmpty }) == true
    }) else { fail("draft did not clear") }
    emit([["chat": chat, "cleared": true]])

case "image":
    guard arguments.count > 2 else { fail("missing phone or image path") }
    let phone = arguments[1], path = arguments[2]
    guard let image = NSImage(contentsOfFile: path) else {
        fail("cannot read image at \(path)")
    }
    window = openChat(app, phone: phone)
    let expectedChat = selectedChat(window)?.0 ?? ""
    guard let input = composer(window), string(input, kAXValueAttribute as String).isEmpty else {
        fail("chat has an unsent draft; no image was sent")
    }
    let photosBefore = selectedChat(window).map { outgoingDescriptions($0.1, prefix: "Your photo, ") } ?? []
    guard paste(image, to: app.processIdentifier, focus: {
        AXUIElementPerformAction(input, kAXPressAction as CFString) == .success &&
            AXUIElementSetAttributeValue(input, kAXFocusedAttribute as CFString, true as CFTypeRef) == .success
    }, until: {
        let current = appWindow(app)
        return selectedChat(current) == nil && descendants(current).contains {
            string($0, kAXRoleAttribute as String) == "AXButton" &&
            clean(string($0, kAXDescriptionAttribute as String)) == "Send"
        }
    }) else { fail("image preview did not open; no image was sent") }

    let sendButton = poll(seconds: 3) { () -> AXUIElement? in
        window = appWindow(app)
        let elements = descendants(window)
        let hasRecipient = elements.contains {
            guard string($0, kAXRoleAttribute as String) == "AXButton" else { return false }
            let description = clean(string($0, kAXDescriptionAttribute as String))
            let value = string($0, kAXValueAttribute as String)
            return digits(description + value).contains(phone) ||
                   (!expectedChat.isEmpty && description == expectedChat)
        }
        let buttons = elements.filter {
            string($0, kAXRoleAttribute as String) == "AXButton" &&
            clean(string($0, kAXDescriptionAttribute as String)) == "Send"
        }
        if hasRecipient && buttons.count == 1 && selectedChat(window) == nil {
            return buttons[0]
        }
        return nil
    }
    guard let button = sendButton else { fail("could not verify image preview and recipient; no image was sent") }
    guard AXUIElementPerformAction(button, kAXPressAction as CFString) == .success else {
        fail("could not press image Send; no image was sent")
    }
    let sentPhoto = poll(seconds: 4) { () -> Bool? in
        window = appWindow(app)
        if let (_, group) = selectedChat(window) {
            if hasNewOutgoing(photosBefore, outgoingDescriptions(group, prefix: "Your photo, ")) {
                return true
            }
        }
        return nil
    } != nil
    guard sentPhoto else { fail("image Send was pressed, but delivery could not be verified; do not retry blindly") }
    emit([["phone": phone, "chat": selectedChat(window)?.0 ?? "", "sent": true, "path": path]])

case "file":
    guard arguments.count > 2 else { fail("missing phone or file path") }
    let phone = arguments[1], path = arguments[2]
    let previousApp = NSWorkspace.shared.frontmostApplication
    let filename = URL(fileURLWithPath: path).lastPathComponent
    guard path.hasPrefix("/"),
          let attributes = try? FileManager.default.attributesOfItem(atPath: path),
          attributes[.type] as? FileAttributeType == .typeRegular else {
        fail("file path must be an existing regular file with an absolute path")
    }
    window = openChat(app, phone: phone)
    let expectedChat = selectedChat(window)?.0 ?? ""
    guard let input = composer(window), string(input, kAXValueAttribute as String).isEmpty else {
        fail("chat has an unsent draft; no file was sent")
    }
    let documentPrefix = "Your document, \(filename), "
    let documentsBefore = selectedChat(window).map { outgoingDescriptions($0.1, prefix: documentPrefix) } ?? []
    let shareButtons = descendants(window).filter {
        string($0, kAXRoleAttribute as String) == "AXButton" &&
        clean(string($0, kAXDescriptionAttribute as String)) == "Share media"
    }
    guard shareButtons.count == 1,
          AXUIElementPerformAction(shareButtons[0], kAXPressAction as CFString) == .success else {
        fail("could not open attachment menu")
    }
    let fileButton = poll(seconds: 3) { () -> AXUIElement? in
        window = appWindow(app)
        return descendants(window).first {
            string($0, kAXRoleAttribute as String) == "AXButton" &&
            clean(string($0, kAXDescriptionAttribute as String)) == "File"
        }
    }
    guard fileButton != nil else { fail("attachment menu did not show File") }
    var pickerReady = false
    for _ in 0..<3 {
        window = appWindow(app)
        guard let button = descendants(window).first(where: {
            string($0, kAXRoleAttribute as String) == "AXButton" &&
            clean(string($0, kAXDescriptionAttribute as String)) == "File"
        }) else { break }
        _ = AXUIElementPerformAction(button, kAXPressAction as CFString)
        pickerReady = poll(seconds: 1.5) { () -> Bool? in
            window = appWindow(app)
            return descendants(window).contains(where: {
                string($0, kAXRoleAttribute as String) == "AXSheet" &&
                clean(string($0, kAXDescriptionAttribute as String)) == "open"
            }) ? true : nil
        } != nil
        if pickerReady { break }
    }
    guard pickerReady else { fail("file picker did not open") }

    runAppleScript([
        "tell application \"WhatsApp\" to activate",
        "tell application \"System Events\" to keystroke \"g\" using {command down, shift down}",
    ])
    let application = AXUIElementCreateApplication(app.processIdentifier)
    let pathField = poll(seconds: 3) { () -> AXUIElement? in
        if let focused = attribute(application, kAXFocusedUIElementAttribute as String) {
            let element = focused as! AXUIElement
            if string(element, kAXRoleAttribute as String) == "AXTextField" {
                return element
            }
        }
        return nil
    }
    guard let pathField else { fail("Go to Folder field is unavailable") }
    if string(pathField, kAXValueAttribute as String) != path {
        guard AXUIElementSetAttributeValue(pathField, kAXValueAttribute as CFString, path as CFTypeRef) == .success else {
            fail("could not enter file path")
        }
    }
    let pathVerified = poll(seconds: 1, {
        string(pathField, kAXValueAttribute as String) == path ? true : nil
    }) != nil
    guard pathVerified else { fail("file path did not appear in the picker") }
    runAppleScript([
        "tell application \"WhatsApp\" to activate",
        "tell application \"System Events\" to key code 36",
    ])

    let fileEntry = poll(seconds: 3) { () -> AXUIElement? in
        window = appWindow(app)
        return descendants(window, limit: 5000).first {
            string($0, kAXRoleAttribute as String) == "AXTextField" &&
            string($0, kAXValueAttribute as String) == filename
        }
    }
    guard let entry = fileEntry else { fail("file was not found in the picker") }
    // AXOpen can report failure after the picker has opened the file; verify the preview below.
    _ = AXUIElementPerformAction(entry, "AXOpen" as CFString)

    let sendButton = poll(seconds: 4) { () -> AXUIElement? in
        window = appWindow(app)
        let elements = descendants(window)
        let hasFile = elements.contains {
            clean(string($0, kAXDescriptionAttribute as String)) == filename
        }
        let hasRecipient = elements.contains {
            guard string($0, kAXRoleAttribute as String) == "AXButton" else { return false }
            let description = clean(string($0, kAXDescriptionAttribute as String))
            return digits(description).contains(phone) ||
                   (!expectedChat.isEmpty && description == expectedChat)
        }
        let buttons = elements.filter {
            string($0, kAXRoleAttribute as String) == "AXButton" &&
            clean(string($0, kAXDescriptionAttribute as String)) == "Send"
        }
        if hasFile && hasRecipient && buttons.count == 1 && selectedChat(window) == nil {
            return buttons[0]
        }
        return nil
    }
    guard let button = sendButton else { fail("could not verify file preview and recipient; no file was sent") }
    guard AXUIElementPerformAction(button, kAXPressAction as CFString) == .success else {
        fail("could not press file Send; no file was sent")
    }
    let sentFile = poll(seconds: 4) { () -> Bool? in
        window = appWindow(app)
        if let (_, group) = selectedChat(window) {
            if hasNewOutgoing(documentsBefore, outgoingDescriptions(group, prefix: documentPrefix)) {
                return true
            }
        }
        return nil
    } != nil
    guard sentFile else { fail("file Send was pressed, but delivery could not be verified; do not retry blindly") }
    if previousApp?.processIdentifier != app.processIdentifier { previousApp?.activate() }
    emit([["phone": phone, "chat": selectedChat(window)?.0 ?? "", "sent": true, "path": path]])

case "delete-chats":
    let (targets, keptPhone, execute) = deletionRequest!
    guard let initialRows = chatRows(window) else { fail("chat list is unavailable") }
    let keepMatches = initialRows.filter { phoneFromChatRow($0) == keptPhone }
    guard keepMatches.count == 1 else { fail("kept phone does not match exactly one visible chat") }
    let keptChat = clean(string(keepMatches[0], kAXDescriptionAttribute as String))
    var planned: [(phone: String, chat: String)] = []
    for phone in targets {
        let matches = initialRows.filter { phoneFromChatRow($0) == phone }
        guard matches.count == 1 else { fail("target \(phone) does not match exactly one visible chat") }
        planned.append((phone, clean(string(matches[0], kAXDescriptionAttribute as String))))
    }
    if !execute {
        emit(planned.map { ["phone": $0.phone, "chat": $0.chat,
                            "kept_phone": keptPhone, "kept_chat": keptChat,
                            "action": "preview"] })
        break
    }
    guard !isChatMultiSelectMode(window) else {
        fail("exit the existing chat-selection mode before executing")
    }
    if targets.count == 1 {
        let phone = targets[0]
        window = openChat(app, phone: phone)
        guard let targetChat = selectedChat(window)?.0,
              let selectedRows = chatRows(window)?.filter(isSelected),
              selectedRows.count == 1, phoneFromChatRow(selectedRows[0]) == phone else {
            fail("target chat was not selected; no chat was deleted")
        }
        window = openRowMenu(app, row: selectedRows[0], chat: targetChat)
        let deleteButtons = descendants(window).filter {
            string($0, kAXRoleAttribute as String) == "AXButton" &&
                clean(string($0, kAXDescriptionAttribute as String)) == "Delete chat"
        }
        guard deleteButtons.count == 1,
              AXUIElementPerformAction(deleteButtons[0], kAXPressAction as CFString) == .success else {
            fail("could not open Delete chat; no chat was deleted")
        }
        let confirmButton = poll(seconds: 2) { () -> AXUIElement? in
            window = appWindow(app)
            let elements = descendants(window)
            guard elements.contains(where: {
                string($0, kAXRoleAttribute as String) == "AXSheet" &&
                    clean(string($0, kAXDescriptionAttribute as String)) == "alert"
            }), elements.contains(where: {
                string($0, kAXRoleAttribute as String) == "AXStaticText" &&
                    clean(string($0, kAXValueAttribute as String)) == "Delete chat with \(targetChat)?"
            }) else { return nil }
            let matches = elements.filter {
                string($0, kAXRoleAttribute as String) == "AXButton" &&
                    clean(string($0, kAXTitleAttribute as String)) == "Delete chat"
            }
            return matches.count == 1 ? matches[0] : nil
        }
        guard let confirmButton,
              AXUIElementPerformAction(confirmButton, kAXPressAction as CFString) == .success else {
            fail("Delete chat confirmation changed; no chat was deleted")
        }
        guard poll(seconds: 5, { () -> Bool? in
            window = appWindow(app)
            guard let rows = chatRows(window) else { return nil }
            let remaining = rows.compactMap(phoneFromChatRow)
            return remaining.contains(keptPhone) && !remaining.contains(phone) ? true : nil
        }) != nil else { fail("Delete chat was pressed, but removal could not be verified") }
        emit(planned.map { ["phone": $0.phone, "chat": $0.chat,
                            "kept_phone": keptPhone, "kept_chat": keptChat,
                            "action": "deleted"] })
        break
    }
    let moreButtons = descendants(window).filter {
        string($0, kAXRoleAttribute as String) == "AXButton" &&
        clean(string($0, kAXDescriptionAttribute as String)) == "More"
    }
    guard let sidebarMore = moreButtons.first,
          AXUIElementPerformAction(sidebarMore, kAXPressAction as CFString) == .success else {
        fail("could not open the Chats menu; no chat was deleted")
    }
    let selectChatsItem = poll(seconds: 2) { () -> AXUIElement? in
        window = appWindow(app)
        return descendants(window).first {
            string($0, kAXRoleAttribute as String) == "AXMenuItem" &&
            clean(string($0, kAXTitleAttribute as String)) == "Select chats"
        }
    }
    guard let selectChatsItem,
          AXUIElementPerformAction(selectChatsItem, kAXPressAction as CFString) == .success else {
        fail("could not enter chat selection mode; no chat was deleted")
    }
    let selectionReady = poll(seconds: 2) { () -> Bool? in
        window = appWindow(app)
        return isChatMultiSelectMode(window) ? true : nil
    } != nil
    guard selectionReady else { fail("chat selection mode was not verified; no chat was deleted") }
    for phone in targets {
        window = appWindow(app)
        guard let rows = chatRows(window) else {
            fail("chat list disappeared; no delete was triggered; selection may remain")
        }
        let matches = rows.filter { phoneFromChatRow($0) == phone }
        guard matches.count == 1, !isSelected(matches[0]),
              AXUIElementPerformAction(matches[0], kAXPressAction as CFString) == .success else {
            fail("could not select \(phone); no delete was triggered; selection may remain")
        }
        let confirmed = poll(seconds: 1) { () -> Bool? in
            window = appWindow(app)
            if let rows = chatRows(window),
               let row = rows.first(where: { phoneFromChatRow($0) == phone }), isSelected(row) {
                return true
            }
            return nil
        } != nil
        guard confirmed else {
            fail("selection of \(phone) was not verified; no delete was triggered; selection may remain")
        }
    }
    window = appWindow(app)
    // load-bearing: count catches selected rows whose phone cannot be read.
    guard let selectedRows = chatRows(window)?.filter(isSelected),
          selectedRows.count == targets.count,
          Set(selectedRows.compactMap(phoneFromChatRow)) == Set(targets) else {
        fail("selected chats differ from targets; no delete was triggered; selection may remain")
    }
    let deleteButtons = descendants(window).filter {
        string($0, kAXRoleAttribute as String) == "AXButton" &&
        clean(string($0, kAXDescriptionAttribute as String)) == "Delete"
    }
    guard deleteButtons.count == 1,
          AXUIElementPerformAction(deleteButtons[0], kAXPressAction as CFString) == .success else {
        fail("could not open delete action; no delete was triggered; selection may remain")
    }
    let expectedAction = targets.count == 1 ? "Delete 1 chat" : "Delete \(targets.count) chats"
    let finalButton = poll(seconds: 2) { () -> AXUIElement? in
        window = appWindow(app)
        return descendants(window).first {
            string($0, kAXRoleAttribute as String) == "AXButton" &&
            clean(string($0, kAXDescriptionAttribute as String)) == expectedAction
        }
    }
    // load-bearing: the menu can change the selection before the final delete action.
    guard let finalButton,
          let beforeFinal = chatRows(window)?.filter(isSelected),
          beforeFinal.count == targets.count,
          Set(beforeFinal.compactMap(phoneFromChatRow)) == Set(targets) else {
        fail("delete confirmation or selected set changed; no delete was triggered; selection may remain")
    }
    _ = AXUIElementPerformAction(finalButton, kAXPressAction as CFString)
    let deletionVerified = poll(seconds: 5) { () -> Bool? in
        window = appWindow(app)
        guard let rows = chatRows(window) else { return nil }
        let remaining = rows.compactMap(phoneFromChatRow)
        if remaining.contains(keptPhone) && targets.allSatisfy({ !remaining.contains($0) }) {
            return true
        }
        return nil
    } != nil
    guard deletionVerified else {
        fail("delete was requested but could not be verified; inspect chats before retrying")
    }
    emit(planned.map { ["phone": $0.phone, "chat": $0.chat,
                        "kept_phone": keptPhone, "kept_chat": keptChat,
                        "action": "deleted"] })

case "inspect":
    let limit = min(300, max(1, Int(arguments.dropFirst().first ?? "80") ?? 80))
    let controls = descendants(window).enumerated().compactMap { index, element -> [String: Any]? in
        let role = string(element, kAXRoleAttribute as String)
        guard ["AXButton", "AXTextArea", "AXTextField", "AXCheckbox", "AXMenuItem", "AXPopUpButton"].contains(role) else { return nil }
        return ["index": index, "role": role,
                "description": clean(string(element, kAXDescriptionAttribute as String)),
                "title": clean(string(element, kAXTitleAttribute as String)),
                "value": String(clean(string(element, kAXValueAttribute as String)).prefix(300))]
    }
    emit(Array(controls.prefix(limit)))

case "tree":
    let limit = min(500, max(1, Int(arguments.dropFirst().first ?? "150") ?? 150))
    let nodes = descendants(window).enumerated().compactMap { index, element -> [String: Any]? in
        let role = string(element, kAXRoleAttribute as String)
        let description = clean(string(element, kAXDescriptionAttribute as String))
        let title = clean(string(element, kAXTitleAttribute as String))
        let value = clean(string(element, kAXValueAttribute as String))
        guard !description.isEmpty || !title.isEmpty || !value.isEmpty else { return nil }
        return ["index": index, "role": role, "description": description, "title": title,
                "value": String(value.prefix(300)), "actions": actions(element).joined(separator: ",")]
    }
    emit(Array(nodes.prefix(limit)))

case "click", "press", "set":
    guard arguments.count > 1 else { fail("missing accessibility label") }
    let label = arguments[1]
    let elements = descendants(window).filter {
        clean(string($0, kAXDescriptionAttribute as String)) == label ||
        clean(string($0, kAXTitleAttribute as String)) == label
    }
    let buttons = elements.filter {
        ["AXButton", "AXMenuItem", "AXCheckbox", "AXPopUpButton"].contains(string($0, kAXRoleAttribute as String))
    }
    let matches = operation != "set"
        ? (!buttons.isEmpty ? buttons : elements.filter {
            ["AXStaticText", "AXHeading"].contains(string($0, kAXRoleAttribute as String))
        })
        : elements.filter { ["AXTextArea", "AXTextField"].contains(string($0, kAXRoleAttribute as String)) }
    let choice = operation != "set"
        ? (arguments.count > 2 ? Int(arguments[2]) : nil)
        : (arguments.count > 3 ? Int(arguments[3]) : nil)
    guard let index = choice ?? (matches.count == 1 ? 0 : nil), matches.indices.contains(index) else {
        fail("expected one control labeled '\(label)', found \(matches.count); pass --nth for duplicates")
    }
    let element = matches[index]
    if operation != "set" {
        var target = element
        for _ in 0..<5 {
            if actions(target).contains(kAXPressAction as String) { break }
            guard let next = parent(target) else { break }
            target = next
        }
        guard AXUIElementPerformAction(target, kAXPressAction as CFString) == .success else {
            fail("could not press '\(label)'")
        }
        emit([[operation == "click" ? "clicked" : "pressed": label, "nth": index]])
    } else {
        guard arguments.count > 2 else { fail("missing value") }
        let value = arguments[2]
        guard paste(value as NSString, to: app.processIdentifier, replace: true, focus: {
            AXUIElementPerformAction(element, kAXPressAction as CFString) == .success &&
                AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, true as CFTypeRef) == .success
        },
                    until: { string(element, kAXValueAttribute as String) == value }) else {
            fail("could not set and verify '\(label)'")
        }
        emit([["control": label, "value": value]])
    }

case "set-focused":
    guard arguments.count > 1 else { fail("missing value") }
    let application = AXUIElementCreateApplication(app.processIdentifier)
    guard let focused = attribute(application, kAXFocusedUIElementAttribute as String) else {
        fail("no focused input")
    }
    let input = focused as! AXUIElement
    let role = string(input, kAXRoleAttribute as String)
    guard role == "AXTextField" || role == "AXTextArea" else {
        fail("focused element is not a text input")
    }
    guard paste(arguments[1] as NSString, to: app.processIdentifier, replace: true,
                focus: { AXUIElementSetAttributeValue(input, kAXFocusedAttribute as CFString, true as CFTypeRef) == .success },
                until: { string(input, kAXValueAttribute as String) == arguments[1] }) else {
        fail("focused input did not accept the value")
    }
    emit([["role": role, "value": arguments[1]]])

case "key":
    guard arguments.count > 1 else { fail("missing key") }
    let keys: [String: CGKeyCode] = ["return": 36, "escape": 53, "tab": 48,
                                     "backspace": 51, "up": 126, "down": 125,
                                     "left": 123, "right": 124, "f": 3, "n": 45, "g": 5]
    let requested = arguments[1].lowercased()
    let parts = requested.split(separator: "+").map(String.init)
    let key = parts.last ?? ""
    let command = parts.contains("cmd"), shift = parts.contains("shift")
    guard let code = keys[key],
          (parts.count == 1 || parts.count == 2 && command && ["f", "n"].contains(key) ||
           parts.count == 3 && command && shift && key == "g") else { fail("unsupported key") }
    let previousApp = NSWorkspace.shared.frontmostApplication
    let launcher = Process()
    launcher.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    launcher.arguments = ["-a", "WhatsApp"]
    do { try launcher.run(); launcher.waitUntilExit() } catch { fail("could not activate WhatsApp") }
    guard launcher.terminationStatus == 0 else { fail("could not activate WhatsApp") }
    guard poll(seconds: 1, { app.isActive ? true : nil }) != nil else {
        fail("WhatsApp did not become active")
    }
    postKey(code, to: app.processIdentifier, command: command, shift: shift)
    if previousApp?.processIdentifier != app.processIdentifier { previousApp?.activate() }
    emit([["key": requested]])

default:
    fail("unknown operation '\(operation)'")
}
