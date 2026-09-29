import { ArgumentError, AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { buildXhsNoteUrl, normalizeXhsUserId } from './user-helpers.js';
import { callWebApi, readNoteListApi } from './web-api.js';

export const SAVED_PROFILE_TAB = 'fav';
export const LIKED_PROFILE_TAB = 'liked';

function toCleanString(value) {
    return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

export function parseCollectionLimit(raw) {
    const parsed = Number(raw ?? 20);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        throw new ArgumentError(`--limit must be an integer between 1 and 100, got ${JSON.stringify(raw)}`);
    }
    if (parsed < 1 || parsed > 100) {
        throw new ArgumentError(`--limit must be between 1 and 100, got ${parsed}`);
    }
    return parsed;
}

export async function resolveXhsUserId(page, rawId) {
    if (rawId) return normalizeXhsUserId(rawId);
    const identity = await callWebApi(page, '/api/sns/web/v2/user/me');
    if (identity.guest || !identity.userId) throw new AuthRequiredError('www.xiaohongshu.com', 'Log in to the Xiaohongshu main site');
    return identity.userId;
}

export async function fetchXhsCollectionNotes(page, { userId, profileTab, limit, emptyLabel }) {
    const path = profileTab === SAVED_PROFILE_TAB ? '/api/sns/web/v2/note/collect/page' : '/api/sns/web/v1/note/like/page';
    const notes = await readNoteListApi(page, path, userId, limit);
    if (!notes.length) throw new EmptyResultError('xiaohongshu collection', `No ${emptyLabel} notes found.`);
    // readNoteListApi already rejected notes without noteId, xsecToken, user or interactInfo,
    // and the site client returns camelCase, so the fields are read directly.
    return notes.map((note, index) => {
        const authorId = toCleanString(note.user.userId);
        return {
            rank: index + 1,
            id: note.noteId,
            title: toCleanString(note.displayTitle ?? note.title),
            author: toCleanString(note.user.nickname ?? note.user.nickName),
            likes: toCleanString(note.interactInfo.likedCount ?? 0) || '0',
            type: toCleanString(note.type),
            // load-bearing: buildXhsNoteUrl returns '' without an author id; fall back to a signed /explore link.
            url: authorId
                ? buildXhsNoteUrl(authorId, note.noteId, note.xsecToken)
                : `https://www.xiaohongshu.com/explore/${encodeURIComponent(note.noteId)}?xsec_token=${encodeURIComponent(note.xsecToken)}&xsec_source=pc_user`,
        };
    });
}
