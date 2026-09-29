import { afterAll, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';

const captured = vi.hoisted(() => ({ server: undefined as Server | undefined }));
vi.mock('node:http', async (original) => {
  const http = await original<typeof import('node:http')>();
  return { ...http, createServer: (...args: Parameters<typeof http.createServer>) => {
    captured.server = http.createServer(...args);
    return captured.server;
  } };
});
vi.mock('./constants.js', async (original) => ({ ...await original<object>(), DEFAULT_DAEMON_PORT: 0 }));
vi.mock('./update-check.js', () => ({ recordExtensionVersion: vi.fn() }));
vi.mock('./logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const existingSignals = new Map(['SIGTERM', 'SIGINT'].map((signal) => [signal, process.listeners(signal)]));
let socket: WebSocket | undefined;
afterAll(async () => {
  vi.useRealTimers();
  for (const [signal, previous] of existingSignals) {
    for (const listener of process.listeners(signal)) if (!previous.includes(listener)) process.removeListener(signal, listener);
  }
  if (socket && socket.readyState !== WebSocket.CLOSED) { socket.close(); await once(socket, 'close'); }
  if (captured.server?.listening) {
    captured.server.closeIdleConnections();
    await new Promise<void>((resolve) => captured.server!.close(() => resolve()));
  }
});

describe('daemon leases across bound browser runtimes', () => {
  it('protects and refreshes the original write lease while a bound call outlives its TTL', async () => {
    const now = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    await import('./daemon.js');
    const server = captured.server!;
    if (!server.listening) await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    socket = new WebSocket(`ws://127.0.0.1:${port}/ext`, { headers: { origin: 'chrome-extension://lease-test' } });
    let heldArrived!: () => void;
    const held = new Promise<void>((resolve) => { heldArrived = resolve; });
    const received: string[] = [];
    socket.on('message', (raw) => {
      const command = JSON.parse(raw.toString());
      received.push(command.id);
      if (command.id === 'bound-held') heldArrived();
      else socket!.send(JSON.stringify({ id: command.id, ok: true, data: {} }));
    });
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'hello', contextId: 'lease-test', version: '1.0.24', compatRange: '>=1.0.0' }));
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = await (await fetch(`${base}/status`, { headers: { 'X-OpenCLI': '1' } })).json();
      if (status.extensionConnected) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const post = async (command: object) => (await fetch(`${base}/command`, { method: 'POST', headers: {
      'X-OpenCLI': '1', 'Content-Type': 'application/json',
    }, body: JSON.stringify(command) })).json();
    const owner = { action: 'exec', contextId: 'lease-test', surface: 'adapter', siteSession: 'persistent',
      access: 'write', session: 'site:xiaohongshu', runId: 'owner-run', command: 'xiaohongshu ask', code: '1' };
    expect(await post({ ...owner, id: 'acquire' })).toMatchObject({ ok: true });
    const pending = post({ ...owner, id: 'bound-held', surface: 'browser', siteSession: undefined, session: 'xiaohongshu-web-api' });
    await held;
    vi.setSystemTime(now + 46_000);
    expect(await post({ ...owner, id: 'compete-pending', runId: 'second-run' })).toMatchObject({ ok: false, errorCode: 'session_busy' });
    socket.send(JSON.stringify({ id: 'bound-held', ok: true, data: { finished: true } }));
    expect(await pending).toMatchObject({ ok: true });
    expect(await post({ ...owner, id: 'compete-after', runId: 'second-run' })).toMatchObject({ ok: false, errorCode: 'session_busy' });
    expect(received.filter((id) => id === 'bound-held')).toHaveLength(1);
    await post({ action: 'lease-release', id: 'release', runId: 'owner-run' });
    expect(await post({ ...owner, id: 'acquire-second', runId: 'second-run' })).toMatchObject({ ok: true });
  });
});
