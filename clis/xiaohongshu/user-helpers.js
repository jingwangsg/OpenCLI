function toCleanString(value) {
    return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}
export function normalizeXhsUserId(input) {
    const trimmed = toCleanString(input);
    const withoutQuery = trimmed.replace(/[?#].*$/, '');
    const matched = withoutQuery.match(/\/user\/profile\/([a-zA-Z0-9]+)/);
    if (matched?.[1])
        return matched[1];
    return withoutQuery.replace(/\/+$/, '').split('/').pop() ?? withoutQuery;
}
export function flattenXhsNoteGroups(noteGroups) {
    if (!Array.isArray(noteGroups))
        return [];
    const notes = [];
    for (const group of noteGroups) {
        if (!group)
            continue;
        if (Array.isArray(group)) {
            for (const item of group) {
                if (item)
                    notes.push(item);
            }
            continue;
        }
        notes.push(group);
    }
    return notes;
}
/**
 * Build a signed user-profile note URL on the given web host (defaults to
 * `www.xiaohongshu.com`). The rednote adapter passes `'www.rednote.com'` so
 * the same builder works for both sites.
 */
export function buildXhsNoteUrl(userId, noteId, xsecToken, webHost = 'www.xiaohongshu.com') {
    const cleanUserId = toCleanString(userId);
    const cleanNoteId = toCleanString(noteId);
    if (!cleanUserId || !cleanNoteId)
        return '';
    const url = new URL(`https://${webHost}/user/profile/${cleanUserId}/${cleanNoteId}`);
    const cleanToken = toCleanString(xsecToken);
    if (cleanToken) {
        url.searchParams.set('xsec_token', cleanToken);
        url.searchParams.set('xsec_source', 'pc_user');
    }
    return url.toString();
}
/**
 * Normalise note entries into CLI rows. Both callers hand over camelCase:
 * user.js passes web-API notes (the site client converts response case) and
 * rednote/user.js passes the hydrated Pinia store snapshot. `webHost` is
 * forwarded to `buildXhsNoteUrl` so the resulting URLs point at the calling site.
 */
export function extractXhsUserNotes(snapshot, fallbackUserId, webHost = 'www.xiaohongshu.com') {
    const notes = flattenXhsNoteGroups(snapshot.noteGroups);
    const rows = [];
    const seen = new Set();
    for (const entry of notes) {
        const noteCard = entry?.noteCard ?? entry;
        if (!noteCard || typeof noteCard !== 'object')
            continue;
        const noteId = toCleanString(noteCard.noteId ?? entry?.id);
        if (!noteId || seen.has(noteId))
            continue;
        seen.add(noteId);
        const userId = toCleanString(noteCard.user?.userId ?? fallbackUserId);
        const xsecToken = toCleanString(entry?.xsecToken ?? noteCard.xsecToken);
        const likes = toCleanString(noteCard.interactInfo?.likedCount ?? 0) || '0';
        const cover = toCleanString(noteCard.cover?.urlDefault ?? noteCard.cover?.urlPre ?? noteCard.cover?.url ?? '');
        rows.push({
            id: noteId,
            title: toCleanString(noteCard.displayTitle ?? noteCard.title),
            type: toCleanString(noteCard.type),
            likes,
            cover,
            url: buildXhsNoteUrl(userId || fallbackUserId, noteId, xsecToken, webHost),
        });
    }
    return rows;
}
