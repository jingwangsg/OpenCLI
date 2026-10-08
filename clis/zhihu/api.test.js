import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { createZhihuClient, requestZhihuApi, syncZhihuSession } from './api.js';
import { Page } from '@jackwener/opencli/browser/page';

vi.mock('@jackwener/opencli/browser/page', () => ({ Page: vi.fn() }));
let directory;
const session = { contextId: 'a', userAgent: 'Actual Profile User-Agent', cookies: [
    { name: 'z_c0', value: 'synthetic-a', domain: '.zhihu.com', path: '/' },
    { name: 'expired', value: 'old', domain: '.zhihu.com', expirationDate: 1 },
    { name: 'other_path', value: 'other', domain: '.zhihu.com', path: '/people' },
] };

beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-zhihu-api-'));
    vi.stubEnv('OPENCLI_CONFIG_DIR', directory);
    vi.stubEnv('OPENCLI_PROFILE', '');
    fs.writeFileSync(path.join(directory, 'browser-profiles.json'), JSON.stringify({
        version: 1, defaultContextId: 'a', aliases: { edge: 'a', personal: 'b' },
    }));
    fs.mkdirSync(path.join(directory, 'auth', 'zhihu'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'auth', 'zhihu', 'a.json'), JSON.stringify(session));
    vi.clearAllMocks();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('Zhihu API profile sessions', () => {
    it('uses cached profile credentials without connecting to a browser and preserves large IDs', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":2091483293715846330}'));
        vi.stubGlobal('fetch', fetchMock);
        const api = await createZhihuClient('edge');
        await expect(api.get('/api/v4/answers/123')).resolves.toEqual({ id: '2091483293715846330' });
        expect(Page).not.toHaveBeenCalled();
        expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
            Cookie: 'z_c0=synthetic-a', 'User-Agent': 'Actual Profile User-Agent',
        });
        expect(fetchMock.mock.calls[0][1].redirect).toBe('error');
    });

    it('never borrows the default account when another profile has no session', async () => {
        await expect(createZhihuClient('personal')).rejects.toBeInstanceOf(AuthRequiredError);
        expect(Page).not.toHaveBeenCalled();
    });

    it('resolves the saved default and OPENCLI_PROFILE without a browser', async () => {
        await expect(createZhihuClient()).resolves.toHaveProperty('get');
        vi.stubEnv('OPENCLI_PROFILE', 'personal');
        await expect(createZhihuClient()).rejects.toBeInstanceOf(AuthRequiredError);
    });

    it('rejects an expired login cookie before making a request', async () => {
        vi.stubGlobal('fetch', vi.fn());
        await expect(requestZhihuApi({ ...session, cookies: [{ ...session.cookies[0], expirationDate: 1 }] }, '/api/v4/me'))
            .rejects.toBeInstanceOf(AuthRequiredError);
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each(['https://example.com/api/v4/me', 'http://www.zhihu.com/api/v4/me', 'https://www.zhihu.com:8443/api/v4/me', '/people/alice'])
        ('rejects a URL outside the API boundary: %s', async (url) => {
            vi.stubGlobal('fetch', vi.fn());
            await expect(requestZhihuApi(session, url)).rejects.toBeInstanceOf(ArgumentError);
            expect(fetch).not.toHaveBeenCalled();
        });

    it('normalizes first-party API pagination links to the website endpoint', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"data":[]}')));
        await requestZhihuApi(session, 'https://api.zhihu.com/questions/123/answers?offset=20');
        expect(String(fetch.mock.calls[0][0])).toBe('https://www.zhihu.com/api/v4/questions/123/answers?offset=20');
    });

    it('preserves risk-control status and error code for comment error handling', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"code":40362,"message":"abnormal request"}}', { status: 403 })));
        await expect(requestZhihuApi(session, '/api/v4/me')).resolves.toMatchObject({ __httpError: 403, __httpStatus: 403, __errorCode: 40362 });
    });

    it('reports malformed JSON as an execution failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>')));
        await expect(requestZhihuApi(session, '/api/v4/me')).rejects.toBeInstanceOf(CommandExecutionError);
    });

    it('preserves in-band authentication errors on HTTP 200 responses', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"code":40353,"need_login":true}}')));
        await expect(requestZhihuApi(session, '/api/v4/me')).resolves.toMatchObject({ __httpStatus: 200, __errorCode: 40353, __needLogin: true });
    });

    it('syncs only the selected profile and writes a private session file', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"url_token":"alice","name":"Alice","id":"123"}')));
        const page = { contextId: 'b', getCookies: vi.fn().mockResolvedValue(session.cookies), evaluate: vi.fn().mockResolvedValue(session.userAgent) };
        await expect(syncZhihuSession(page)).resolves.toMatchObject({ url_token: 'alice' });
        const filename = path.join(directory, 'auth', 'zhihu', 'b.json');
        expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
        expect(fs.statSync(path.dirname(filename)).mode & 0o777).toBe(0o700);
        expect(JSON.parse(fs.readFileSync(filename, 'utf8')).contextId).toBe('b');
    });
});
