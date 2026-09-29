import { describe, expect, it, vi } from 'vitest';
const { mockDownloadMedia } = vi.hoisted(() => ({ mockDownloadMedia: vi.fn() }));
vi.mock('@jackwener/opencli/download/media-download', () => ({
    downloadMedia: mockDownloadMedia,
}));
import { getRegistry } from '@jackwener/opencli/registry';
import { JSDOM } from 'jsdom';
import { buildDownloadExtractJs } from './download.js';
describe('xiaohongshu download buildDownloadExtractJs carousel ordering (JSDOM)', () => {
    function runExtract({ html = '', initialState = null, url = 'https://www.xiaohongshu.com/explore/69f9716c000000003601f90e' } = {}) {
        const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url, runScripts: 'outside-only' });
        if (initialState) {
            dom.window.__INITIAL_STATE__ = initialState;
        }
        const js = buildDownloadExtractJs('69f9716c000000003601f90e');
        return dom.window.eval(js);
    }

    it('preserves carousel order from __INITIAL_STATE__ imageList over DOM discovery order', () => {
        const initialState = {
            note: {
                noteDetailMap: {
                    '69f9716c000000003601f90e': {
                        note: {
                            imageList: [
                                { urlDefault: 'https://sns-img-bd.xhscdn.com/canonical-cover.jpg' },
                                { urlDefault: 'https://sns-img-bd.xhscdn.com/canonical-second.jpg' },
                                { urlDefault: 'https://sns-img-bd.xhscdn.com/canonical-third.jpg' },
                            ],
                        },
                    },
                },
            },
        };
        // DOM has the same images but in a DIFFERENT order: repro for #1514.
        const html = `
          <div class="swiper-slide"><img src="https://sns-img-bd.xhscdn.com/canonical-second.jpg" /></div>
          <div class="swiper-slide"><img src="https://sns-img-bd.xhscdn.com/canonical-cover.jpg" /></div>
          <div class="swiper-slide"><img src="https://sns-img-bd.xhscdn.com/canonical-third.jpg" /></div>
        `;
        const result = runExtract({ html, initialState });
        const images = result.media.filter((m) => m.type === 'image');
        expect(images.map((m) => m.url)).toEqual([
            'https://sns-img-bd.xhscdn.com/canonical-cover.jpg',
            'https://sns-img-bd.xhscdn.com/canonical-second.jpg',
            'https://sns-img-bd.xhscdn.com/canonical-third.jpg',
        ]);
    });

    it('prefers urlDefault but falls back to urlPre / url / infoList.WB_DFT / infoList[0]', () => {
        const initialState = {
            note: {
                noteDetailMap: {
                    '69f9716c000000003601f90e': {
                        note: {
                            imageList: [
                                { urlDefault: 'https://sns-img-bd.xhscdn.com/a.jpg' },
                                { urlPre: 'https://sns-img-bd.xhscdn.com/b.jpg' },
                                { url: 'https://sns-img-bd.xhscdn.com/c.jpg' },
                                { infoList: [{ imageScene: 'WB_PRV', url: 'https://sns-img-bd.xhscdn.com/d-low.jpg' }, { imageScene: 'WB_DFT', url: 'https://sns-img-bd.xhscdn.com/d.jpg' }] },
                                { infoList: [{ url: 'https://sns-img-bd.xhscdn.com/e.jpg' }] },
                            ],
                        },
                    },
                },
            },
        };
        const result = runExtract({ initialState });
        const urls = result.media.filter((m) => m.type === 'image').map((m) => m.url);
        expect(urls).toEqual([
            'https://sns-img-bd.xhscdn.com/a.jpg',
            'https://sns-img-bd.xhscdn.com/b.jpg',
            'https://sns-img-bd.xhscdn.com/c.jpg',
            'https://sns-img-bd.xhscdn.com/d.jpg',
            'https://sns-img-bd.xhscdn.com/e.jpg',
        ]);
    });

    it('strips imageView resize params + query strings from canonical urls', () => {
        const initialState = {
            note: {
                noteDetailMap: {
                    '69f9716c000000003601f90e': {
                        note: {
                            imageList: [
                                { urlDefault: 'https://sns-img-bd.xhscdn.com/raw/imageView2/2/w/1080/cover.jpg?expires=123' },
                            ],
                        },
                    },
                },
            },
        };
        const result = runExtract({ initialState });
        const urls = result.media.filter((m) => m.type === 'image').map((m) => m.url);
        expect(urls).toEqual(['https://sns-img-bd.xhscdn.com/raw/cover.jpg']);
    });

    it('falls back to DOM extraction when __INITIAL_STATE__ omits imageList', () => {
        const html = `
          <div class="swiper-slide"><img src="https://sns-img-bd.xhscdn.com/dom-1.jpg" /></div>
          <div class="swiper-slide"><img src="https://sns-img-bd.xhscdn.com/dom-2.jpg" /></div>
        `;
        const result = runExtract({ html });
        const urls = result.media.filter((m) => m.type === 'image').map((m) => m.url);
        expect(urls).toEqual([
            'https://sns-img-bd.xhscdn.com/dom-1.jpg',
            'https://sns-img-bd.xhscdn.com/dom-2.jpg',
        ]);
    });

    it('skips non-xhscdn / non-xiaohongshu / non-rednote urls in initial state', () => {
        const initialState = {
            note: {
                noteDetailMap: {
                    '69f9716c000000003601f90e': {
                        note: {
                            imageList: [
                                { urlDefault: 'https://sns-img-bd.xhscdn.com/keep.jpg' },
                                { urlDefault: 'https://imgur.com/drop.jpg' },
                                { urlDefault: '' },
                            ],
                        },
                    },
                },
            },
        };
        const result = runExtract({ initialState });
        const urls = result.media.filter((m) => m.type === 'image').map((m) => m.url);
        expect(urls).toEqual(['https://sns-img-bd.xhscdn.com/keep.jpg']);
    });

    it('does not run DOM fallback when initial state yielded any image (preserves canonical order)', () => {
        const initialState = {
            note: {
                noteDetailMap: {
                    '69f9716c000000003601f90e': {
                        note: {
                            imageList: [
                                { urlDefault: 'https://sns-img-bd.xhscdn.com/canonical-only.jpg' },
                            ],
                        },
                    },
                },
            },
        };
        const html = `
          <div class="swiper-slide"><img src="https://sns-img-bd.xhscdn.com/dom-extra.jpg" /></div>
        `;
        const result = runExtract({ html, initialState });
        const urls = result.media.filter((m) => m.type === 'image').map((m) => m.url);
        expect(urls).toEqual(['https://sns-img-bd.xhscdn.com/canonical-only.jpg']);
    });

    it('uses only the current note entry from multi-note initial state maps', () => {
        const initialState = {
            note: {
                noteDetailMap: {
                    othernote0000000000000001: {
                        note: {
                            imageList: [{ urlDefault: 'https://sns-img-bd.xhscdn.com/other.jpg' }],
                            video: { url: 'https://sns-video-bd.xhscdn.com/other.mp4' },
                        },
                    },
                    '69f9716c000000003601f90e': {
                        note: {
                            imageList: [
                                { urlDefault: 'https://sns-img-bd.xhscdn.com/current-1.jpg' },
                                { urlDefault: 'https://sns-img-bd.xhscdn.com/current-2.jpg' },
                            ],
                            video: { url: 'https://sns-video-bd.xhscdn.com/current.mp4' },
                        },
                    },
                },
            },
        };
        const result = runExtract({ initialState });
        const images = result.media.filter((m) => m.type === 'image').map((m) => m.url);
        const videos = result.media.filter((m) => m.type === 'video').map((m) => m.url);
        expect(images).toEqual([
            'https://sns-img-bd.xhscdn.com/current-1.jpg',
            'https://sns-img-bd.xhscdn.com/current-2.jpg',
        ]);
        expect(videos).toEqual(['https://sns-video-bd.xhscdn.com/current.mp4']);
    });

    it('still resolves videos from __INITIAL_STATE__ alongside the image fix', () => {
        const initialState = {
            note: {
                noteDetailMap: {
                    '69f9716c000000003601f90e': {
                        note: {
                            imageList: [{ urlDefault: 'https://sns-img-bd.xhscdn.com/cover.jpg' }],
                            video: { url: 'https://sns-video-bd.xhscdn.com/test.mp4' },
                        },
                    },
                },
            },
        };
        const result = runExtract({ initialState });
        const images = result.media.filter((m) => m.type === 'image').map((m) => m.url);
        const videos = result.media.filter((m) => m.type === 'video').map((m) => m.url);
        expect(images).toEqual(['https://sns-img-bd.xhscdn.com/cover.jpg']);
        expect(videos).toEqual(['https://sns-video-bd.xhscdn.com/test.mp4']);
        expect(result.media.map((m) => m.type)).toEqual(['video', 'image']);
    });
});

describe('xiaohongshu API media download', () => {
    const id = '69fd9dd8000000002301f502';
    const input = `https://www.xiaohongshu.com/explore/${id}?xsec_token=test-token`;
    const apiPage = (note) => ({
        goto: vi.fn(), click: vi.fn(), getCookies: vi.fn(), tabs: vi.fn().mockResolvedValue([]),
        evaluate: vi.fn(async (fn) => fn.toString().includes('location.origin') ? true : { ok: true, data: { items: [{ noteCard: {
            noteId: id, title: 'Title', desc: 'Content', user: { nickname: 'Author' }, interactInfo: {}, type: 'normal', ...note,
        } }] } }),
    });
    it('keeps API carousel order and sends no main-site cookies to the CDN', async () => {
        mockDownloadMedia.mockClear();
        const page = apiPage({ imageList: [{ urlDefault: 'http://sns-img-qc.xhscdn.com/first.jpg' }, { urlDefault: 'https://sns-img-qc.xhscdn.com/second.jpg' }] });
        await getRegistry().get('xiaohongshu/download').func(page, { 'note-id': input, output: './out' });
        expect(mockDownloadMedia).toHaveBeenCalledWith([
            { type: 'image', url: 'https://sns-img-qc.xhscdn.com/first.jpg' }, { type: 'image', url: 'https://sns-img-qc.xhscdn.com/second.jpg' },
        ], expect.objectContaining({ subdir: id }));
        expect(mockDownloadMedia.mock.calls[0][1]).not.toHaveProperty('cookies');
        expect(page.getCookies).not.toHaveBeenCalled();
        expect(page.goto).not.toHaveBeenCalled();
    });
    it.each(['http://untrusted.invalid/photo.jpg', 'https://untrusted.invalid/photo.jpg', 'https://xhscdn.com.untrusted.invalid/photo.jpg'])('rejects untrusted media %s before downloading', async (url) => {
        mockDownloadMedia.mockClear();
        await expect(getRegistry().get('xiaohongshu/download').func(apiPage({ imageList: [{ urlDefault: url }] }), { 'note-id': input })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(mockDownloadMedia).not.toHaveBeenCalled();
    });
    it('chooses a video stream and does not mistake its cover for the video', async () => {
        mockDownloadMedia.mockClear();
        const page = apiPage({ type: 'video', imageList: [{ urlDefault: 'https://sns-img.xhscdn.com/cover.jpg' }],
            video: { media: { stream: { h264: [{ avgBitrate: 100, masterUrl: 'https://sns-video.xhscdn.com/video.mp4' }] } } } });
        await getRegistry().get('xiaohongshu/download').func(page, { 'note-id': input });
        expect(mockDownloadMedia.mock.calls[0][0]).toEqual([{ type: 'video', url: 'https://sns-video.xhscdn.com/video.mp4' }]);
    });
});
