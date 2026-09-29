import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError, ConfigError } from '@jackwener/opencli/errors';

const nativeScript = fileURLToPath(new URL('./native.swift', import.meta.url));

function runNative(operation, args = []) {
  if (process.platform !== 'darwin') {
    throw new ConfigError('WhatsApp Desktop integration requires macOS');
  }
  try {
    const output = execFileSync('swift', [nativeScript, operation, ...args.map(String)], {
      encoding: 'utf8',
      // swift recompiles native.swift on every call (~2s idle, up to ~15s under load); each tier is that
      // plus the operation's worst-case AX poll budget (file ~40s, delete-chats ~15s + 1s per target,
      // everything else <= ~21s for image) plus margin, so a slow compile cannot time out a delivered send.
      timeout: operation === 'file' ? 120_000 : operation === 'delete-chats' ? 90_000 : 60_000,
    });
    return JSON.parse(output);
  } catch (error) {
    const detail = error.code === 'ETIMEDOUT'
      ? 'timed out; outcome is unknown, so inspect WhatsApp before retrying'
      : error.stderr?.trim() || (error instanceof SyntaxError ? 'invalid native response' : 'native command failed');
    throw new CommandExecutionError(`WhatsApp ${operation} failed: ${detail}`);
  }
}

const common = {
  site: 'whatsapp',
  strategy: Strategy.LOCAL,
  domain: 'localhost',
};

cli({
  ...common,
  name: 'status',
  access: 'read',
  description: 'Show app, chat-list, and file-picker state without changing the desktop UI',
  args: [],
  columns: ['running', 'window', 'chat', 'chat_list_present', 'file_picker_open'],
  func: async () => runNative('status'),
});

cli({
  ...common,
  name: 'chats',
  access: 'read',
  description: 'List visible WhatsApp chats, latest summaries, and selection state',
  args: [{ name: 'limit', required: false, default: 20, help: 'Maximum number of visible chats' }],
  columns: ['chat', 'phone', 'summary', 'selected'],
  func: async ({ limit }) => runNative('chats', [limit]),
});

cli({
  ...common,
  name: 'read',
  access: 'read',
  description: 'Read recent visible messages from the current chat or a phone-number chat',
  args: [
    { name: 'phone', required: false, help: 'Phone number with country code; omit for current chat' },
    { name: 'limit', required: false, default: 30, help: 'Maximum number of visible messages' },
  ],
  columns: ['chat', 'description'],
  func: async ({ phone, limit }) => runNative('read', [phone ?? '', limit]),
});

cli({
  ...common,
  name: 'search',
  access: 'read',
  description: 'Search WhatsApp desktop chats and contacts without changing the open chat draft',
  args: [
    { name: 'query', positional: true, required: true, help: 'Chat or contact text to search for' },
    { name: 'limit', required: false, default: 30, help: 'Maximum number of visible results' },
  ],
  columns: ['description', 'value'],
  func: async ({ query, limit }) => runNative('search', [query, limit]),
});

cli({
  ...common,
  name: 'open',
  access: 'read',
  description: 'Open a WhatsApp desktop chat by phone number',
  args: [{ name: 'phone', positional: true, required: true, help: 'Phone number with country code, digits only' }],
  columns: ['phone', 'chat'],
  func: async ({ phone }) => runNative('open', [phone]),
});

cli({
  ...common,
  name: 'send',
  access: 'write',
  description: 'Send text to an exact phone-number chat and verify the sent message',
  args: [
    { name: 'phone', positional: true, required: true, help: 'Recipient phone number with country code, digits only' },
    { name: 'text', positional: true, required: true, help: 'Message text to send' },
  ],
  columns: ['phone', 'chat', 'sent', 'text'],
  func: async ({ phone, text }) => runNative('send', [phone, text]),
});

cli({
  ...common,
  name: 'draft',
  access: 'write',
  description: 'Fill an unsent text draft in an exact phone-number chat',
  args: [
    { name: 'phone', positional: true, required: true, help: 'Recipient phone number with country code, digits only' },
    { name: 'text', positional: true, required: true, help: 'Text to leave in the composer without sending' },
  ],
  columns: ['phone', 'chat', 'drafted', 'text'],
  func: async ({ phone, text }) => runNative('draft', [phone, text]),
});

cli({
  ...common,
  name: 'send-image',
  access: 'write',
  description: 'Send a local image to an exact phone-number chat and verify the sent photo',
  args: [
    { name: 'phone', positional: true, required: true, help: 'Recipient phone number with country code, digits only' },
    { name: 'path', positional: true, required: true, help: 'Absolute path to a local image' },
  ],
  columns: ['phone', 'chat', 'sent', 'path'],
  func: async ({ phone, path }) => runNative('image', [phone, path]),
});

cli({
  ...common,
  name: 'send-file',
  access: 'write',
  description: 'Send a local document through the native file picker and verify it in the chat',
  args: [
    { name: 'phone', positional: true, required: true, help: 'Recipient phone number with country code, digits only' },
    { name: 'path', positional: true, required: true, help: 'Absolute path to a local file' },
  ],
  columns: ['phone', 'chat', 'sent', 'path'],
  func: async ({ phone, path }) => runNative('file', [phone, path]),
});

cli({
  ...common,
  name: 'send-current',
  access: 'write',
  description: 'Send text to the currently open chat, including groups, after checking its exact name',
  args: [
    { name: 'chat', positional: true, required: true, help: 'Exact current chat name returned by status' },
    { name: 'text', positional: true, required: true, help: 'Message text to send' },
  ],
  columns: ['chat', 'sent', 'text'],
  func: async ({ chat, text }) => runNative('send-current', [chat, text]),
});

cli({
  ...common,
  name: 'draft-current',
  access: 'write',
  description: 'Leave unsent text in the currently open chat after checking its exact name',
  args: [
    { name: 'chat', positional: true, required: true, help: 'Exact current chat name returned by status' },
    { name: 'text', positional: true, required: true, help: 'Text to leave in the composer without sending' },
  ],
  columns: ['chat', 'drafted', 'text'],
  func: async ({ chat, text }) => runNative('draft-current', [chat, text]),
});

cli({
  ...common,
  name: 'send-chat',
  access: 'write',
  description: 'Send text to one visible chat by exact name in a single command',
  args: [
    { name: 'chat', positional: true, required: true, help: 'Exact name of a visible chat' },
    { name: 'text', positional: true, required: true, help: 'Message text to send' },
  ],
  columns: ['chat', 'sent', 'text'],
  func: async ({ chat, text }) => runNative('send-chat', [chat, text]),
});

cli({
  ...common,
  name: 'draft-chat',
  access: 'write',
  description: 'Leave unsent text in one visible chat selected by exact name',
  args: [
    { name: 'chat', positional: true, required: true, help: 'Exact name of a visible chat' },
    { name: 'text', positional: true, required: true, help: 'Text to leave in the composer without sending' },
  ],
  columns: ['chat', 'drafted', 'text'],
  func: async ({ chat, text }) => runNative('draft-chat', [chat, text]),
});

cli({
  ...common,
  name: 'clear-draft',
  access: 'write',
  description: 'Clear the composer only when the open chat name matches exactly',
  args: [{ name: 'chat', positional: true, required: true, help: 'Exact current chat name returned by status' }],
  columns: ['chat', 'cleared'],
  func: async ({ chat }) => runNative('clear-draft', [chat]),
});

cli({
  ...common,
  name: 'clear-chat',
  access: 'write',
  description: 'Clear all messages from the exact current chat through Accessibility while keeping the chat',
  args: [{ name: 'chat', positional: true, required: true, help: 'Exact current chat name returned by status' }],
  columns: ['chat', 'cleared'],
  func: async ({ chat }) => runNative('clear-chat', [chat]),
});

cli({
  ...common,
  name: 'delete-message',
  access: 'write',
  description: 'Delete one exact message from the current chat for me, or for everyone when offered',
  args: [
    { name: 'chat', positional: true, required: true, help: 'Exact current chat name returned by status' },
    { name: 'description', positional: true, required: true, help: 'Exact message description returned by read' },
    { name: 'everyone', type: 'boolean', required: false, default: false, help: 'Choose Delete for everyone instead of Delete for me' },
  ],
  columns: ['chat', 'scope', 'deleted', 'description'],
  func: async ({ chat, description, everyone }) => {
    const scope = everyone ? 'everyone' : 'me';
    const [selection] = runNative('delete-message-select', [chat, description, scope]);
    let state = 'selected';
    for (let attempt = 0; attempt < 6; attempt++) {
      if (state === 'selected') {
        const [confirmation] = runNative('delete-message-confirm', [chat, description, scope]);
        state = confirmation.ready ? 'dialog' : 'selected';
      } else {
        const [result] = runNative('delete-message-finish', [
          chat, description, scope, selection.before_count, selection.tombstones_before, selection.previous_app_pid,
        ]);
        if (result.deleted) return [result];
        state = result.state;
      }
    }
    throw new CommandExecutionError('WhatsApp delete-message could not complete; inspect the chat before retrying');
  },
});

cli({
  ...common,
  name: 'delete-chats',
  access: 'write',
  description: 'Preview exact phone-number chat deletion; delete only with --execute after verifying a kept chat',
  args: [
    { name: 'phones', positional: true, required: true, help: 'Comma-separated target phone numbers with country codes, digits only' },
    { name: 'keep', required: true, help: 'Phone number of a visible chat that must remain' },
    { name: 'execute', type: 'boolean', required: false, default: false, help: 'Perform the deletion after exact selection checks' },
  ],
  columns: ['phone', 'chat', 'kept_phone', 'kept_chat', 'action'],
  func: async ({ phones, keep, execute }) => runNative('delete-chats', [phones, keep, execute ? 'true' : 'false']),
});

cli({
  ...common,
  name: 'inspect',
  access: 'read',
  description: 'List accessible controls in the current WhatsApp desktop window',
  args: [{ name: 'limit', required: false, default: 80, help: 'Maximum number of controls' }],
  columns: ['index', 'role', 'description', 'title', 'value'],
  func: async ({ limit }) => runNative('inspect', [limit]),
});

cli({
  ...common,
  name: 'tree',
  access: 'read',
  description: 'Inspect labeled accessibility elements and available actions in WhatsApp desktop',
  args: [{ name: 'limit', required: false, default: 150, help: 'Maximum number of labeled elements' }],
  columns: ['index', 'role', 'description', 'title', 'value', 'actions'],
  func: async ({ limit }) => runNative('tree', [limit]),
});

cli({
  ...common,
  name: 'press',
  access: 'write',
  description: 'Press a uniquely labeled WhatsApp desktop control',
  args: [
    { name: 'label', positional: true, required: true, help: 'Exact accessibility description shown by inspect or tree' },
    { name: 'nth', required: false, help: 'Zero-based match index when the label is not unique' },
  ],
  columns: ['pressed', 'nth'],
  func: async ({ label, nth }) => runNative('press', nth == null ? [label] : [label, nth]),
});

cli({
  ...common,
  name: 'click',
  access: 'write',
  description: 'Activate a labeled WhatsApp desktop control through Accessibility without moving the pointer',
  args: [
    { name: 'label', positional: true, required: true, help: 'Exact accessibility description shown by inspect or tree' },
    { name: 'nth', required: false, help: 'Zero-based match index when the label is not unique' },
  ],
  columns: ['clicked', 'nth'],
  func: async ({ label, nth }) => runNative('click', nth == null ? [label] : [label, nth]),
});

cli({
  ...common,
  name: 'set',
  access: 'write',
  description: 'Set and verify a uniquely labeled WhatsApp desktop text control',
  args: [
    { name: 'label', positional: true, required: true, help: 'Exact text-control description shown by inspect' },
    { name: 'value', positional: true, required: true, help: 'New text value' },
    { name: 'nth', required: false, help: 'Zero-based match index when the label is not unique' },
  ],
  columns: ['control', 'value'],
  func: async ({ label, value, nth }) => runNative('set', nth == null ? [label, value] : [label, value, nth]),
});

cli({
  ...common,
  name: 'set-focused',
  access: 'write',
  description: 'Paste and verify text in the currently focused desktop text input',
  args: [{ name: 'value', positional: true, required: true, help: 'New text for the focused input' }],
  columns: ['role', 'value'],
  func: async ({ value }) => runNative('set-focused', [value]),
});

cli({
  ...common,
  name: 'key',
  access: 'write',
  description: 'Send a supported key or shortcut to WhatsApp desktop',
  args: [{ name: 'key', positional: true, required: true, help: 'return, escape, tab, backspace, arrows, cmd+f, cmd+n, or cmd+shift+g' }],
  columns: ['key'],
  func: async ({ key }) => runNative('key', [key]),
});
