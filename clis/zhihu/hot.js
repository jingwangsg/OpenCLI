import { createZhihuClient } from './api.js';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

cli({
    site: 'zhihu',
    name: 'hot',
    access: 'read',
    description: '知乎热榜',
    domain: 'www.zhihu.com',
    strategy: Strategy.COOKIE,
    browser: false,
    navigateBefore: false,
    args: [
        { name: 'profile', valueRequired: true, help: 'Browser profile alias or context ID' },
        { name: 'limit', type: 'int', default: 20, help: 'Number of items to return' },
    ],
    columns: ['rank', 'title', 'heat', 'answers', 'url'],
    func: async (kwargs) => {
        const limit = Number(kwargs.limit ?? 20);
        if (!Number.isSafeInteger(limit) || limit <= 0) {
            throw new ArgumentError('zhihu hot --limit must be a positive integer');
        }
        const api = await createZhihuClient(kwargs.profile);
        const data = await api.get('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50').catch((error) => {
            throw new CommandExecutionError(`Zhihu hot list request failed: ${error.message || String(error)}`);
        });
        if (data?.__httpError === 401 || data?.__httpError === 403) {
            throw new AuthRequiredError('www.zhihu.com', 'Failed to fetch Zhihu hot topics');
        }
        if (data?.__httpError) {
            throw new CommandExecutionError(`Zhihu hot list request failed (HTTP ${data.__httpError})`);
        }
        if (!Array.isArray(data?.data)) {
            throw new CommandExecutionError('Zhihu hot list returned a malformed data list');
        }
        if (data.data.length === 0) {
            throw new EmptyResultError('zhihu hot', 'Zhihu returned no hot topics');
        }
        return data.data.slice(0, limit).map((item, index) => {
            const target = item?.target;
            const questionId = target?.id == null ? '' : String(target.id);
            if (!/^\d+$/.test(questionId) || typeof target?.title !== 'string' || !target.title.trim()
                || !Number.isSafeInteger(target.answer_count) || target.answer_count < 0) {
                throw new CommandExecutionError('Zhihu hot list returned a malformed question');
            }
            return {
                rank: index + 1,
                title: target.title,
                heat: item.detail_text || '',
                answers: target.answer_count,
                url: `https://www.zhihu.com/question/${questionId}`,
            };
        });
    },
});
