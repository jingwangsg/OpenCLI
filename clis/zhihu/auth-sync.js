import { cli, Strategy } from '@jackwener/opencli/registry';
import { syncZhihuProfile } from './api.js';

cli({
    site: 'zhihu',
    name: 'auth-sync',
    access: 'read',
    description: 'Cache the selected profile session for Zhihu API commands without a browser',
    domain: 'www.zhihu.com',
    strategy: Strategy.COOKIE,
    browser: false,
    navigateBefore: false,
    args: [{ name: 'profile', valueRequired: true, help: 'Browser profile alias or context ID' }],
    columns: ['url_token', 'name', 'uid'],
    func: async (kwargs) => syncZhihuProfile(kwargs.profile),
});
