import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseNoteId, buildNoteUrl } from './note-helpers.js';
import { NOTE_EXTRACT_JS } from './note.js';

function runExtract(html) {
    const dom = new JSDOM(html, {
        url: 'https://www.xiaohongshu.com/explore/69c131c9000000002800be4c?xsec_token=abc',
        runScripts: 'outside-only',
    });
    return dom.window.eval(NOTE_EXTRACT_JS);
}

const RECOMMEND_FEED = `
    <div class="feeds-container">
      <section class="note-item"><a class="title"><span>不懂为什么...</span></a></section>
      <section class="note-item"><a class="title"><span>另一篇推荐笔记</span></a></section>
    </div>`;

function notePage({ title = '', desc = '正文在这里', author = '芭比 Q' } = {}) {
    return `<!doctype html><html><body>
      <div id="noteContainer">
        <div class="author-wrapper"><span class="username">${author}</span></div>
        ${title ? `<div id="detail-title">${title}</div>` : ''}
        <div id="detail-desc">${desc}</div>
        <div class="interact-container">
          <span class="like-wrapper"><span class="count">10</span></span>
          <span class="collect-wrapper"><span class="count">1</span></span>
          <span class="chat-wrapper"><span class="count">15</span></span>
        </div>
      </div>
      ${RECOMMEND_FEED}
    </body></html>`;
}
describe('parseNoteId', () => {
    it('extracts ID from /explore/ URL', () => {
        expect(parseNoteId('https://www.xiaohongshu.com/explore/69c131c9000000002800be4c')).toBe('69c131c9000000002800be4c');
    });
    it('extracts ID from /search_result/ URL with query params', () => {
        expect(parseNoteId('https://www.xiaohongshu.com/search_result/69c131c9000000002800be4c?xsec_token=abc')).toBe('69c131c9000000002800be4c');
    });
    it('extracts ID from /note/ URL', () => {
        expect(parseNoteId('https://www.xiaohongshu.com/note/69c131c9000000002800be4c')).toBe('69c131c9000000002800be4c');
    });
    it('extracts ID from signed /user/profile/<user>/<note> URL', () => {
        expect(parseNoteId('https://www.xiaohongshu.com/user/profile/user123/69c131c9000000002800be4c?xsec_token=abc&xsec_source=pc_user')).toBe('69c131c9000000002800be4c');
    });
    it('returns raw string when no URL pattern matches', () => {
        expect(parseNoteId('69c131c9000000002800be4c')).toBe('69c131c9000000002800be4c');
    });
    it('trims whitespace', () => {
        expect(parseNoteId('  69c131c9000000002800be4c  ')).toBe('69c131c9000000002800be4c');
    });
});
describe('buildNoteUrl', () => {
    it('returns full URL as-is when given https URL', () => {
        const url = 'https://www.xiaohongshu.com/search_result/abc123?xsec_token=tok';
        expect(buildNoteUrl(url)).toBe(url);
    });
    it('rejects signed URLs from non-xiaohongshu hosts', () => {
        expect(() => buildNoteUrl('https://example.com/?xsec_token=tok')).toThrow(/xiaohongshu/i);
    });
    it('rejects signed URLs with an empty xsec_token value', () => {
        expect(() => buildNoteUrl('https://www.xiaohongshu.com/search_result/69c131c9000000002800be4c?xsec_token=')).toThrow(/xsec_token|signed url/i);
    });
    it('rejects bare note IDs because xiaohongshu now requires a signed URL', () => {
        expect(() => buildNoteUrl('abc123')).toThrow(/xsec_token|signed url/i);
    });
});

describe('NOTE_EXTRACT_JS', () => {
    it('reports an empty title for a note that has none, ignoring recommendation cards', () => {
        const d = runExtract(notePage());
        // Regression: the unscoped '#detail-title, .title' selector used to fall
        // through to the recommendation feed and return '不懂为什么...' here.
        expect(d.title).toBe('');
        expect(d.desc).toBe('正文在这里');
        expect(d.author).toBe('芭比 Q');
        expect(d.likes).toBe('10');
        expect(d.collects).toBe('1');
        expect(d.comments).toBe('15');
    });

    it('still reads the note title when the note has one', () => {
        const d = runExtract(notePage({ title: '尚界Z7实车体验' }));
        expect(d.title).toBe('尚界Z7实车体验');
        expect(d.author).toBe('芭比 Q');
    });

    it('falls back to document scope when #noteContainer is absent', () => {
        const d = runExtract(`<!doctype html><html><body>
          <div id="detail-title">老版布局</div>
          <div id="detail-desc">正文</div>
          <div class="author-wrapper"><span class="username">作者</span></div>
        </body></html>`);
        expect(d.title).toBe('老版布局');
        expect(d.author).toBe('作者');
    });

    it('does not use document-level recommendation title or desc when #noteContainer is absent', () => {
        const d = runExtract(`<!doctype html><html><body>
          <div class="feeds-container">
            <section class="note-item">
              <a class="title"><span>推荐卡片标题</span></a>
              <div class="desc">推荐卡片正文</div>
            </section>
          </div>
          <div class="author-wrapper"><span class="username">作者</span></div>
        </body></html>`);
        expect(d.title).toBe('');
        expect(d.desc).toBe('');
        expect(d.author).toBe('作者');
    });
});
