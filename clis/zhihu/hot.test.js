import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import './hot.js';
import { createZhihuClient, requestZhihuApi } from './api.js';

vi.mock('./api.js', async () => ({
    ...await vi.importActual('./api.js'),
    createZhihuClient: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

async function runHot(body, { status = 200, limit = 20 } = {}) {
    vi.stubGlobal('fetch', async () => new Response(body, { status }));
    createZhihuClient.mockResolvedValue({ get: url => requestZhihuApi({
        userAgent: 'test-browser', cookies: [{ name: 'z_c0', value: 'synthetic', path: '/' }],
    }, url) });
    const command = getRegistry().get('zhihu/hot');
    return command.func({ limit });
}

const topics = '{"data":[{"target":{"id":2091483293715846330,"title":"First question","answer_count":351},"detail_text":"905 万热度"},{"target":{"id":123456,"title":"Second question","answer_count":0},"detail_text":"1 万热度"}]}';

describe('zhihu hot', () => {
    it('preserves exact question IDs in result links and respects the limit', async () => {
        await expect(runHot(topics, { limit: 1 })).resolves.toEqual([{
            rank: 1,
            title: 'First question',
            heat: '905 万热度',
            answers: 351,
            url: 'https://www.zhihu.com/question/2091483293715846330',
        }]);
    });

    it('returns the complete available list when the requested limit is larger', async () => {
        const rows = await runHot(topics, { limit: 100 });
        expect(rows).toHaveLength(2);
        expect(rows[1]).toMatchObject({ rank: 2, answers: 0, url: 'https://www.zhihu.com/question/123456' });
    });

    it.each([401, 403])('reports HTTP %i as an authentication failure', async (status) => {
        await expect(runHot('{"error":{"message":"身份未经过验证"}}', { status }))
            .rejects.toBeInstanceOf(AuthRequiredError);
    });

    it.each([429, 500])('reports HTTP %i as an execution failure', async (status) => {
        await expect(runHot('{"error":{"message":"Unavailable"}}', { status }))
            .rejects.toBeInstanceOf(CommandExecutionError);
    });

    it.each(['<html>Sign in</html>', '{"error":{"message":"Unavailable"}}', '{"data":{}}', '{"data":[{"target":{"title":"Missing ID","answer_count":1}}]}'])
        ('rejects malformed responses instead of reporting an empty success: %s', async (body) => {
            await expect(runHot(body)).rejects.toBeInstanceOf(CommandExecutionError);
        });

    it('reports a valid empty hot list as an empty result', async () => {
        await expect(runHot('{"data":[]}')).rejects.toBeInstanceOf(EmptyResultError);
    });

    it.each([0, -1, 1.5, 'invalid'])('rejects an invalid limit: %s', async (limit) => {
        await expect(runHot(topics, { limit })).rejects.toBeInstanceOf(ArgumentError);
    });

    it('includes links in table output', () => {
        expect(getRegistry().get('zhihu/hot').columns)
            .toEqual(['rank', 'title', 'heat', 'answers', 'url']);
    });
});
