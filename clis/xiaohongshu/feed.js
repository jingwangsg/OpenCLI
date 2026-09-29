/**
 * Xiaohongshu home feed through the signed homefeed API (cursor pagination).
 *
 * `runFeed` below reads the hydrated Pinia `feed.feeds` array instead. It is
 * kept because rednote/feed.js still runs on it: the hydrated store is
 * camelCase on both sites (`noteCard.displayTitle`, `interactInfo.likedCount`)
 * and carries `entry.xsecToken` for every first-screen note, so its URLs are
 * signed and drill-down-ready.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import { unwrapEvaluateResult } from './shared.js';
import { callWebApi } from './web-api.js';

function parseLimit(raw) {
    const parsed = Number(raw ?? 20);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        throw new ArgumentError(`--limit must be a positive integer, got ${JSON.stringify(raw)}`);
    }
    if (parsed < 1) {
        throw new ArgumentError(`--limit must be a positive integer, got ${parsed}`);
    }
    return parsed;
}

const FEEDS_READ_JS = `
  (() => {
    let pinia = null;
    const probe = (el) => el?.__vue_app__?.config?.globalProperties?.$pinia ?? null;
    pinia = probe(document.querySelector('#app'));
    if (!pinia) {
      // Some builds mount under a different root id; fall back to a full scan
      // only when the standard mount node misses.
      for (const el of document.querySelectorAll('*')) {
        pinia = probe(el);
        if (pinia) break;
      }
    }
    if (!pinia || !pinia._s) return { error: 'no_pinia' };
    const store = pinia._s.get('feed');
    if (!store) return { error: 'no_feed_store' };
    const feeds = store.feeds;
    if (!Array.isArray(feeds)) return { error: 'feeds_not_array' };
    return {
      items: feeds.map(entry => {
        const card = entry?.noteCard ?? {};
        return {
          id: entry?.id ?? '',
          title: card.displayTitle ?? '',
          type: card.type ?? '',
          // Live store exposes both user.nickname and user.nickName; prefer
          // nickname (observed populated on xhs), fall back to nickName.
          author: card.user?.nickname ?? card.user?.nickName ?? '',
          likes: card.interactInfo?.likedCount ?? '',
          // The note's signing token lives on the top-level entry. Do NOT read
          // card.user.xsecToken — that is the author profile's token, not the
          // note's.
          xsecToken: entry?.xsecToken ?? '',
        };
      }),
    };
  })()
`;

function toCleanString(value) {
    return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

/**
 * Build a signed note URL for the given web host. Falls back to the bare
 * /explore/{id} URL when the caller intentionally passes no token.
 *
 * The `xsec_source` param mirrors what XHS itself renders into feed-page note
 * links: an empty value. Only `xsec_token` is actually required by the note
 * detail endpoint (verified: the source value is not validated), so we
 * reproduce the real-world shape rather than inventing a source label.
 */
export function buildFeedNoteUrl(webHost, id, xsecToken) {
    const cleanId = toCleanString(id);
    const url = new URL(`https://${webHost}/explore/${encodeURIComponent(cleanId)}`);
    const cleanToken = toCleanString(xsecToken);
    if (!cleanToken)
        return url.toString();
    url.searchParams.set('xsec_token', cleanToken);
    url.searchParams.set('xsec_source', '');
    return url.toString();
}

/**
 * Shared func-mode implementation. Exported so the rednote adapter can run the
 * same store read against www.rednote.com without duplicating the logic.
 */
export async function runFeed(page, kwargs, webHost) {
    const limit = parseLimit(kwargs.limit);
    await page.goto(`https://${webHost}/explore`);
    // Pinia store hydrates from SSR; give the page a beat to finish
    // bootstrapping before reading the array.
    await page.wait({ time: 2 });
    const data = unwrapEvaluateResult(await page.evaluate(FEEDS_READ_JS));
    if (!data || typeof data !== 'object') {
        throw new CommandExecutionError(`${webHost} feed: unexpected evaluate response`);
    }
    if (data.error) {
        throw new CommandExecutionError(`${webHost} feed: ${data.error}`, `The SPA may still be hydrating; reload ${webHost}/explore and retry.`);
    }
    if (!Array.isArray(data.items)) {
        throw new CommandExecutionError(`${webHost} feed: unexpected items payload shape`);
    }
    const rows = [];
    for (const row of data.items) {
        if (rows.length >= limit)
            break;
        if (!row || typeof row !== 'object') {
            throw new CommandExecutionError(`${webHost} feed: malformed feed item`);
        }
        const id = toCleanString(row.id);
        if (!id) {
            throw new CommandExecutionError(`${webHost} feed: feed item is missing note id`);
        }
        const xsecToken = toCleanString(row.xsecToken);
        if (!xsecToken) {
            throw new CommandExecutionError(`${webHost} feed: feed item ${id} is missing xsecToken; cannot build a signed drill-down URL`);
        }
        rows.push({
            id,
            title: toCleanString(row.title),
            type: toCleanString(row.type),
            author: toCleanString(row.author),
            likes: toCleanString(row.likes),
            url: buildFeedNoteUrl(webHost, id, xsecToken),
        });
    }
    if (rows.length === 0) {
        throw new EmptyResultError(`${webHost}/feed`, 'No feed items in the hydrated store.');
    }
    return rows;
}

export const command = cli({
    site: 'xiaohongshu',
    name: 'feed',
    access: 'read',
    description: '小红书首页推荐 Feed (reads hydrated Pinia store)',
    domain: 'www.xiaohongshu.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false, siteSession: 'persistent',
    args: [
        { name: 'limit', type: 'int', default: 20, help: 'Number of items to return' },
    ],
    columns: ['id', 'title', 'author', 'likes', 'type', 'url'],
    func: async (page, kwargs) => {
        const limit = parseLimit(kwargs.limit);
        const rows = [];
        const seen = new Set();
        const cursors = new Set(['']);
        let cursor = '';
        for (let number = 0; number < 100; number++) {
            const data = await callWebApi(page, '/api/sns/web/v1/homefeed', { method: 'POST', body: {
                cursorScore: cursor, num: 30, refreshType: number ? 3 : 1, noteIndex: rows.length,
                unreadBeginNoteId: '', unreadEndNoteId: '', unreadNoteCount: 0, category: 'homefeed_recommend',
                searchKey: '', needNum: 30, imageFormats: ['jpg', 'webp', 'avif'], needFilterImage: false,
            } });
            if (!Array.isArray(data.items)) throw new CommandExecutionError('Xiaohongshu feed omitted items');
            if (!data.items.length) return rows;
            const before = rows.length;
            for (const item of data.items) {
                if (item?.modelType !== 'note') continue;
                const card = item.noteCard;
                if (!item.id || !item.xsecToken || !card?.user || !card.interactInfo) throw new CommandExecutionError('Xiaohongshu feed returned an incomplete note');
                if (seen.has(item.id)) continue;
                seen.add(item.id);
                rows.push({ id: item.id, title: card.displayTitle || '', author: card.user.nickname || card.user.nickName || '',
                    likes: String(card.interactInfo.likedCount ?? 0), type: card.type || '', url: buildFeedNoteUrl('www.xiaohongshu.com', item.id, item.xsecToken) });
                if (rows.length === limit) return rows;
            }
            if (rows.length === before || !data.cursorScore || cursors.has(data.cursorScore)) throw new CommandExecutionError('Xiaohongshu feed repeated or omitted its continuation cursor');
            cursors.add(data.cursorScore);
            cursor = data.cursorScore;
        }
        throw new CommandExecutionError('Xiaohongshu feed reached its page limit');
    },
});
