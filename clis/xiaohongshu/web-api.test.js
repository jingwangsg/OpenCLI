import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { callWebApi } from './web-api.js';
import './search.js';
import './note.js';
import './comments.js';
import './user.js';
import './feed.js';
import './saved.js';
import './liked.js';
import './notifications.js';
import './follow.js';
import './unfollow.js';
import './auth.js';

const userId = '6123456789abcdef01234567';
const noteId = '69fd9dd8000000002301f502';
const signedUrl = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=test-token&xsec_source=pc_search`;
let client;
let page;

function card(id = noteId) {
    return { noteId: id, displayTitle: 'Title', title: 'Title', desc: '正文\n第二行', type: 'normal',
        user: { userId, nickname: 'Author' }, interactInfo: { likedCount: '8', collectedCount: '2', commentCount: '3' },
        xsecToken: 'note-token', imageList: [], tagList: [{ name: '旅行' }] };
}
function item(id = noteId) { return { id, modelType: 'note', xsecToken: 'entry-token', noteCard: card(id) }; }
function comment(id, extra = {}) {
    return { id, noteId, content: '评论', likeCount: '2', createTime: 1760000000000, userInfo: { userId, nickname: 'Author' },
        pictures: [], subComments: [], subCommentHasMore: false, ...extra };
}
const filters = [
    ['sort_type', '排序依据', [['general', '综合'], ['time_descending', '最新']]],
    ['filter_note_type', '笔记类型', [['不限', '不限'], ['普通笔记', '图文']]],
    ['filter_note_time', '发布时间', [['不限', '不限'], ['一周内', '一周内']]],
    ['filter_note_range', '搜索范围', [['不限', '不限']]],
    ['filter_pos_distance', '位置距离', [['不限', '不限']]],
].map(([id, name, tags]) => ({ id, name, filterTags: tags.map(([id, name]) => ({ id, name })) }));

beforeEach(() => {
    client = { get: vi.fn(), post: vi.fn() };
    const require = () => ({ dJ: client });
    require.m = { currentBuild: function registerGlobalProperties() { return 'provideUseHttp'; } };
    vi.stubGlobal('window', { webpackChunkxhs_pc_web: { push: ([, , callback]) => callback(require) } });
    vi.stubGlobal('location', { origin: 'https://www.xiaohongshu.com' });
    page = { evaluateOnce: vi.fn(async (fn, ...args) => fn(...args)),
        evaluate: vi.fn(async (fn, ...args) => fn(...args)), tabs: vi.fn().mockResolvedValue([]), goto: vi.fn(), click: vi.fn(), wait: vi.fn() };
});
afterEach(() => {
    expect(page.goto).not.toHaveBeenCalled();
    expect(page.click).not.toHaveBeenCalled();
    expect(page.wait).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
});
const command = (name) => getRegistry().get(`xiaohongshu/${name}`);

describe('Xiaohongshu signed API transport', () => {
    it('uses the first-party client and preserves parameters', async () => {
        client.get.mockResolvedValue({ guest: false, userId });
        expect(await callWebApi(page, '/api/sns/web/v2/user/me')).toMatchObject({ guest: false });
        expect(client.get).toHaveBeenCalledWith('/api/sns/web/v2/user/me', expect.objectContaining({ params: {} }));
        client.post.mockResolvedValue({ items: [], hasMore: false });
        await callWebApi(page, '/api/sns/web/v2/search/notes', { method: 'POST', body: { keyword: '查询' } });
        expect(client.post).toHaveBeenCalledWith('/api/sns/web/v2/search/notes', { keyword: '查询' }, expect.objectContaining({ baseURL: 'https://so.xiaohongshu.com' }));
    });
    it.each([-100, -104, 300011, 300017])('reports authentication/verification code %s without exposing response content', async (code) => {
        client.get.mockRejectedValue({ code, message: 'private response' });
        await expect(callWebApi(page, '/api/sns/web/v2/user/me')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    });
    it.each([null, [], 'html'])('rejects a malformed API body %s', async (body) => {
        client.get.mockResolvedValue(body);
        await expect(callWebApi(page, '/api/sns/web/v2/user/me')).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });
    it('fails on runtime drift and rejects off-site request paths before evaluating', async () => {
        await expect(callWebApi(page, 'https://other.example/api/sns/web/v2/user/me')).rejects.toMatchObject({ code: 'ARGUMENT' });
        expect(page.evaluate).not.toHaveBeenCalled();
        window.webpackChunkxhs_pc_web = undefined;
        await expect(callWebApi(page, '/api/sns/web/v2/user/me')).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });
});

describe('Xiaohongshu main-site commands', () => {
    it('searches multiple pages, ignores typed non-note cards, and resolves every filter', async () => {
        client.get.mockResolvedValue({ filters });
        client.post.mockImplementation(async (_path, body) => ({ hasMore: body.page === 1,
            items: body.page === 1 ? [{ modelType: 'hot_query' }, item()] : [item(), item('69fd9dd8000000002301f503')] }));
        const rows = await command('search').func(page, { query: '旅行', limit: 2, sort: 'latest', 'note-type': 'image', 'publish-time': 'week' });
        expect(rows).toHaveLength(2);
        expect(client.post.mock.calls.map((call) => call[1].page)).toEqual([1, 2]);
        expect(client.post.mock.calls[0][1].filters).toContainEqual({ type: 'filter_note_time', tags: ['一周内'] });
        expect(client.post.mock.calls[0][1].filters).toContainEqual({ type: 'sort_type', tags: ['time_descending'] });
        expect(Object.keys(rows[0])).toEqual(command('search').columns);
        expect(rows[0].url).toContain('xsec_token=entry-token');
    });
    it('does not return partial search results after a repeated page or upstream error', async () => {
        client.get.mockResolvedValue({ filters });
        client.post.mockResolvedValue({ hasMore: true, items: [item()] });
        await expect(command('search').func(page, { query: 'query', limit: 2 })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        client.post.mockReset().mockResolvedValueOnce({ hasMore: true, items: [item()] }).mockRejectedValueOnce({ status: 500 });
        await expect(command('search').func(page, { query: 'query', limit: 2 })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });
    it('preserves true empty search results and rejects a removed filter', async () => {
        client.get.mockResolvedValue({ filters }); client.post.mockResolvedValue({ hasMore: false, items: [] });
        expect(await command('search').func(page, { query: 'query' })).toEqual([]);
        client.get.mockResolvedValue({ filters: [] });
        await expect(command('search').func(page, { query: 'query' })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });
    it('reads exact note content and rejects mismatched identity', async () => {
        client.post.mockResolvedValue({ items: [item()] });
        const rows = await command('note').func(page, { 'note-id': signedUrl });
        expect(rows).toContainEqual({ field: 'content', value: '正文\n第二行' });
        expect(rows).toContainEqual({ field: 'tags', value: '旅行' });
        expect(client.post.mock.calls[0][1]).toMatchObject({ sourceNoteId: noteId, xsecToken: 'test-token' });
        client.post.mockResolvedValue({ items: [item('69fd9dd8000000002301f503')] });
        await expect(command('note').func(page, { 'note-id': signedUrl })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });
    it('rejects unsigned note references before any API request', async () => {
        await expect(command('note').func(page, { 'note-id': noteId })).rejects.toMatchObject({ code: 'ARGUMENT' });
        expect(client.post).not.toHaveBeenCalled();
    });
    it.each(['saved', 'liked'])('paginates %s by server cursor and preserves note links', async (name) => {
        client.get.mockImplementation(async (path, { params }) => path.endsWith('/user/me') ? { guest: false, userId }
            : params.cursor === '' ? { notes: [card()], cursor: 'next', hasMore: true }
                : { notes: [card('69fd9dd8000000002301f503')], cursor: '', hasMore: false });
        const rows = await command(name).func(page, { limit: 2 });
        expect(rows).toHaveLength(2);
        expect(Object.keys(rows[0])).toEqual(command(name).columns);
        expect(client.get.mock.calls.at(-1)[1].params).toMatchObject({ cursor: 'next', userId });
    });
    it('rejects repeated collection cursors and guest identities', async () => {
        client.get.mockResolvedValue({ notes: [card()], cursor: 'next', hasMore: true });
        await expect(command('saved').func(page, { id: userId, limit: 3 })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        client.get.mockResolvedValue({ guest: true, userId });
        await expect(command('saved').func(page, { limit: 1 })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    });
    it('reads author notes and reports a genuinely empty account', async () => {
        client.get.mockResolvedValue({ notes: [card()], hasMore: false, cursor: '' });
        const rows = await command('user').func(page, { id: userId });
        expect(Object.keys(rows[0])).toEqual(command('user').columns);
        client.get.mockResolvedValue({ notes: [], hasMore: false, cursor: '' });
        await expect(command('user').func(page, { id: userId })).rejects.toMatchObject({ code: 'EMPTY_RESULT' });
    });
    it('fetches feed continuation and retains signed detail links', async () => {
        client.post.mockResolvedValueOnce({ items: [item()], cursorScore: 'cursor-1' })
            .mockResolvedValueOnce({ items: [item('69fd9dd8000000002301f503')], cursorScore: 'cursor-2' });
        const rows = await command('feed').func(page, { limit: 2 });
        expect(rows).toHaveLength(2);
        expect(client.post.mock.calls[1][1]).toMatchObject({ cursorScore: 'cursor-1', refreshType: 3, noteIndex: 1 });
        expect(rows[0].url).toContain('xsec_token=entry-token');
    });
    it('fetches all requested top-level comments and nested reply pages with direct reply targets', async () => {
        client.get.mockImplementation(async (path, { params }) => path.endsWith('/sub/page')
            ? { comments: [comment('reply-2', { targetComment: { userInfo: { nickname: 'Reply author' } } })], hasMore: false, cursor: '' }
            : params.cursor === ''
                ? { comments: [comment('root-1', { pictures: [{ urlDefault: 'https://sns-img.example/photo.jpg' }], subComments: [comment('reply-1')], subCommentHasMore: true, subCommentCursor: 'sub-next' })], hasMore: true, cursor: 'top-next' }
                : { comments: [comment('root-2')], hasMore: false, cursor: '' });
        const rows = await command('comments').func(page, { 'note-id': signedUrl, limit: 2, 'with-replies': true });
        expect(rows.map((row) => row.is_reply)).toEqual([false, true, true, false]);
        expect(rows[2].reply_to).toBe('Reply author');
        expect(rows[0].images).toEqual(['https://sns-img.example/photo.jpg']);
        expect(Object.keys(rows[0])).toEqual(command('comments').columns);
    });
    it('does not accept comments from another note or truncate repeated reply pages', async () => {
        client.get.mockResolvedValue({ comments: [comment('root', { noteId: 'different' })], hasMore: false });
        await expect(command('comments').func(page, { 'note-id': signedUrl })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        client.get.mockImplementation(async (path) => path.endsWith('/sub/page') ? { comments: [], hasMore: true, cursor: 'sub-next' }
            : { comments: [comment('root', { subCommentHasMore: true, subCommentCursor: 'sub-next' })], hasMore: false });
        await expect(command('comments').func(page, { 'note-id': signedUrl, 'with-replies': true })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });
    it('reads notifications without marking them read', async () => {
        client.get.mockResolvedValue({ messageList: [{ id: 'notification', userInfo: { nickname: 'User' }, title: '回复', commentInfo: { content: 'Text' }, itemInfo: { content: 'Note' }, time: 123 }], hasMore: false });
        const rows = await command('notifications').func(page, { type: 'mentions' });
        expect(Object.keys(rows[0])).toEqual(command('notifications').columns);
        expect(client.post).not.toHaveBeenCalled();
    });
    it.each([['follow', 'none', 'follows', 'followed'], ['unfollow', 'both', 'fans', 'unfollowed']])('verifies %s through an independent read', async (name, before, after, status) => {
        client.get.mockResolvedValueOnce({ extraInfo: { fstatus: before, blockType: 'DEFAULT' } })
            .mockResolvedValueOnce({ extraInfo: { fstatus: after, blockType: 'DEFAULT' } });
        client.post.mockResolvedValue({});
        expect(await command(name).func(page, { 'user-id': userId })).toMatchObject([{ status, user_id: userId }]);
        expect(client.post).toHaveBeenCalledTimes(1);
        expect(client.post.mock.calls[0][1]).toEqual({ targetUserId: userId });
        expect(client.get).toHaveBeenCalledTimes(2);
    });
    it.each([['follow', 'both', 'already-following'], ['unfollow', 'none', 'not-following']])('does not repeat an already satisfied %s', async (name, state, status) => {
        client.get.mockResolvedValue({ extraInfo: { fstatus: state, blockType: 'DEFAULT' } });
        expect(await command(name).func(page, { 'user-id': userId })).toMatchObject([{ status }]);
        expect(client.post).not.toHaveBeenCalled();
    });
    it.each([
        `https://www.xiaohongshu.com/user/profile/${userId}`,
        `https://www.xiaohongshu.com/user/profile/${userId}/?xsec_token=t&xsec_source=pc`,
    ])('extracts the user id from profile URL %s for follow and unfollow', async (input) => {
        client.get.mockResolvedValue({ extraInfo: { fstatus: 'both', blockType: 'DEFAULT' } });
        expect(await command('follow').func(page, { 'user-id': input })).toMatchObject([{ status: 'already-following', user_id: userId }]);
        expect(client.get).toHaveBeenLastCalledWith('/api/sns/web/v1/user/otherinfo', expect.objectContaining({ params: { targetUserId: userId } }));
        client.get.mockResolvedValue({ extraInfo: { fstatus: 'none', blockType: 'DEFAULT' } });
        expect(await command('unfollow').func(page, { 'user-id': input })).toMatchObject([{ status: 'not-following', user_id: userId }]);
    });
    it.each(['', 'short', '!!!', `https://evil.example/user/profile/${userId}`, `http://www.xiaohongshu.com/user/profile/${userId}`, `https://www.xiaohongshu.com/user/profile/${userId}/note123`])('rejects user id %j before any request', async (input) => {
        await expect(command('follow').func(page, { 'user-id': input })).rejects.toMatchObject({ code: 'ARGUMENT' });
        await expect(command('unfollow').func(page, { 'user-id': input })).rejects.toMatchObject({ code: 'ARGUMENT' });
        expect(page.evaluate).not.toHaveBeenCalled();
        expect(page.evaluateOnce).not.toHaveBeenCalled();
    });
    it('does not retry a write with uncertain verification', async () => {
        client.get.mockResolvedValueOnce({ extraInfo: { fstatus: 'none', blockType: 'DEFAULT' } }).mockRejectedValueOnce({ status: 500 });
        client.post.mockResolvedValue({});
        await expect(command('follow').func(page, { 'user-id': userId })).rejects.toThrow('check the relationship before retrying');
        expect(client.post).toHaveBeenCalledTimes(1);
    });
    it('checks main-site identity instead of creator-center login', async () => {
        client.get.mockImplementation(async (path) => path.endsWith('/user/me') ? { guest: false, userId }
            : { basicInfo: { nickname: 'Name' }, interactions: [{ type: 'fans', count: '12' }] });
        expect(await command('whoami').func(page, {})).toEqual({ logged_in: true, site: 'xiaohongshu', username: 'Name', followers: 12 });
        expect(await command('login').func(page, { timeout: 1 })).toMatchObject({ status: 'already_logged_in' });
    });
});

describe('Xiaohongshu write uncertainty and identity', () => {
    it('uses one evaluation and checks state after a navigation error without replaying the POST', async () => {
        client.get.mockResolvedValue({ extraInfo: { fstatus: 'none', blockType: 'DEFAULT' } });
        page.evaluateOnce.mockRejectedValue({ code: 'target_navigated' });
        await expect(command('follow').func(page, { 'user-id': userId })).rejects.toThrow('outcome is uncertain');
        expect(page.evaluateOnce).toHaveBeenCalledTimes(1);
        expect(client.get).toHaveBeenCalledTimes(2);
    });
    it('recognizes a committed write after an acknowledgement timeout through a new GET', async () => {
        client.get.mockResolvedValueOnce({ extraInfo: { fstatus: 'none', blockType: 'DEFAULT' } })
            .mockResolvedValueOnce({ extraInfo: { fstatus: 'follows', blockType: 'DEFAULT' } });
        client.post.mockRejectedValue({ code: 'ECONNABORTED' });
        expect(await command('follow').func(page, { 'user-id': userId })).toMatchObject([{ status: 'followed' }]);
        expect(client.post).toHaveBeenCalledTimes(1);
    });
    it('rejects another author in a user_posted response', async () => {
        const note = card(); note.user.userId = '6123456789abcdef01234568';
        client.get.mockResolvedValue({ notes: [note], cursor: '', hasMore: false });
        await expect(command('user').func(page, { id: userId })).rejects.toThrow('different author');
    });
    it('preserves camelCase nickName in saved notes', async () => {
        const note = card(); note.user = { userId, nickName: 'Visible Author' };
        client.get.mockResolvedValue({ notes: [note], cursor: '', hasMore: false });
        expect(await command('saved').func(page, { id: userId })).toMatchObject([{ author: 'Visible Author' }]);
    });
});

describe('Xiaohongshu signing runtime visibility', () => {
    it('activates the existing adapter tab without navigating or clicking the application', async () => {
        page.tabs = vi.fn().mockResolvedValue([{ page: 'runtime-target', active: false }]);
        page.selectTab = vi.fn();
        client.get.mockResolvedValue({ guest: false, userId });
        await callWebApi(page, '/api/sns/web/v2/user/me');
        expect(page.selectTab).toHaveBeenCalledWith('runtime-target');
        expect(page.evaluate.mock.calls.some(([fn]) => fn.toString().includes('location.href ='))).toBe(false);
    });
});
