import { CommandExecutionError } from '@jackwener/opencli/errors';

export function parseCommentLimit(raw, fallback = 20) {
    const n = Number(raw);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(1, Math.min(Math.floor(n), 50));
}

export function parseXhsLikeCountText(value) {
    const integerRe = /^(?:\d+|\d{1,3}(?:[,，]\d{3})+)\+?$/u;
    const shortformRe = /^((?:\d+|\d{1,3}(?:[,，]\d{3})+)(?:\.\d+)?)([wWkK万千])\+?$/u;
    const raw = String(value ?? '').replace(/\s+/g, '');
    if (!raw)
        return 0;
    if (integerRe.test(raw))
        return Number(raw.replace(/[,+，]/g, ''));
    const short = raw.match(shortformRe);
    if (!short)
        return 0;
    const numeric = Number(short[1].replace(/[,，]/g, ''));
    if (!Number.isFinite(numeric))
        return 0;
    const unit = short[2].toLowerCase();
    const multiplier = unit === 'w' || unit === '万' ? 10000 : 1000;
    return Math.round(numeric * multiplier);
}

function normalizeOptionalString(value, field, commandName) {
    if (value == null)
        return '';
    if (typeof value !== 'string') {
        throw new CommandExecutionError(`${commandName}: malformed comment row ${field}`);
    }
    return value;
}

export function normalizeCommentImages(value, commandName) {
    if (value == null)
        return [];
    if (!Array.isArray(value)) {
        throw new CommandExecutionError(`${commandName}: malformed comment row images`);
    }
    const urls = [];
    for (const raw of value) {
        if (typeof raw !== 'string') {
            throw new CommandExecutionError(`${commandName}: malformed comment row image URL`);
        }
        const trimmed = raw.trim();
        let parsed;
        try {
            parsed = new URL(trimmed);
        }
        catch {
            throw new CommandExecutionError(`${commandName}: malformed comment row image URL`);
        }
        if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) {
            throw new CommandExecutionError(`${commandName}: malformed comment row image URL`);
        }
        const href = parsed.toString();
        if (!urls.includes(href))
            urls.push(href);
    }
    return urls;
}

export function normalizeCommentRows(value, commandName = 'xiaohongshu/comments') {
    if (value == null)
        return [];
    if (!Array.isArray(value)) {
        throw new CommandExecutionError(`${commandName}: malformed comments payload`);
    }
    return value.map((row, index) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            throw new CommandExecutionError(`${commandName}: malformed comment row at index ${index}`);
        }
        const text = normalizeOptionalString(row.text, 'text', commandName);
        if (!text) {
            throw new CommandExecutionError(`${commandName}: malformed comment row text`);
        }
        const likes = Number(row.likes);
        if (!Number.isInteger(likes) || likes < 0) {
            throw new CommandExecutionError(`${commandName}: malformed comment row likes`);
        }
        if (typeof row.is_reply !== 'boolean') {
            throw new CommandExecutionError(`${commandName}: malformed comment row is_reply`);
        }
        return {
            author: normalizeOptionalString(row.author, 'author', commandName),
            authorHrefRaw: normalizeOptionalString(row.authorHrefRaw, 'authorHrefRaw', commandName),
            text,
            likes,
            time: normalizeOptionalString(row.time, 'time', commandName),
            is_reply: row.is_reply,
            reply_to: normalizeOptionalString(row.reply_to, 'reply_to', commandName),
            images: normalizeCommentImages(row.images, commandName),
        };
    });
}


const XHS_PROFILE_HREF_SELECTOR = '.author-wrapper a[href*="/user/profile/"], a.name[href*="/user/profile/"], a.user-name[href*="/user/profile/"], a[href*="/user/profile/"]';

/**
 * Host-agnostic IIFE that scrolls a note's comment list and extracts
 * top-level comments (and optionally nested 楼中楼 replies). Exported so
 * the rednote adapter can reuse the exact same selector chain.
 */
export function buildCommentsExtractJs(withReplies, limit = 20) {
    const parseLikeCountText = parseXhsLikeCountText.toString();
    return `
      (async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms))
        const withReplies = ${withReplies}
        const targetCount = ${Number(limit) || 20}

        // Check login state
        const bodyText = document.body?.innerText || ''
        const loginWall = /登录后查看|请登录/.test(bodyText)
        const securityBlock = /安全限制|访问链接异常/.test(bodyText)
          || /website-login\\/error|error_code=300017|error_code=300031/.test(location.href)

        // Scroll to trigger comment loading. Xiaohongshu loads comments in
        // small async batches via IntersectionObserver, and depending on the
        // page layout / viewport the actual scrollable ancestor can be
        // .note-scroller, .container, or the document itself — so each round
        // drives all of them plus scrollIntoView on the last loaded comment,
        // which works regardless of which element actually owns the scrollbar.
        // A single stalled round doesn't mean the list is exhausted — keep
        // going until growth stalls for several consecutive rounds, we've
        // loaded enough top-level comments to satisfy --limit, or we hit the
        // hard round cap.
        const scroller = document.querySelector('.note-scroller') || document.querySelector('.container')
        const driveScroll = () => {
          if (scroller) scroller.scrollTo(0, scroller.scrollHeight)
          const comments = document.querySelectorAll('.parent-comment')
          const last = comments[comments.length - 1]
          if (last && typeof last.scrollIntoView === 'function') last.scrollIntoView({ block: 'end' })
          if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
            window.scrollTo(0, document.body.scrollHeight)
          }
        }
        {
          let stall = 0
          for (let i = 0; i < 60; i++) {
            const beforeCount = document.querySelectorAll('.parent-comment').length
            if (beforeCount >= targetCount) break
            driveScroll()
            await wait(1000 + Math.random() * 1200)
            const afterCount = document.querySelectorAll('.parent-comment').length
            if (afterCount <= beforeCount) {
              stall++
              if (stall >= 6) break
            } else {
              stall = 0
            }
          }
        }

        const clean = (el) => (el?.textContent || '').replace(/\\s+/g, ' ').trim()
        const parseLikeCountText = ${parseLikeCountText}
        const parseLikes = (el) => {
          return parseLikeCountText(clean(el))
        }
        const HREF_SELECTOR = ${JSON.stringify(XHS_PROFILE_HREF_SELECTOR)}
        const extractAuthorHref = (el) => {
          if (!el) return ''
          const anchor = el.querySelector(HREF_SELECTOR)
          return anchor ? (anchor.getAttribute('href') || '') : ''
        }
        // Attached comment photos, excluding avatars, inline emoji, badges, and
        // other UI images. Only images inside comment/reply media containers are
        // projected as media evidence.
        const extractImages = (el) => {
          if (!el) return []
          const urls = []
          el.querySelectorAll('img').forEach(img => {
            if (img.classList.contains('avatar-item')) return
            if (img.closest('.content, .note-text')) return
            if (!img.closest('.comment-pic, .reply-pic, .comment-image, .reply-image, .comment-img, .reply-img, [class*="comment-pic"], [class*="reply-pic"], [class*="comment-image"], [class*="reply-image"]')) return
            const src = img.currentSrc || img.src || img.getAttribute('data-src') || ''
            if (src && !urls.includes(src)) urls.push(src)
          })
          return urls
        }
        const expandReplyThreads = async (root) => {
          if (!withReplies || !root) return
          const clickedTexts = new Set()
          for (let round = 0; round < 3; round++) {
            const expanders = Array.from(root.querySelectorAll('button, [role="button"], span, div')).filter(el => {
              if (!(el instanceof HTMLElement)) return false
              const text = clean(el)
              if (!text || text.length > 24) return false
              if (!/(展开|更多回复|全部回复|查看.*回复|共\\d+条回复)/.test(text)) return false
              if (clickedTexts.has(text)) return false
              return true
            })
            if (!expanders.length) break
            for (const el of expanders) {
              const text = clean(el)
              el.click()
              clickedTexts.add(text)
              await wait(200 + Math.random() * 300)
            }
          }
        }

        const results = []
        const parents = document.querySelectorAll('.parent-comment')
        for (const p of parents) {
          const item = p.querySelector('.comment-item')
          if (!item) continue

          const author = clean(item.querySelector('.author-wrapper .name, .user-name'))
          const authorHrefRaw = extractAuthorHref(item)
          const text = clean(item.querySelector('.content, .note-text'))
          const likes = parseLikes(item.querySelector('.count'))
          const time = clean(item.querySelector('.date, .time'))
          const images = extractImages(item)

          if (!text) continue
          results.push({ author, authorHrefRaw, text, likes, time, is_reply: false, reply_to: '', images })

          // Extract nested replies (楼中楼)
          if (withReplies) {
            await expandReplyThreads(p)
            p.querySelectorAll('.reply-container .comment-item-sub, .sub-comment-list .comment-item').forEach(sub => {
              const sAuthor = clean(sub.querySelector('.name, .user-name'))
              const sAuthorHrefRaw = extractAuthorHref(sub)
              const sContent = sub.querySelector('.content, .note-text')
              const sText = clean(sContent)
              // Xiaohongshu renders the direct target only for reply-to-reply
              // rows (回复 <span class="nickname">Bob</span> : ...). A nested
              // row without that marker is a direct reply to the thread root.
              const sReplyTo = clean(sContent?.querySelector(':scope > .nickname')) || author
              const sLikes = parseLikes(sub.querySelector('.count'))
              const sTime = clean(sub.querySelector('.date, .time'))
              const sImages = extractImages(sub)
              if (!sText) return
              results.push({ author: sAuthor, authorHrefRaw: sAuthorHrefRaw, text: sText, likes: sLikes, time: sTime, is_reply: true, reply_to: sReplyTo, images: sImages })
            })
          }
        }

        return { pageUrl: location.href, securityBlock, loginWall, results }
      })()
    `;
}
