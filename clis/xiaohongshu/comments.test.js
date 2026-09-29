import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildCommentsExtractJs, parseXhsLikeCountText } from './comment-helpers.js';

async function runCommentsExtract(html, withReplies = false) {
    const dom = new JSDOM(html, { url: 'https://www.xiaohongshu.com/search_result/abc123?xsec_token=tok' });
    const hadDocument = Object.hasOwn(globalThis, 'document');
    const hadLocation = Object.hasOwn(globalThis, 'location');
    const hadWindow = Object.hasOwn(globalThis, 'window');
    const hadHTMLElement = Object.hasOwn(globalThis, 'HTMLElement');
    const previousDocument = globalThis.document;
    const previousLocation = globalThis.location;
    const previousWindow = globalThis.window;
    const previousHTMLElement = globalThis.HTMLElement;
    globalThis.document = dom.window.document;
    globalThis.location = dom.window.location;
    globalThis.window = dom.window;
    globalThis.HTMLElement = dom.window.HTMLElement;
    try {
        // limit=1 so the scroll-loading loop's initial "already have enough"
        // check short-circuits instead of burning through stall retries — the
        // JSDOM fixtures below are fully static, there's nothing more to load.
        return await eval(buildCommentsExtractJs(withReplies, 1));
    } finally {
        if (hadDocument) globalThis.document = previousDocument;
        else delete globalThis.document;
        if (hadLocation) globalThis.location = previousLocation;
        else delete globalThis.location;
        if (hadWindow) globalThis.window = previousWindow;
        else delete globalThis.window;
        if (hadHTMLElement) globalThis.HTMLElement = previousHTMLElement;
        else delete globalThis.HTMLElement;
        dom.window.close();
    }
}

describe('parseXhsLikeCountText', () => {
    it('parses exact integer and shortform like counts', () => {
        expect(parseXhsLikeCountText('0')).toBe(0);
        expect(parseXhsLikeCountText('42')).toBe(42);
        expect(parseXhsLikeCountText('1,234')).toBe(1234);
        expect(parseXhsLikeCountText('1，234+')).toBe(1234);
        expect(parseXhsLikeCountText('2.1w')).toBe(21000);
        expect(parseXhsLikeCountText('1.5万')).toBe(15000);
        expect(parseXhsLikeCountText('1.2k')).toBe(1200);
        expect(parseXhsLikeCountText('3千')).toBe(3000);
        expect(parseXhsLikeCountText(' 2.1 w + ')).toBe(21000);
    });

    it('returns 0 for unknown shapes without overparsing arbitrary text', () => {
        for (const raw of ['', null, undefined, '赞', 'likes 2.1w', '2w人', '1,23', '1.2.3k', '.', '1.5']) {
            expect(parseXhsLikeCountText(raw)).toBe(0);
        }
    });
});

describe('buildCommentsExtractJs (DOM extractor still used by rednote/comments)', () => {
    it('restores JSDOM globals after DOM extraction', async () => {
        const keys = ['document', 'location', 'window', 'HTMLElement'];
        const before = keys.map(key => ({
            key,
            hadOwnProperty: Object.hasOwn(globalThis, key),
            value: Reflect.get(globalThis, key),
        }));

        await runCommentsExtract(`
          <main>
            <section class="parent-comment">
              <div class="comment-item">
                <span class="name">Alice</span>
                <div class="content">Root comment</div>
              </div>
            </section>
          </main>
        `);

        for (const entry of before) {
            expect(Object.hasOwn(globalThis, entry.key)).toBe(entry.hadOwnProperty);
            if (entry.hadOwnProperty) {
                expect(Reflect.get(globalThis, entry.key)).toBe(entry.value);
            }
        }
    });
    it('extracts shortform like counts from the shared xiaohongshu/rednote DOM script', async () => {
        const data = await runCommentsExtract(`
          <main>
            <section class="parent-comment">
              <div class="comment-item">
                <div class="author-wrapper"><span class="name">Alice</span></div>
                <div class="content">Great note</div>
                <span class="count">2.1w</span>
                <span class="date">today</span>
              </div>
            </section>
            <section class="parent-comment">
              <div class="comment-item">
                <span class="user-name">Bob</span>
                <div class="note-text">Malformed count</div>
                <span class="count">likes 2.1w</span>
              </div>
            </section>
          </main>
        `);

        expect(data.results).toEqual([
            { author: 'Alice', authorHrefRaw: '', text: 'Great note', likes: 21000, time: 'today', is_reply: false, reply_to: '', images: [] },
            { author: 'Bob', authorHrefRaw: '', text: 'Malformed count', likes: 0, time: '', is_reply: false, reply_to: '', images: [] },
        ]);
    });

    it('extracts attached comment photos while excluding avatars and inline emoji', async () => {
        const data = await runCommentsExtract(`
          <main>
            <section class="parent-comment">
              <div class="comment-item">
                <div class="author-wrapper">
                  <img class="avatar-item" src="https://sns-avatar-qc.xhscdn.com/avatar/abc.jpg" />
                  <span class="name">Alice</span>
                </div>
                <div class="content">Great note <img class="note-content-emoji" src="https://picasso-static.xiaohongshu.com/fe-platform/emoji.png" /></div>
                <div class="comment-pic"><img src="https://sns-img-qc.xhscdn.com/comment-photo.jpg" /></div>
                <span class="count">1</span>
                <span class="date">today</span>
              </div>
              <div class="reply-container">
                <div class="comment-item-sub">
                  <span class="name">Bob</span>
                  <div class="content">Nice</div>
                  <div class="reply-pic"><img src="https://sns-img-qc.xhscdn.com/reply-photo.jpg" /></div>
                </div>
              </div>
            </section>
          </main>
        `);

        expect(data.results[0]).toMatchObject({ author: 'Alice', text: 'Great note', images: ['https://sns-img-qc.xhscdn.com/comment-photo.jpg'] });
    });
    it('does not project author badges or action icons as comment images', async () => {
        const data = await runCommentsExtract(`
          <main>
            <section class="parent-comment">
              <div class="comment-item">
                <div class="author-wrapper">
                  <span class="name">Alice</span>
                  <img class="author-badge" src="https://sns-img-qc.xhscdn.com/badge.png" />
                </div>
                <div class="content">No attached photo</div>
                <button class="like-action"><img src="https://sns-img-qc.xhscdn.com/like-icon.png" /></button>
              </div>
            </section>
          </main>
        `);

        expect(data.results[0]).toMatchObject({ author: 'Alice', text: 'No attached photo', images: [] });
    });
    it('extracts authorHrefRaw from /user/profile/ anchor wrapping the name', async () => {
        const data = await runCommentsExtract(`
          <main>
            <section class="parent-comment">
              <div class="comment-item">
                <div class="author-wrapper"><a class="name" href="/user/profile/5e8a1b2c3d4e5f6a7b8c9d0e?xsec_token=tok">Alice</a></div>
                <div class="content">Hi</div>
                <span class="count">1</span>
                <span class="date">today</span>
              </div>
            </section>
            <section class="parent-comment">
              <div class="comment-item">
                <a class="user-name" href="https://www.xiaohongshu.com/user/profile/abc123def456">Bob</a>
                <div class="note-text">Hey</div>
              </div>
            </section>
          </main>
        `);
        expect(data.results[0].author).toBe('Alice');
        expect(data.results[0].authorHrefRaw).toBe('/user/profile/5e8a1b2c3d4e5f6a7b8c9d0e?xsec_token=tok');
        expect(data.results[1].author).toBe('Bob');
        expect(data.results[1].authorHrefRaw).toBe('https://www.xiaohongshu.com/user/profile/abc123def456');
    });
    describe('--with-replies', () => {
        it('extracts the direct reply target from nested reply DOM', async () => {
            const data = await runCommentsExtract(`
              <main>
                <section class="parent-comment">
                  <div id="comment-root" class="comment-item">
                    <div class="author-wrapper"><span class="name">Alice</span></div>
                    <div class="content">Root comment</div>
                  </div>
                  <div class="reply-container">
                    <div id="comment-direct" class="comment-item-sub">
                      <div class="author-wrapper"><span class="name">Bob</span></div>
                      <div class="content"><span class="note-text">Direct reply</span></div>
                    </div>
                    <div id="comment-nested" class="comment-item-sub">
                      <div class="author-wrapper"><span class="name">Carol</span></div>
                      <div class="content">
                        <span>回复 </span><span class="nickname">Bob</span> :
                        <span class="note-text">Nested reply</span>
                      </div>
                    </div>
                  </div>
                </section>
              </main>
            `, true);

            expect(data.results).toHaveLength(3);
            expect(data.results[0]).toMatchObject({ author: 'Alice', is_reply: false, reply_to: '' });
            expect(data.results[1]).toMatchObject({ author: 'Bob', is_reply: true, reply_to: 'Alice' });
            expect(data.results[2]).toMatchObject({
                author: 'Carol',
                text: '回复 Bob : Nested reply',
                is_reply: true,
                reply_to: 'Bob',
            });
        });
    });
});
