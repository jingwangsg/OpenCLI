import { createZhihuClient } from './api.js';
import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { AuthRequiredError, CliError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import './user.js';

describe('zhihu user', () => {
    it('returns a user profile row from the members API', async () => {
        const cmd = getRegistry().get('zhihu/user');
        expect(cmd?.func).toBeTypeOf('function');
        const goto = vi.fn().mockResolvedValue(undefined);
        const get = vi.fn().mockImplementation(async (js) => {
            expect(js).toContain('/api/v4/members/wen-jie-16-47');
            return {
                url_token: 'wen-jie-16-47',
                id: 'abc',
                name: 'Kabi',
                headline: 'builder',
                follower_count: 3276,
                following_count: 921,
                answer_count: 11,
                articles_count: 13,
                voteup_count: 2633,
            };
        });
        await expect(runCommand(cmd, { goto, get }, { user: 'wen-jie-16-47' })).resolves.toEqual([
            {
                url_token: 'wen-jie-16-47',
                name: 'Kabi',
                headline: 'builder',
                followers: 3276,
                following: 921,
                answers: 11,
                articles: 13,
                voteup: 2633,
                url: 'https://www.zhihu.com/people/wen-jie-16-47',
            },
        ]);
        expect(goto).not.toHaveBeenCalled();
    });

    it('accepts a full people URL', async () => {
        const cmd = getRegistry().get('zhihu/user');
        const get = vi.fn().mockResolvedValue({ session: {}, data: { url_token: 'foo', id: '1', name: 'Foo' } });
        await runCommand(cmd, { goto: vi.fn().mockResolvedValue(undefined), get }, { user: 'https://www.zhihu.com/people/foo' });
        expect(get.mock.calls[0][0]).toContain('/api/v4/members/foo');
    });

    it('maps 403 to AuthRequiredError', async () => {
        const cmd = getRegistry().get('zhihu/user');
        const page = { goto: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue({ __httpError: 403 }) };
        await expect(runCommand(cmd, page, { user: 'foo' })).rejects.toBeInstanceOf(AuthRequiredError);
    });

    it('maps 404 to EmptyResultError', async () => {
        const cmd = getRegistry().get('zhihu/user');
        const page = { goto: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue({ __httpError: 404 }) };
        await expect(runCommand(cmd, page, { user: 'ghost' })).rejects.toBeInstanceOf(EmptyResultError);
    });

    it('fails typed on malformed user payloads', async () => {
        const cmd = getRegistry().get('zhihu/user');
        const page = { goto: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue({ url_token: 'foo', id: '1' }) };
        await expect(runCommand(cmd, page, { user: 'foo' })).rejects.toBeInstanceOf(CommandExecutionError);
    });

    it('rejects an invalid user before navigation', async () => {
        const cmd = getRegistry().get('zhihu/user');
        const page = { goto: vi.fn(), get: vi.fn() };
        await expect(runCommand(cmd, page, { user: 'bad slug!' })).rejects.toBeInstanceOf(CliError);
        expect(page.goto).not.toHaveBeenCalled();
    });
});

vi.mock('./api.js', () => ({ createZhihuClient: vi.fn() }));

async function runCommand(command, api, kwargs) {
    createZhihuClient.mockResolvedValue(api);
    return command.func(kwargs);
}
