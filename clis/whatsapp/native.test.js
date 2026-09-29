import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const nativeScript = fileURLToPath(new URL('./native.swift', import.meta.url));

describe.skipIf(process.platform !== 'darwin')('WhatsApp native script', () => {
  // Compile once: the `swift` interpreter re-compiles the script per invocation (8-13s under load).
  let buildDir, nativeBinary;
  beforeAll(() => {
    buildDir = mkdtempSync(join(tmpdir(), 'whatsapp-native-'));
    nativeBinary = join(buildDir, 'native');
    execFileSync('swiftc', ['-o', nativeBinary, nativeScript], { stdio: 'pipe' });
  }, 120_000);
  afterAll(() => rmSync(buildDir, { recursive: true, force: true }));

  describe('chat-row phone identity', () => {
    it.each([
      ['+ 6 5,8 8 0 0,4 4 4 4', 'message, Ok, Received from + 6 5,8 8 0 0,4 4 4 4, 12:02 AM', '6588004444'],
      ['+ 6 5,8 4 9 1,1 8 2 2, 1 unread message', 'message, Hey hi!, Received from + 6 5,8 4 9 1,1 8 2 2', '6584911822'],
      ['Alex Locksmith', 'Your message, thanks, Sent to + 6 5,9 1 5 5,5 0 7 9, Delivered', '6591555079'],
      ['Alex Locksmith', 'Your message, Sent to +65 9000 1111, Sent to +65 9155 5079, Delivered', '6591555079'],
      ['Shop 6588747658', 'Your message, call +65 8874 7658 tomorrow', ''],
    ])('extracts only the row identity for %s', (label, summary, expected) => {
      const output = execFileSync(nativeBinary, ['_parse-chat-row', label, summary], { encoding: 'utf8' });
      expect(JSON.parse(output)[0].phone).toBe(expected);
    });
  });

  describe('delete-chats input guards', () => {
    it.each([
      ['6591555079,6591555079', '6588004444'],
      ['6591555079,', '6588004444'],
      ['6588004444', '6588004444'],
    ])('rejects unsafe target set %s before opening the app', (targets, keep) => {
      const result = spawnSync(nativeBinary, ['delete-chats', targets, keep, 'false'], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('use unique digit-only target phones');
    });
  });
});
