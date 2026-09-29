import { ArgumentError, AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { buildXhsNoteUrl, normalizeXhsUserId } from './user-helpers.js';
import { callWebApi, readNoteListApi } from './web-api.js';

export const SAVED_PROFILE_TAB = 'fav';
export const LIKED_PROFILE_TAB = 'liked';

function toCleanString(value) {
    return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
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

export function mapCollectionNote(entry) {
    if (!isObject(entry))
        return null;
    const noteCard = entry.note_card ?? entry.noteCard ?? entry;
    const noteId = toCleanString(entry.note_id
        ?? entry.noteId
        ?? entry.id
        ?? noteCard.note_id
        ?? noteCard.noteId
        ?? noteCard.id);
    if (!noteId)
        return null;
    const user = noteCard.user ?? entry.user ?? {};
    const userId = toCleanString(user.user_id ?? user.userId ?? '');
    const xsecToken = toCleanString(entry.xsec_token
        ?? entry.xsecToken
        ?? noteCard.xsec_token
        ?? noteCard.xsecToken);
    if (!xsecToken)
        return null;
    const interact = noteCard.interact_info ?? noteCard.interactInfo ?? entry.interact_info ?? entry.interactInfo ?? {};
    const url = userId
        ? buildXhsNoteUrl(userId, noteId, xsecToken)
        : `https://www.xiaohongshu.com/explore/${encodeURIComponent(noteId)}?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_user`;
    return {
        id: noteId,
        title: toCleanString(noteCard.display_title ?? noteCard.displayTitle ?? noteCard.title ?? entry.title ?? entry.display_title),
        author: toCleanString(user.nickname ?? user.nickName ?? user.nick_name ?? user.name),
        likes: toCleanString(interact.liked_count ?? interact.likedCount ?? 0) || '0',
        type: toCleanString(noteCard.type ?? entry.type),
        url,
    };
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
    return notes.map((note, index) => ({ rank: index + 1, ...mapCollectionNote(note) }));
}
