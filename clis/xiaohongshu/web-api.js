import { Page } from '@jackwener/opencli/browser/page';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { buildNoteUrl, parseNoteId } from './note-helpers.js';

export async function webApiPage(page) {
    if (await page.evaluate(() => location.origin === 'https://www.xiaohongshu.com') === true) {
        // The first-party signer waits on browser tasks that stall in a hidden tab.
        // Activate the existing adapter tab; its URL and business UI stay untouched.
        const [tab] = await page.tabs();
        if (tab?.active === false && tab.page) await page.selectTab(tab.page);
        return page;
    }
    const runtime = new Page('xiaohongshu-web-api', undefined, page.contextId, undefined, 'browser', undefined, page.preferredContextId);
    if (await runtime.evaluate(() => location.origin === 'https://www.xiaohongshu.com') !== true) {
        throw new AuthRequiredError('www.xiaohongshu.com', 'Open the logged-in Xiaohongshu tab and run: opencli browser xiaohongshu-web-api bind');
    }
    return runtime;
}

export async function callWebApi(page, path, { method = 'GET', params = {}, body } = {}) {
    if (!/^\/api\/sns\/[a-zA-Z0-9/_]+$/.test(path) || !['GET', 'POST'].includes(method)) {
        throw new ArgumentError('Expected a Xiaohongshu web API path and GET or POST');
    }
    const runtime = await webApiPage(page);
    const request = async ({ path, method, params, body }) => {
        if (!window.webpackChunkxhs_pc_web) return { ok: false, error: 'runtime_missing' };
        let require;
        window.webpackChunkxhs_pc_web.push([[`opencli-${Date.now()}`], {}, (value) => { require = value; }]);
        let client;
        for (const [id, factory] of Object.entries(require?.m || {})) {
            const source = factory.toString();
            if (!source.includes('registerGlobalProperties') || !source.includes('provideUseHttp')) continue;
            const candidate = require(id).dJ;
            if (typeof candidate?.get === 'function' && typeof candidate?.post === 'function') { client = candidate; break; }
        }
        if (!client) return { ok: false, error: 'client_missing' };
        const options = { timeout: 25000, ...(path === '/api/sns/web/v2/search/notes' ? { baseURL: 'https://so.xiaohongshu.com' } : {}) };
        try {
            // The site's client owns signing and request/response case conversion.
            const data = method === 'GET'
                ? await client.get(path, { params, ...options })
                : await client.post(path, body, options);
            return { ok: true, data };
        } catch (error) {
            return { ok: false, code: error?.code, status: error?.status ?? error?.response?.status };
        }
    };
    const args = { path, method, params, body };
    const result = ['/api/sns/web/v1/user/follow', '/api/sns/web/v1/user/unfollow'].includes(path)
        ? await runtime.evaluateOnce(request, args)
        : await runtime.evaluate(request, args);
    if (!result?.ok) {
        if ([-100, -101, -104, 300011, 300012, 300017, 300031].includes(result?.code) || [401, 403, 461, 471].includes(result?.status)) {
            throw new AuthRequiredError('www.xiaohongshu.com', `Xiaohongshu rejected the API request (code=${result.code ?? result.status}); verify login or complete verification in the bound tab`);
        }
        throw new CommandExecutionError(`Xiaohongshu API failed (${result?.error || result?.code || result?.status || 'invalid response'})`);
    }
    if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
        throw new CommandExecutionError('Xiaohongshu API omitted its data object');
    }
    return result.data;
}

export async function readNoteApi(page, input) {
    const url = new URL(buildNoteUrl(input, { commandName: 'xiaohongshu note' }));
    const id = parseNoteId(url.href);
    const data = await callWebApi(page, '/api/sns/web/v1/feed', { method: 'POST', body: {
        sourceNoteId: id, imageFormats: ['jpg', 'webp', 'avif'], extra: { needBodyTopic: '1' },
        xsecSource: url.searchParams.get('xsec_source') || 'pc_search', xsecToken: url.searchParams.get('xsec_token'),
    } });
    if (!Array.isArray(data.items)) throw new CommandExecutionError('Xiaohongshu note response omitted items');
    const note = data.items.find((item) => item?.noteCard?.noteId === id)?.noteCard;
    if (!note || typeof note.desc !== 'string' || !note.user || !note.interactInfo) {
        throw new CommandExecutionError('Xiaohongshu note response omitted the requested note or required fields');
    }
    return note;
}

export async function readNoteListApi(page, path, userId, limit) {
    const notes = [];
    const seen = new Set();
    const cursors = new Set(['']);
    let cursor = '';
    for (let number = 0; number < 100; number++) {
        const data = await callWebApi(page, path, { params: { userId, cursor, num: 30, imageFormats: 'jpg,webp,avif' } });
        if (!Array.isArray(data.notes) || typeof data.hasMore !== 'boolean') {
            throw new CommandExecutionError('Xiaohongshu note list returned malformed pagination');
        }
        for (const note of data.notes) {
            if (!/^[a-f0-9]{24}$/i.test(note?.noteId || '') || !note.xsecToken || !note.user || !note.interactInfo) {
                throw new CommandExecutionError('Xiaohongshu note list returned an incomplete note');
            }
            if (seen.has(note.noteId)) continue;
            seen.add(note.noteId);
            notes.push(note);
            if (notes.length === limit) return notes;
        }
        if (!data.hasMore) return notes;
        if (typeof data.cursor !== 'string' || !data.cursor || cursors.has(data.cursor) || !data.notes.length) {
            throw new CommandExecutionError('Xiaohongshu note list repeated or omitted its continuation cursor');
        }
        cursors.add(data.cursor);
        cursor = data.cursor;
    }
    throw new CommandExecutionError('Xiaohongshu note list reached its page limit');
}

export async function setFollowingApi(page, userId, following) {
    const before = await callWebApi(page, '/api/sns/web/v1/user/otherinfo', { params: { targetUserId: userId } });
    const state = before.extraInfo?.fstatus;
    if (!['none', 'fans', 'follows', 'both'].includes(state)) throw new CommandExecutionError('Xiaohongshu omitted the current follow state');
    const current = ['follows', 'both'].includes(state);
    if (current === following) return following ? 'already-following' : 'not-following';
    if (before.extraInfo.blockType !== 'DEFAULT') throw new CommandExecutionError('Xiaohongshu reports that this follow relationship is blocked');
    let requestFailed = false;
    try {
        await callWebApi(page, `/api/sns/web/v1/user/${following ? 'follow' : 'unfollow'}`, {
            method: 'POST', body: { targetUserId: userId },
        });
    } catch { requestFailed = true; }
    let after;
    try { after = await callWebApi(page, '/api/sns/web/v1/user/otherinfo', { params: { targetUserId: userId } }); }
    catch { throw new CommandExecutionError('The follow request was submitted, but its result could not be verified; check the relationship before retrying'); }
    const next = after.extraInfo?.fstatus;
    if (!['none', 'fans', 'follows', 'both'].includes(next) || ['follows', 'both'].includes(next) !== following) {
        throw new CommandExecutionError(`The follow ${requestFailed ? 'request outcome is uncertain' : 'request was submitted'}, but the independently read relationship does not confirm it; check before retrying`);
    }
    return following ? 'followed' : 'unfollowed';
}
