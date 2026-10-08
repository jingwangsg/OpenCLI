import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Page } from '@jackwener/opencli/browser/page';
import { resolveProfileSelection } from '@jackwener/opencli/browser/profile';
import { ArgumentError, AuthRequiredError, CommandExecutionError, TimeoutError } from '@jackwener/opencli/errors';

function sessionPath(contextId) {
    return path.join(process.env.OPENCLI_CONFIG_DIR || path.join(os.homedir(), '.opencli'),
        'auth', 'zhihu', `${encodeURIComponent(contextId)}.json`);
}

export async function requestZhihuApi(session, input) {
    const url = new URL(input, 'https://www.zhihu.com');
    if (url.protocol === 'https:' && url.hostname === 'api.zhihu.com') {
        url.hostname = 'www.zhihu.com';
        url.pathname = `/api/v4${url.pathname}`;
    }
    if (url.protocol !== 'https:' || url.hostname !== 'www.zhihu.com' || url.port
        || url.username || url.password || !/^\/api\/v[34]\//.test(url.pathname)) {
        throw new ArgumentError('Expected a Zhihu API URL');
    }
    const cookies = session.cookies.filter(cookie =>
        (cookie.expirationDate == null || cookie.expirationDate <= 0 || cookie.expirationDate > Date.now() / 1000)
        && url.pathname.startsWith(cookie.path || '/'));
    if (!cookies.some(cookie => cookie.name === 'z_c0' && cookie.value)) {
        throw new AuthRequiredError('www.zhihu.com', 'Zhihu profile session expired; run opencli zhihu auth-sync --profile <profile>');
    }
    let response;
    try {
        response = await fetch(url, {
            headers: {
                Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
                'User-Agent': session.userAgent,
                Accept: 'application/json',
                Referer: 'https://www.zhihu.com/',
            },
            redirect: 'error',
            signal: AbortSignal.timeout(20000),
        });
    } catch (error) {
        if (error.name === 'TimeoutError') throw new TimeoutError('Zhihu API request', 20);
        throw new CommandExecutionError(`Zhihu API request failed: ${error.message || String(error)}`);
    }
    let data;
    try {
        const text = await response.text();
        data = JSON.parse(text.replace(/("id"\s*:\s*)(\d{16,})/g, '$1"$2"'));
    } catch {
        if (!response.ok) return { __httpError: response.status, __httpStatus: response.status };
        throw new CommandExecutionError('Zhihu API returned malformed JSON');
    }
    if (!response.ok || data?.error?.code || data?.error_code || data?.error_msg
        || data?.error?.need_login === true || data?.need_login === true) return {
        __httpError: response.ok ? undefined : response.status,
        __httpStatus: response.status,
        __errorCode: data?.error?.code ?? data?.error_code ?? '',
        __errorMessage: data?.error?.message || data?.error_msg || '',
        __needLogin: data?.error?.need_login === true || data?.need_login === true,
    };
    return data;
}

export async function createZhihuClient(profile) {
    const contextId = resolveProfileSelection(profile)?.contextId;
    if (!contextId) throw new ArgumentError('Select a profile with --profile <name> or opencli profile use <name>');
    let session;
    try {
        session = JSON.parse(fs.readFileSync(sessionPath(contextId), 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new AuthRequiredError('www.zhihu.com', `No cached Zhihu session for profile ${profile || contextId}; run opencli zhihu auth-sync --profile ${profile || contextId}`);
        }
        throw new CommandExecutionError('Cannot read the cached Zhihu profile session');
    }
    if (session.contextId !== contextId || typeof session.userAgent !== 'string' || !session.userAgent || !Array.isArray(session.cookies)) {
        throw new CommandExecutionError('Cached Zhihu profile session is malformed; run opencli zhihu auth-sync');
    }
    if (!session.cookies.some(cookie => cookie.name === 'z_c0' && cookie.value
        && (cookie.expirationDate == null || cookie.expirationDate <= 0 || cookie.expirationDate > Date.now() / 1000))) {
        throw new AuthRequiredError('www.zhihu.com', 'Cached Zhihu login expired; run opencli zhihu auth-sync');
    }
    return { get: url => requestZhihuApi(session, url) };
}

export async function syncZhihuSession(page) {
    if (!page.contextId) throw new ArgumentError('Use --profile <name> when syncing the Zhihu session');
    const cookies = (await page.getCookies({ url: 'https://www.zhihu.com' }))
        .filter(cookie => ['zhihu.com', '.zhihu.com', 'www.zhihu.com'].includes(cookie.domain));
    const userAgent = await page.evaluate('navigator.userAgent');
    const session = { contextId: page.contextId, userAgent, cookies };
    const identity = await requestZhihuApi(session, '/api/v4/me?include=url_token');
    if (!identity?.url_token) throw new AuthRequiredError('www.zhihu.com', 'The selected profile is not logged into Zhihu');
    const filename = sessionPath(page.contextId);
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(filename), 0o700);
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temporary, JSON.stringify(session), { mode: 0o600 });
        fs.renameSync(temporary, filename);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    return { url_token: String(identity.url_token), name: String(identity.name || ''), uid: String(identity.uid || identity.id || '') };
}

export async function syncZhihuProfile(profile) {
    const contextId = resolveProfileSelection(profile)?.contextId;
    if (!contextId) throw new ArgumentError('Select a profile with --profile <name>');
    return syncZhihuSession(new Page('zhihu-api-auth', undefined, contextId));
}
