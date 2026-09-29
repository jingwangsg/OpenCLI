/**
 * Xiaohongshu download — download images and videos from a note.
 *
 * Usage:
 *   opencli xiaohongshu download <signed-note-url-or-shortlink> --output ./xhs
 *
 * Accepts a full xiaohongshu.com URL with xsec_token or an xhslink short link.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { downloadMedia } from '@jackwener/opencli/download/media-download';
import { CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import { readNoteApi } from './web-api.js';
import { buildNoteUrl } from './note-helpers.js';
/**
 * Build the media-extraction IIFE. The note id is interpolated as a default
 * since the IIFE may also resolve it from `location.pathname`. The CDN
 * substring allowlist includes `rednote` so the rednote adapter can reuse
 * this script unchanged — image / video URLs on both sites are served from
 * the same xhscdn family per #1136.
 */
export function buildDownloadExtractJs(noteId) {
    return `
      (() => {
        const bodyText = document.body?.innerText || '';
        const result = {
          noteId: '${noteId}',
          pageUrl: location.href,
          securityBlock: /安全限制|访问链接异常/.test(bodyText)
            || /website-login\\/error|error_code=300017|error_code=300031/.test(location.href),
          title: '',
          author: '',
          media: []
        };
        const seenMedia = new Set();
        const pushMedia = (type, url) => {
          if (!url) return;
          const key = type + ':' + url;
          if (seenMedia.has(key)) return;
          seenMedia.add(key);
          result.media.push({ type, url });
        };
        const locationMatch = (location.pathname || '').match(/\\/(?:explore|note|search_result|discovery\\/item)\\/([a-f0-9]+)|\\/user\\/profile\\/[^/?#]+\\/([a-f0-9]+)/i);
        if (locationMatch) {
          result.noteId = locationMatch[1] || locationMatch[2];
        }

        // Get title
        const titleEl = document.querySelector('.title, #detail-title, .note-content .title');
        result.title = titleEl?.textContent?.trim() || 'untitled';

        // Get author
        const authorEl = document.querySelector('.username, .author-name, .name');
        result.author = authorEl?.textContent?.trim() || 'unknown';

        // Get images: prefer canonical carousel order from __INITIAL_STATE__
        // so the saved order matches what the user sees on the platform (#1514).
        // DOM extraction is used only as a fallback because multiple selectors,
        // hidden / duplicated / preloaded slides, and lazy rendering can reorder
        // the discovered nodes away from the platform's display order.

        const normalizeImageUrl = (raw) => {
          if (!raw || typeof raw !== 'string') return '';
          let src = raw.split('?')[0];
          src = src.replace(/\\/imageView\\d+\\/\\d+\\/w\\/\\d+/, '');
          return src;
        };
        const orderedImageUrls = [];
        const seenImageUrls = new Set();
        const pushImage = (url) => {
          if (!url || seenImageUrls.has(url)) return;
          seenImageUrls.add(url);
          orderedImageUrls.push(url);
        };

        const getStructuredNotes = () => {
          const state = window.__INITIAL_STATE__;
          const noteData = state?.note?.noteDetailMap || state?.note?.note || {};
          if (!noteData || typeof noteData !== 'object') return [];
          const currentIds = [...new Set([result.noteId, '${noteId}'].filter(Boolean))];
          const notes = [];
          for (const id of currentIds) {
            const entry = noteData[id];
            const note = entry?.note || entry;
            if (note && typeof note === 'object') notes.push(note);
          }
          // Compatibility fallback for legacy single-note stores. Do not use this
          // when keyed detail maps contain multiple notes, or carousel order can
          // be polluted by preloaded/previous note entries.
          const keys = Object.keys(noteData);
          if (notes.length === 0 && keys.length === 1) {
            const entry = noteData[keys[0]];
            const note = entry?.note || entry;
            if (note && typeof note === 'object') notes.push(note);
          }
          return notes;
        };

        // Method 1: walk __INITIAL_STATE__.note.noteDetailMap[id].note.imageList
        // in array order. Each entry exposes urlDefault as the canonical CDN URL.
        let imageInitialStateUsed = false;
        try {
          for (const note of getStructuredNotes()) {
            const list = Array.isArray(note?.imageList) ? note.imageList : [];
            for (const item of list) {
              const candidate = item?.urlDefault || item?.urlPre || item?.url
                || item?.infoList?.find(i => i?.imageScene === 'WB_DFT')?.url
                || item?.infoList?.[0]?.url
                || '';
              const src = normalizeImageUrl(candidate);
              if (src && (src.includes('xhscdn') || src.includes('xiaohongshu') || src.includes('rednote'))) {
                pushImage(src);
                imageInitialStateUsed = true;
              }
            }
          }
        } catch(e) {}

        // Method 2: fallback to DOM scraping when the structured state is missing
        // (e.g. preview pages without full SSR hydration). Order may differ from
        // the carousel; surface it anyway rather than returning zero images.
        if (!imageInitialStateUsed) {
          const imageSelectors = [
            '.swiper-slide img',
            '.carousel-image img',
            '.note-slider img',
            '.note-image img',
            '.image-wrapper img',
            '#noteContainer .media-container img[src*="xhscdn"]',
            'img[src*="ci.xiaohongshu.com"]'
          ];
          for (const selector of imageSelectors) {
            document.querySelectorAll(selector).forEach(img => {
              const raw = img.src || img.getAttribute('data-src') || '';
              const src = normalizeImageUrl(raw);
              if (src && (src.includes('xhscdn') || src.includes('xiaohongshu') || src.includes('rednote'))) {
                pushImage(src);
              }
            });
          }
        }

        // Get video — prefer real URL from page state over blob: URLs

        // Method 1: Extract from __INITIAL_STATE__ (SSR hydration data)
        try {
          for (const note of getStructuredNotes()) {
            const video = note?.video;
            if (video) {
              const vUrl = video.url || video.originVideoKey || video.consumer?.originVideoKey;
              if (vUrl) {
                const fullUrl = vUrl.startsWith('http') ? vUrl : 'https://sns-video-bd.xhscdn.com/' + vUrl;
                pushMedia('video', fullUrl);
              }
              const streams = video.media?.stream?.h264 || [];
              for (const stream of streams) {
                if (stream.masterUrl) pushMedia('video', stream.masterUrl);
              }
            }
          }
        } catch(e) {}

        // Method 2: Extract video URLs from inline script JSON
        if (result.media.filter(m => m.type === 'video').length === 0) {
          try {
            const scripts = document.querySelectorAll('script');
            for (const s of scripts) {
              const text = s.textContent || '';
              const videoMatches = text.match(/https?:\\/\\/sns-video[^"'\\s]+\\.mp4[^"'\\s]*/g)
                || text.match(/https?:\\/\\/[^"'\\s]*xhscdn[^"'\\s]*\\.mp4[^"'\\s]*/g);
              if (videoMatches) {
                videoMatches.forEach(url => {
                  pushMedia('video', url.replace(/\\\\u002F/g, '/'));
                });
              }
            }
          } catch(e) {}
        }

        // Method 3: Fallback to DOM video elements, skip blob: URLs
        if (result.media.filter(m => m.type === 'video').length === 0) {
          const videoSelectors = [
            'video source',
            'video[src]',
            '.player video',
            '.video-player video'
          ];
          for (const selector of videoSelectors) {
            document.querySelectorAll(selector).forEach(v => {
              const src = v.src || v.getAttribute('src') || '';
              if (src && !src.startsWith('blob:')) {
                pushMedia('video', src);
              }
            });
          }
        }

        // Preserve the pre-existing media type order (videos first, then images)
        // while keeping image carousel order stable within the image batch.
        orderedImageUrls.forEach(url => pushMedia('image', url));

        return result;
      })()
    `;
}
export const command = cli({
    site: 'xiaohongshu',
    name: 'download',
    access: 'read',
    description: '下载小红书笔记中的图片和视频',
    domain: 'www.xiaohongshu.com',
    strategy: Strategy.COOKIE,
    navigateBefore: false, siteSession: 'persistent',
    args: [
        { name: 'note-id', positional: true, required: true, help: 'Full Xiaohongshu note URL with xsec_token, or xhslink short link' },
        { name: 'output', default: './xiaohongshu-downloads', help: 'Output directory' },
    ],
    columns: ['index', 'type', 'status', 'size'],
    func: async (page, kwargs) => {
        let url = buildNoteUrl(String(kwargs['note-id']), { allowShortLink: true, commandName: 'xiaohongshu download' });
        for (let hop = 0; new URL(url).hostname === 'xhslink.com'; hop++) {
            if (hop >= 5) throw new CommandExecutionError('Xiaohongshu short link exceeded five redirects');
            const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
            const target = response.headers.get('location');
            if (![301, 302, 303, 307, 308].includes(response.status) || !target) throw new CommandExecutionError('Xiaohongshu short link did not return a note redirect');
            const next = new URL(target, url);
            if (next.protocol !== 'https:' || !['xhslink.com', 'www.xiaohongshu.com', 'xiaohongshu.com'].includes(next.hostname)) throw new CommandExecutionError('Xiaohongshu short link redirected outside the expected site');
            url = next.href;
        }
        const note = await readNoteApi(page, url);
        const media = [];
        if (note.type === 'video') {
            const streams = Object.values(note.video?.media?.stream || {}).flat();
            const candidates = streams.filter((stream) => typeof stream.masterUrl === 'string').sort((a, b) => (b.avgBitrate || 0) - (a.avgBitrate || 0));
            if (candidates.length) media.push({ type: 'video', url: candidates[0].masterUrl });
        } else {
            if (!Array.isArray(note.imageList)) throw new CommandExecutionError('Xiaohongshu note omitted its image list');
            for (const image of note.imageList) {
                const imageUrl = image.urlDefault || image.infoList?.find((entry) => entry.imageScene === 'WB_DFT')?.url || image.urlPre;
                if (!imageUrl) throw new CommandExecutionError('Xiaohongshu note omitted an image URL');
                media.push({ type: 'image', url: imageUrl });
            }
        }
        if (!media.length) throw new EmptyResultError('xiaohongshu download', 'The note has no downloadable media');
        for (const item of media) {
            let mediaUrl;
            try { mediaUrl = new URL(item.url); }
            catch { throw new CommandExecutionError('Xiaohongshu returned an invalid media URL'); }
            if (!['https:', 'http:'].includes(mediaUrl.protocol) || mediaUrl.username || mediaUrl.password || mediaUrl.port ||
                !['xhscdn.com', 'xiaohongshu.com'].some((host) => mediaUrl.hostname === host || mediaUrl.hostname.endsWith(`.${host}`))) {
                throw new CommandExecutionError('Xiaohongshu returned a media URL outside its HTTPS media hosts');
            }
            // The API still emits HTTP CDN URLs; the same resources are served over HTTPS.
            mediaUrl.protocol = 'https:';
            item.url = mediaUrl.href;
        }
        // Signed CDN URLs carry their own access context; never forward the main-site session Cookie.
        return downloadMedia(media, { output: kwargs.output, subdir: note.noteId, filenamePrefix: note.noteId, timeout: 60000 });
    },
});
