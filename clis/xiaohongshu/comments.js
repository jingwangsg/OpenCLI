/**
 * Xiaohongshu comments and replies through the signed web API.
 *
 * Supports both top-level comments and nested replies (楼中楼) via
 * the --with-replies flag.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { parseNoteId, buildNoteUrl } from './note-helpers.js';
import { parseCommentLimit, parseXhsLikeCountText, normalizeCommentImages } from './comment-helpers.js';
import { callWebApi } from './web-api.js';

export const command = cli({
    site: 'xiaohongshu',
    name: 'comments',
    access: 'read',
    description: '获取小红书笔记评论（支持楼中楼子回复）',
    domain: 'www.xiaohongshu.com',
    strategy: Strategy.COOKIE,
    navigateBefore: false, siteSession: 'persistent',
    args: [
        { name: 'note-id', required: true, positional: true, help: 'Full Xiaohongshu note URL with xsec_token' },
        { name: 'limit', type: 'int', default: 20, help: 'Number of top-level comments (max 50)' },
        { name: 'with-replies', type: 'boolean', default: false, help: 'Include nested replies; reply_to is the direct target shown by the page' },
    ],
    columns: ['rank', 'author', 'userId', 'profileUrl', 'text', 'likes', 'time', 'is_reply', 'reply_to', 'images'],
    func: async (page, kwargs) => {
        const limit = parseCommentLimit(kwargs.limit);
        const url = new URL(buildNoteUrl(String(kwargs['note-id']), { commandName: 'xiaohongshu comments' }));
        const params = { noteId: parseNoteId(url.href), imageFormats: 'jpg,webp,avif', topCommentId: '', xsecToken: url.searchParams.get('xsec_token') };
        const top = [];
        const seen = new Set();
        const cursors = new Set(['']);
        let cursor = '';
        let exhausted = false;
        for (let number = 0; number < 100 && top.length < limit; number++) {
            const data = await callWebApi(page, '/api/sns/web/v2/comment/page', { params: { ...params, cursor } });
            if (!Array.isArray(data.comments) || typeof data.hasMore !== 'boolean') throw new CommandExecutionError('Xiaohongshu comments returned malformed pagination');
            for (const comment of data.comments) {
                if (!comment?.id || comment.noteId !== params.noteId) throw new CommandExecutionError('Xiaohongshu returned a comment for a different note');
                if (seen.has(comment.id)) continue;
                seen.add(comment.id);
                top.push(comment);
                if (top.length === limit) break;
            }
            if (!data.hasMore) { exhausted = true; break; }
            if (!data.cursor || cursors.has(data.cursor) || !data.comments.length) throw new CommandExecutionError('Xiaohongshu comments repeated or omitted its continuation cursor');
            cursors.add(data.cursor);
            cursor = data.cursor;
        }
        if (top.length < limit && !exhausted) throw new CommandExecutionError('Xiaohongshu comments reached its page limit');
        const all = [];
        for (const root of top) {
            all.push({ comment: root, root: null });
            if (!kwargs['with-replies']) continue;
            if (!Array.isArray(root.subComments) || typeof root.subCommentHasMore !== 'boolean') throw new CommandExecutionError('Xiaohongshu omitted reply pagination');
            const replies = [...root.subComments];
            let more = root.subCommentHasMore;
            let subCursor = root.subCommentCursor;
            const subCursors = new Set();
            for (let number = 0; more && number < 100; number++) {
                if (!subCursor || subCursors.has(subCursor)) throw new CommandExecutionError('Xiaohongshu replies repeated or omitted its continuation cursor');
                subCursors.add(subCursor);
                const data = await callWebApi(page, '/api/sns/web/v2/comment/sub/page', {
                    params: { ...params, rootCommentId: root.id, num: 10, cursor: subCursor },
                });
                if (!Array.isArray(data.comments) || typeof data.hasMore !== 'boolean') throw new CommandExecutionError('Xiaohongshu replies returned malformed pagination');
                replies.push(...data.comments);
                more = data.hasMore;
                subCursor = data.cursor;
            }
            if (more) throw new CommandExecutionError('Xiaohongshu replies reached its page limit');
            const ids = new Set();
            for (const comment of replies) {
                if (!comment?.id || comment.noteId !== params.noteId) throw new CommandExecutionError('Xiaohongshu returned an invalid reply');
                if (ids.has(comment.id)) continue;
                ids.add(comment.id);
                all.push({ comment, root });
            }
        }
        return all.map(({ comment, root }, index) => {
            const user = comment.userInfo;
            if (!user?.userId || typeof comment.content !== 'string' || !Number.isFinite(comment.createTime)) throw new CommandExecutionError('Xiaohongshu returned an incomplete comment');
            const profile = new URL(`https://www.xiaohongshu.com/user/profile/${user.userId}`);
            if (user.xsecToken) profile.searchParams.set('xsec_token', user.xsecToken);
            return { rank: index + 1, author: user.nickname || '', userId: user.userId, profileUrl: profile.href,
                text: comment.content, likes: parseXhsLikeCountText(comment.likeCount), time: new Date(comment.createTime).toISOString(),
                is_reply: !!root, reply_to: root ? (comment.targetComment?.userInfo?.nickname || root.userInfo?.nickname || '') : '',
                images: normalizeCommentImages((comment.pictures || []).map((image) => image.urlDefault || image.urlPre), 'xiaohongshu/comments') };
        });
    },
});
