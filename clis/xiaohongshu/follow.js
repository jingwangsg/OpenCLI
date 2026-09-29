import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { normalizeXhsUserId } from './user-helpers.js';
import { setFollowingApi } from './web-api.js';

const USER_ID_RE = /^[a-zA-Z0-9]{8,32}$/;

function assertUserId(raw) {
    const input = String(raw ?? '').trim();
    if (/^https?:\/\//i.test(input)) {
        let parsed;
        try {
            parsed = new URL(input);
        } catch {
            throw new ArgumentError('xiaohongshu/follow: invalid profile URL');
        }
        if (parsed.protocol !== 'https:' || !(parsed.hostname === 'xiaohongshu.com' || parsed.hostname.endsWith('.xiaohongshu.com'))) {
            throw new ArgumentError('xiaohongshu/follow: profile URL must be an exact https://*.xiaohongshu.com URL');
        }
        const match = parsed.pathname.match(/^\/user\/profile\/([a-zA-Z0-9]{8,32})\/?$/);
        if (!match) {
            throw new ArgumentError('xiaohongshu/follow: profile URL must be /user/profile/<userId>');
        }
        return match[1];
    }
    const userId = normalizeXhsUserId(raw);
    if (!userId || !USER_ID_RE.test(userId)) {
        throw new ArgumentError(
            'xiaohongshu/follow: user-id must be a Xiaohongshu user ID (e.g. 5d8f88dc0000000001005d3a) or full profile URL',
        );
    }
    return userId;
}

cli({
    site: 'xiaohongshu', name: 'follow', access: 'write',
    description: '关注小红书用户 (signed API)',
    domain: 'www.xiaohongshu.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false, siteSession: 'persistent',
    args: [{ name: 'user-id', required: true, positional: true, help: 'User id or profile URL' }],
    columns: ['status', 'user_id', 'url'],
    func: async (page, args) => {
        const userId = assertUserId(args['user-id']);
        const status = await setFollowingApi(page, userId, true);
        return [{ status, user_id: userId, url: `https://www.xiaohongshu.com/user/profile/${userId}` }];
    },
});
