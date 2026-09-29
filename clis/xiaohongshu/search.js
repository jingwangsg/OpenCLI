/**
 * Xiaohongshu search through the signed web API.
 *
 * load-bearing: buildScrollUntilJs, buildSearchExtractJs and noteIdToDate stay
 * exported because rednote/search.js still drives the DOM search with them.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { callWebApi } from './web-api.js';

const SEARCH_FILTERS = [
    {
        arg: 'sort', group: '排序依据', defaultValue: 'comprehensive',
        options: { comprehensive: '综合', latest: '最新', 'most-liked': '最多点赞', 'most-commented': '最多评论', 'most-collected': '最多收藏' },
    },
    {
        arg: 'note-type', group: '笔记类型', defaultValue: 'all',
        options: { all: '不限', video: '视频', image: '图文' },
    },
    {
        arg: 'publish-time', group: '发布时间', defaultValue: 'anytime',
        options: { anytime: '不限', day: '一天内', week: '一周内', 'half-year': '半年内' },
    },
    {
        arg: 'scope', group: '搜索范围', defaultValue: 'all',
        options: { all: '不限', seen: '已看过', unseen: '未看过', following: '已关注' },
    },
    {
        arg: 'location', group: '位置距离', defaultValue: 'all',
        options: { all: '不限', 'same-city': '同城', nearby: '附近' },
    },
];

/**
 * Extract approximate publish date from a Xiaohongshu note URL.
 * XHS note IDs follow MongoDB ObjectID format where the first 8 hex
 * characters encode a Unix timestamp (the moment the ID was generated,
 * which closely matches publish time but is not an official API field).
 * e.g. "697f6c74..." → 0x697f6c74 = 1769958516 → 2026-02-01
 */
export function noteIdToDate(url) {
    const match = url.match(/\/(?:search_result|explore|note)\/([0-9a-f]{24})(?=[?#/]|$)/i);
    if (!match)
        return '';
    const hex = match[1].substring(0, 8);
    const ts = parseInt(hex, 16);
    if (!ts || ts < 1_000_000_000 || ts > 4_000_000_000)
        return '';
    // Offset by UTC+8 (China Standard Time) so the date matches what XHS users see
    return new Date((ts + 8 * 3600) * 1000).toISOString().slice(0, 10);
}
export function stripXhsAuthorDateSuffix(value) {
    const text = (value || '').replace(/\s+/g, ' ').trim();
    const stripped = text.replace(/\s*(?:\d{1,2}天前|\d+小时前|\d+分钟前|\d+秒前|刚刚|昨天|前天|\d+周前|\d+个月前|\d{1,2}-\d{1,2}|\d{4}-\d{1,2}-\d{1,2})$/u, '').trim();
    return stripped || text;
}

function extractSearchRows(webHost) {
    const normalizeUrl = (href) => {
        if (!href)
            return '';
        try {
            const parsed = new URL(href, `https://${webHost}/`);
            if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== webHost.toLowerCase())
                return '';
            return parsed.href;
        }
        catch {
            return '';
        }
    };
    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const isVisibleNote = (el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0)
            return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const results = [];
    const seen = new Set();
    // Note containers: legacy `section.note-item` first, fallback to any
    // `<section>` wrapping a search-result/explore link (#1506 reports the
    // class being dropped on some xhs renders).
    const collectNoteCards = () => {
        const classMatches = document.querySelectorAll('section.note-item');
        if (classMatches.length > 0)
            return classMatches;
        const sections = new Set();
        for (const a of document.querySelectorAll('a[href*="/search_result/"], a[href*="/explore/"]')) {
            const section = a.closest('section');
            if (section)
                sections.add(section);
        }
        return sections;
    };
    for (const el of collectNoteCards()) {
        // Skip "related searches" sections
        if (el.classList?.contains('query-note-item'))
            continue;
        if (!isVisibleNote(el))
            continue;
        const titleEl = el.querySelector('.title, .note-title, a.title, .footer .title span');
        const nameEl = el.querySelector('a.author .name, .author-name, .nick-name, .name');
        const authorWrapEl = el.querySelector('a.author');
        let author = cleanText(nameEl?.textContent || '');
        if (!author && authorWrapEl) {
            const nameChild = authorWrapEl.querySelector('.name');
            author = nameChild ? cleanText(nameChild.textContent || '') : stripXhsAuthorDateSuffix(authorWrapEl.textContent || '');
        }
        const likesEl = el.querySelector('.count, .like-count, .like-wrapper .count');
        // Prefer search_result link (preserves xsec_token) over generic /explore/ link
        const detailLinkEl = el.querySelector('a.cover.mask') ||
            el.querySelector('a[href*="/search_result/"]') ||
            el.querySelector('a[href*="/explore/"]') ||
            el.querySelector('a[href*="/note/"]');
        const authorLinkEl = el.querySelector('a.author, a[href*="/user/profile/"]');
        const url = normalizeUrl(detailLinkEl?.getAttribute('href') || '');
        if (!url)
            continue;
        const key = url;
        if (seen.has(key))
            continue;
        seen.add(key);
        // Fallback title: the new bare-section render keeps the note caption
        // inside the search_result anchor's first span, not in a class-named
        // .title element. Pull from there when the class-based pick is empty.
        let title = cleanText(titleEl?.textContent || '');
        if (!title) {
            const captionSpan = detailLinkEl?.querySelector('span');
            title = cleanText(captionSpan?.textContent || '');
        }
        results.push({
            title,
            author,
            likes: cleanText(likesEl?.textContent || '0'),
            url,
            author_url: normalizeUrl(authorLinkEl?.getAttribute('href') || ''),
        });
    }
    return results;
}
export function parseLimit(raw) {
    const parsed = Number(raw ?? 20);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        throw new ArgumentError(`--limit must be an integer between 1 and 100, got ${JSON.stringify(raw)}`);
    }
    if (parsed < 1 || parsed > 100) {
        throw new ArgumentError(`--limit must be between 1 and 100, got ${parsed}`);
    }
    return parsed;
}

function resolveSearchFilters(kwargs) {
    return SEARCH_FILTERS.map((definition) => {
        const value = kwargs[definition.arg] ?? definition.defaultValue;
        const option = typeof value === 'string' ? definition.options[value] : undefined;
        if (!option) {
            throw new ArgumentError(
                `--${definition.arg} must be one of: ${Object.keys(definition.options).join(', ')}, got ${JSON.stringify(value)}`,
            );
        }
        return { group: definition.group, option };
    });
}
/**
 * Build a "scroll until enough or plateaued" IIFE used in place of a fixed
 * `autoScroll({ times: N })`. Xiaohongshu's search results page lazy-loads
 * ~5-7 notes per scroll, so the previous `times: 2` capped extraction at
 * ~13 items regardless of `--limit` (see #1471). This helper drives scrolls
 * dynamically:
 *
 *   - count visible `section.note-item` rows (excluding related-search
 *     `.query-note-item` rows)
 *   - if count >= targetCount → break (got enough)
 *   - if two consecutive scrolls add no new rows → break (DOM plateaued,
 *     no more lazy-load available)
 *   - hard cap at `maxScrolls` iterations (default 15) to bound runtime
 *
 * Exported so the rednote adapter (same DOM shape) can reuse it.
 */
export function buildScrollUntilJs(targetCount, maxScrolls = 15) {
    if (!Number.isSafeInteger(targetCount) || targetCount < 1) {
        throw new ArgumentError(`targetCount must be a positive integer, got ${JSON.stringify(targetCount)}`);
    }
    if (!Number.isSafeInteger(maxScrolls) || maxScrolls < 1) {
        throw new ArgumentError(`maxScrolls must be a positive integer, got ${JSON.stringify(maxScrolls)}`);
    }
    return `
      (async () => {
        const isVisibleNote = (el) => {
          if (el.classList.contains('query-note-item')) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          const style = getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        };
        // Note containers: legacy \`section.note-item\` first, fallback to
        // any \`<section>\` that wraps a search-result/explore note link
        // (#1506 reports the class being dropped on some xhs renders).
        const collectNoteCards = () => {
          const classMatches = document.querySelectorAll('section.note-item');
          if (classMatches.length > 0) return classMatches;
          const sections = new Set();
          for (const a of document.querySelectorAll('a[href*="/search_result/"], a[href*="/explore/"]')) {
            const section = a.closest('section');
            if (section) sections.add(section);
          }
          return sections;
        };
        const countItems = () => {
          let count = 0;
          for (const el of collectNoteCards()) {
            if (isVisibleNote(el)) count++;
          }
          return count;
        };

        let lastCount = countItems();
        let plateauRounds = 0;
        for (let i = 0; i < ${maxScrolls}; i++) {
          if (countItems() >= ${targetCount}) break;
          const lastHeight = document.body.scrollHeight;
          window.scrollTo(0, lastHeight);
          await new Promise((resolve) => {
            let to;
            const ob = new MutationObserver(() => {
              if (document.body.scrollHeight > lastHeight) {
                clearTimeout(to);
                ob.disconnect();
                setTimeout(resolve, 200);
              }
            });
            ob.observe(document.body, { childList: true, subtree: true });
            to = setTimeout(() => { ob.disconnect(); resolve(null); }, 2500);
          });
          const newCount = countItems();
          if (newCount === lastCount) {
            plateauRounds++;
            if (plateauRounds >= 2) break;
          } else {
            plateauRounds = 0;
            lastCount = newCount;
          }
        }
        return countItems();
      })()
    `;
}
/**
 * Build the search-result extraction IIFE. The web host is baked into the
 * `normalizeUrl` fallback so relative `/explore/...` hrefs resolve to a full
 * URL on the calling site. Exported so the rednote adapter can call it with
 * `www.rednote.com` without duplicating the selector logic.
 */
export function buildSearchExtractJs(webHost) {
    return `
      (() => {
        const stripXhsAuthorDateSuffix = ${stripXhsAuthorDateSuffix.toString()};
        const extractSearchRows = ${extractSearchRows.toString()};
        return extractSearchRows(${JSON.stringify(webHost)});
      })()
    `;
}

export const command = cli({
    site: 'xiaohongshu',
    name: 'search',
    access: 'read',
    description: '搜索小红书笔记',
    domain: 'www.xiaohongshu.com',
    strategy: Strategy.COOKIE,
    navigateBefore: false, siteSession: 'persistent',
    args: [
        { name: 'query', required: true, positional: true, help: 'Search keyword' },
        { name: 'limit', type: 'int', default: 20, help: 'Number of results' },
        { name: 'sort', type: 'string', default: 'comprehensive', choices: ['comprehensive', 'latest', 'most-liked', 'most-commented', 'most-collected'], help: 'Sort order' },
        { name: 'note-type', type: 'string', default: 'all', choices: ['all', 'video', 'image'], help: 'Note type' },
        { name: 'publish-time', type: 'string', default: 'anytime', choices: ['anytime', 'day', 'week', 'half-year'], help: 'Publish time range' },
        { name: 'scope', type: 'string', default: 'all', choices: ['all', 'seen', 'unseen', 'following'], help: 'Search scope' },
        { name: 'location', type: 'string', default: 'all', choices: ['all', 'same-city', 'nearby'], help: 'Location distance' },
    ],
    columns: ['rank', 'title', 'author', 'likes', 'published_at', 'url'],
    func: async (page, kwargs) => {
        const limit = parseLimit(kwargs.limit);
        const requested = resolveSearchFilters(kwargs);
        const keyword = String(kwargs.query || '').trim();
        if (!keyword) throw new ArgumentError('Search query must not be empty');
        const available = await callWebApi(page, '/api/sns/web/v1/search/filter', { params: { keyword, searchId: '' } });
        if (!Array.isArray(available.filters)) throw new CommandExecutionError('Xiaohongshu search omitted available filters');
        const filters = requested.map((request) => {
            const group = available.filters.find((filter) => filter.name === request.group);
            const tag = group?.filterTags?.find((tag) => tag.name === request.option);
            if (!group?.id || !tag?.id) throw new CommandExecutionError(`Xiaohongshu no longer offers filter ${request.group}: ${request.option}`);
            return { type: group.id, tags: [tag.id] };
        });
        const rows = [];
        const seen = new Set();
        for (let number = 1; number <= 100; number++) {
            const data = await callWebApi(page, '/api/sns/web/v2/search/notes', { method: 'POST', body: {
                keyword, page: number, pageSize: 20, searchId: '', sort: 'general', noteType: 0,
                extFlags: [], filters, geo: '', imageFormats: ['jpg', 'webp', 'avif'],
            } });
            if (!Array.isArray(data.items) || typeof data.hasMore !== 'boolean') throw new CommandExecutionError('Xiaohongshu search returned malformed pagination');
            const before = rows.length;
            for (const item of data.items) {
                if (item?.modelType !== 'note') continue;
                const card = item.noteCard;
                if (!/^[a-f0-9]{24}$/i.test(item.id || '') || !item.xsecToken || !card?.user || !card.interactInfo) {
                    throw new CommandExecutionError('Xiaohongshu search returned an incomplete note');
                }
                if (seen.has(item.id)) continue;
                seen.add(item.id);
                const url = new URL(`https://www.xiaohongshu.com/explore/${item.id}`);
                url.search = new URLSearchParams({ xsec_token: item.xsecToken, xsec_source: 'pc_search' }).toString();
                rows.push({ rank: rows.length + 1, title: card.displayTitle || '', author: card.user.nickname || card.user.nickName || '',
                    likes: String(card.interactInfo.likedCount ?? 0), published_at: noteIdToDate(url.href), url: url.href });
                if (rows.length === limit) return rows;
            }
            if (!data.hasMore) return rows;
            if (rows.length === before) throw new CommandExecutionError('Xiaohongshu search repeated a page or returned no notes while advertising more');
        }
        throw new CommandExecutionError('Xiaohongshu search reached its page limit before satisfying the requested limit');
    },
});
