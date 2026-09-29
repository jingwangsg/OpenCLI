import { describe, expect, it } from 'vitest';
import { mapCollectionNote, parseCollectionLimit } from './collection-helpers.js';

describe('xiaohongshu collection helpers', () => {
    it('validates collection limits instead of silently clamping', () => {
        expect(parseCollectionLimit('20')).toBe(20);
        expect(() => parseCollectionLimit(0)).toThrow(/between 1 and 100/);
        expect(() => parseCollectionLimit(101)).toThrow(/between 1 and 100/);
        expect(() => parseCollectionLimit('1.5')).toThrow(/integer/);
    });

    it('maps collect API notes with xsec_token into profile URLs', () => {
        const row = mapCollectionNote({
            note_id: '662908190000000001007366',
            xsec_token: 'token-1',
            note_card: {
                display_title: 'Saved note',
                type: 'normal',
                user: { user_id: 'user-1', nickname: 'Alice' },
                interact_info: { liked_count: '12' },
            },
        });
        expect(row).toMatchObject({
            id: '662908190000000001007366',
            title: 'Saved note',
            author: 'Alice',
            likes: '12',
            type: 'normal',
            url: 'https://www.xiaohongshu.com/user/profile/user-1/662908190000000001007366?xsec_token=token-1&xsec_source=pc_user',
        });
    });
});
