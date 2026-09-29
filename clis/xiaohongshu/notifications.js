import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { callWebApi } from './web-api.js';
/**
 * Build the notifications pipeline for the given web host. Exported so the
 * rednote adapter can register the same pipeline against www.rednote.com.
 */
export function buildNotificationsPipeline(webHost) {
    return [
        { navigate: `https://${webHost}/notification` },
        { tap: {
                store: 'notification',
                action: 'getNotification',
                args: [`\${{ args.type | default('mentions') }}`],
                capture: '/you/',
                select: 'data.message_list',
                timeout: 8,
            } },
        { map: {
                rank: '${{ index + 1 }}',
                user: '${{ item.user_info.nickname }}',
                action: '${{ item.title }}',
                content: '${{ item.comment_info.content }}',
                note: '${{ item.item_info.content }}',
                time: '${{ item.time }}',
            } },
        { limit: '${{ args.limit | default(20) }}' },
    ];
}
export const command = cli({
    site: 'xiaohongshu',
    name: 'notifications',
    access: 'read',
    description: '小红书通知 (mentions/likes/connections)',
    domain: 'www.xiaohongshu.com',
    strategy: Strategy.COOKIE,
    navigateBefore: false, siteSession: 'persistent',
    browser: true,
    args: [
        {
            name: 'type',
            default: 'mentions',
            help: 'Notification type: mentions, likes, or connections',
        },
        { name: 'limit', type: 'int', default: 20, help: 'Number of notifications to return' },
    ],
    columns: ['rank', 'user', 'action', 'content', 'note', 'time'],
    func: async (page, args) => {
        const type = args.type || 'mentions';
        const limit = Number(args.limit ?? 20);
        if (!['mentions', 'likes', 'connections'].includes(type) || !Number.isInteger(limit) || limit < 1) throw new ArgumentError('Provide a supported notification type and a positive integer limit');
        const rows = [];
        const seen = new Set();
        const cursors = new Set(['']);
        let cursor = '';
        for (let number = 0; number < 100; number++) {
            const data = await callWebApi(page, `/api/sns/web/v1/you/${type}`, { params: { num: 20, cursor } });
            if (!Array.isArray(data.messageList) || typeof data.hasMore !== 'boolean') throw new CommandExecutionError('Xiaohongshu notifications returned malformed pagination');
            for (const item of data.messageList) {
                if (!item?.id || !item.userInfo) throw new CommandExecutionError('Xiaohongshu returned an incomplete notification');
                if (seen.has(item.id)) continue;
                seen.add(item.id);
                rows.push({ rank: rows.length + 1, user: item.userInfo.nickname || '', action: item.title || '',
                    content: item.commentInfo?.content || '', note: item.itemInfo?.content || '', time: item.time });
                if (rows.length === limit) return rows;
            }
            if (!data.hasMore) return rows;
            const next = data.strCursor ?? data.cursor;
            if (!next || cursors.has(String(next)) || !data.messageList.length) throw new CommandExecutionError('Xiaohongshu notifications repeated or omitted its continuation cursor');
            cursor = String(next);
            cursors.add(cursor);
        }
        throw new CommandExecutionError('Xiaohongshu notifications reached its page limit');
    },
});
