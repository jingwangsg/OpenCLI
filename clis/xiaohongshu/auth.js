import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError, TimeoutError } from '@jackwener/opencli/errors';
import { callWebApi } from './web-api.js';

async function verifyIdentity(page) {
    const identity = await callWebApi(page, '/api/sns/web/v2/user/me');
    if (identity.guest || !identity.userId) throw new AuthRequiredError('www.xiaohongshu.com', 'Log in to the Xiaohongshu main site in the bound browser tab');
    const profile = await callWebApi(page, '/api/sns/web/v1/user/selfinfo');
    const fans = profile.interactions?.find((item) => item.type === 'fans');
    const followers = Number(fans?.count);
    if (!profile.basicInfo?.nickname || !fans || !Number.isFinite(followers) || followers < 0) throw new CommandExecutionError('Xiaohongshu identity API returned an incomplete profile');
    return { logged_in: true, site: 'xiaohongshu', username: profile.basicInfo.nickname, followers };
}

// Not registerSiteAuthCommands: its login navigates to loginUrl, which would move the bound tab off the signer origin.
cli({
    site: 'xiaohongshu', name: 'whoami', access: 'read', description: 'Show the signed-in Xiaohongshu main-site account',
    domain: 'www.xiaohongshu.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false, siteSession: 'persistent',
    args: [], columns: ['logged_in', 'site', 'username', 'followers'],
    authStatus: { quickCheck: async (page) => { const user = await callWebApi(page, '/api/sns/web/v2/user/me'); return { logged_in: !user.guest && !!user.userId }; } },
    func: verifyIdentity,
});

cli({
    site: 'xiaohongshu', name: 'login', access: 'read', description: 'Wait for main-site login in the already bound Xiaohongshu tab',
    domain: 'www.xiaohongshu.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false, siteSession: 'persistent',
    args: [{ name: 'timeout', type: 'int', default: 300, help: 'Maximum seconds to wait for manual login in the bound tab' }],
    columns: ['status', 'logged_in', 'site', 'username', 'followers'],
    func: async (page, args) => {
        const timeout = Number(args.timeout ?? 300);
        if (!Number.isFinite(timeout) || timeout <= 0) throw new ArgumentError('--timeout must be positive');
        const deadline = Date.now() + timeout * 1000;
        let waiting = false;
        while (Date.now() < deadline) {
            try { return { status: waiting ? 'login_complete' : 'already_logged_in', ...await verifyIdentity(page) }; }
            catch (error) { if (!(error instanceof AuthRequiredError)) throw error; }
            waiting = true;
            await new Promise((resolve) => setTimeout(resolve, Math.min(2000, Math.max(0, deadline - Date.now()))));
        }
        throw new TimeoutError('xiaohongshu login', timeout, 'Complete main-site login in the tab bound to xiaohongshu-web-api');
    },
});
