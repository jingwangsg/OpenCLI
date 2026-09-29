/**
 * Xiaohongshu note — read full note content from a public note page.
 *
 * Extracts title, author, description text, and engagement metrics
 * (likes, collects, comment count) via DOM extraction.
 *
 * Requires a full Xiaohongshu note URL with xsec_token.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { readNoteApi } from './web-api.js';
/**
 * Host-agnostic IIFE that scrapes note title / author / counts / tags from a
 * rendered note detail page. Exported so the rednote adapter can reuse the
 * exact same selector set without copying it.
 */
export const NOTE_EXTRACT_JS = `
      (() => {
        const bodyText = document.body?.innerText || ''
        const loginWall = /登录后查看|请登录/.test(bodyText)
        const notFound = /页面不见了|笔记不存在|无法浏览/.test(bodyText)
        const securityBlock = /安全限制|访问链接异常/.test(bodyText)
          || /website-login\\/error|error_code=300017|error_code=300031/.test(location.href)

        const clean = (el) => (el?.textContent || '').replace(/\\s+/g, ' ').trim()

        // Scope the note's own fields to #noteContainer — the detail panel.
        // The page also renders a recommendation feed next to the note, and
        // every card in that feed carries a .title. querySelector returns the
        // FIRST match in document order, so for a note that has no title of
        // its own (#detail-title absent) the unscoped selector fell through to
        // .title and reported an unrelated recommendation card's title as this
        // note's title. Same class of bug as the .interact-container scoping
        // below.
        const scope = document.querySelector('#noteContainer')
        const title = scope
          ? clean(scope.querySelector('#detail-title, .title'))
          : clean(document.querySelector('#detail-title'))
        const desc = scope
          ? clean(scope.querySelector('#detail-desc, .desc, .note-text'))
          : clean(document.querySelector('#detail-desc, .note-text'))
        const author = scope
          ? clean(scope.querySelector('.username, .author-wrapper .name'))
          : clean(document.querySelector('.username, .author-wrapper .name'))
        // Scope to .interact-container — the post's main interaction bar.
        // Without scoping, .like-wrapper / .chat-wrapper also match each
        // comment's like/reply buttons in the comment section, and
        // querySelector returns the FIRST match (a comment's count, not the
        // post's). The post's true counts live inside .interact-container.
        const likes = clean(document.querySelector('.interact-container .like-wrapper .count'))
        const collects = clean(document.querySelector('.interact-container .collect-wrapper .count'))
        const comments = clean(document.querySelector('.interact-container .chat-wrapper .count'))

        // Try to extract tags/topics
        const tags = []
        document.querySelectorAll('#detail-desc a.tag, #detail-desc a[href*="search_result"]').forEach(el => {
          const t = (el.textContent || '').trim()
          if (t) tags.push(t)
        })

        return { pageUrl: location.href, securityBlock, loginWall, notFound, title, desc, author, likes, collects, comments, tags }
      })()
    `;
export const command = cli({
    site: 'xiaohongshu',
    name: 'note',
    access: 'read',
    description: '获取小红书笔记正文和互动数据',
    domain: 'www.xiaohongshu.com',
    strategy: Strategy.COOKIE,
    navigateBefore: false, siteSession: 'persistent',
    args: [
        { name: 'note-id', required: true, positional: true, help: 'Full Xiaohongshu note URL with xsec_token' },
    ],
    columns: ['field', 'value'],
    func: async (page, kwargs) => {
        const note = await readNoteApi(page, String(kwargs['note-id']));
        const rows = [
            { field: 'title', value: note.title || '' },
            { field: 'author', value: note.user.nickname || note.user.nickName || '' },
            { field: 'content', value: note.desc },
            { field: 'likes', value: String(note.interactInfo.likedCount ?? 0) },
            { field: 'collects', value: String(note.interactInfo.collectedCount ?? 0) },
            { field: 'comments', value: String(note.interactInfo.commentCount ?? 0) },
        ];
        if (note.tagList?.length) rows.push({ field: 'tags', value: note.tagList.map((tag) => tag.name).join(', ') });
        return rows;
    },
});
