import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import { extractXhsUserNotes, normalizeXhsUserId } from './user-helpers.js';
import { readNoteListApi } from './web-api.js';
/**
 * Host-agnostic IIFE that snapshots the user profile's Pinia store.
 * load-bearing: rednote/user.js still reads profiles through it.
 */
export const USER_SNAPSHOT_JS = `
    (() => {
      const safeClone = (value) => {
        try {
          return JSON.parse(JSON.stringify(value ?? null));
        } catch {
          return null;
        }
      };

      const userStore = window.__INITIAL_STATE__?.user;
      const hasUserStore = Boolean(userStore && typeof userStore === 'object');
      const rawNotes = hasUserStore ? (userStore.notes?._value || userStore.notes) : undefined;
      const rawPageData = hasUserStore ? (userStore.userPageData?._value || userStore.userPageData) : undefined;
      // 登录墙检测：小红书 profile 页比 search 更吃登录态，会话失效/被风控降级时访问
      // /user/profile/<id> 会 302 到 /login（loggedIn=false）。用 indexOf 而非正则——
      // 本块是嵌在模板字符串里的 JS，正则 \\b 会被模板解析成退格符。
      const loggedInVal = hasUserStore ? (userStore.loggedIn?._value ?? userStore.loggedIn) : undefined;
      const pathName = (typeof location !== 'undefined' && location.pathname) ? location.pathname : '';
      const onLoginPage = pathName.indexOf('/login') === 0;
      return {
        noteGroups: safeClone(rawNotes || []),
        pageData: safeClone(rawPageData || {}),
        storePresent: hasUserStore,
        notesPresent: Array.isArray(rawNotes),
        pageDataPresent: Boolean(rawPageData && typeof rawPageData === 'object' && Object.keys(rawPageData).length > 0),
        loginWall: Boolean(onLoginPage || loggedInVal === false),
      };
    })()
  `;
export const command = cli({
    site: 'xiaohongshu',
    name: 'user',
    access: 'read',
    description: 'Get public notes from a Xiaohongshu user profile',
    domain: 'www.xiaohongshu.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false, siteSession: 'persistent',
    args: [
        { name: 'id', type: 'string', required: true, positional: true, help: 'User id or profile URL' },
        { name: 'limit', type: 'int', default: 15, help: 'Number of notes to return' },
    ],
    columns: ['id', 'title', 'type', 'likes', 'url'],
    func: async (page, kwargs) => {
        const userId = normalizeXhsUserId(String(kwargs.id));
        const limit = Number(kwargs.limit ?? 15);
        if (!/^[a-f0-9]{24}$/i.test(userId) || !Number.isInteger(limit) || limit < 1) throw new ArgumentError('Provide a valid user id and a positive integer limit');
        const notes = await readNoteListApi(page, '/api/sns/web/v1/user_posted', userId, limit);
        if (notes.some((note) => note.user.userId !== userId)) throw new CommandExecutionError('Xiaohongshu returned notes from a different author');
        if (!notes.length) throw new EmptyResultError('xiaohongshu user', '该用户没有公开笔记。');
        return extractXhsUserNotes({ noteGroups: notes }, userId).map(({ id, title, type, likes, url }) => ({ id, title, type, likes, url }));
    },
});
