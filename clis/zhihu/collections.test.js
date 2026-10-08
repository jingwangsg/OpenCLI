import { createZhihuClient } from './api.js';
import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

// Mock logger
vi.mock('@jackwener/opencli/logger', () => ({
  log: {
    info: vi.fn(),
    status: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
    debug: vi.fn(),
    step: vi.fn(),
    stepResult: vi.fn(),
  },
}));

import './collections.js';

describe('zhihu collections', () => {
  it('returns list of collections', async () => {
    const cmd = getRegistry().get('zhihu/collections');
    expect(cmd?.func).toBeTypeOf('function');

    const goto = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;
    const get = vi.fn().mockImplementation(async (js) => {
      callCount++;
      if (callCount === 1) {
        expect(js).toContain('api/v4/me');
        return { url_token: 'testuser', id: 'abc123' };
      }
      expect(js).toContain('people/testuser/collections');
      return {
        data: [
          { id: 123456, title: '我的收藏夹', item_count: 42, description: '待读' },
          { id: 789012, title: '技术文章', item_count: 100, description: '' },
        ],
        paging: { totals: 2 },
      };
    });

    const page = { goto, get };
    const result = await runCommand(cmd, page, { limit: 20 });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      rank: 1,
      title: '我的收藏夹',
      item_count: 42,
      description: '待读',
      collection_id: '123456',
    });
    expect(result[1]).toMatchObject({
      rank: 2,
      title: '技术文章',
      item_count: 100,
      description: '',
      collection_id: '789012',
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('returns list of collections with answer_count fallback', async () => {
    const cmd = getRegistry().get('zhihu/collections');
    let callCount = 0;
    const get = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { url_token: 'testuser', id: 'abc123' };
      }
      return {
        data: [{ id: 111, title: '默认收藏夹', answer_count: 15, description: 'test desc' }],
        paging: { totals: 1 },
      };
    });

    const page = { goto: vi.fn().mockResolvedValue(undefined), get };
    const result = await runCommand(cmd, page, { limit: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: '默认收藏夹',
      item_count: 15,
      description: 'test desc',
      collection_id: '111',
    });
  });

  it('maps auth failures to AuthRequiredError', async () => {
    const cmd = getRegistry().get('zhihu/collections');
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ __httpError: 401 }),
    };

    await expect(runCommand(cmd, page, { limit: 20 }))
      .rejects.toBeInstanceOf(AuthRequiredError);
  });

  it('handles missing url_token', async () => {
    const cmd = getRegistry().get('zhihu/collections');
    let callCount = 0;
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { id: 'abc123' };
        return {};
      }),
    };

    await expect(runCommand(cmd, page, { limit: 20 }))
      .rejects.toBeInstanceOf(CommandExecutionError);
  });

  it('respects limit parameter', async () => {
    const cmd = getRegistry().get('zhihu/collections');
    let callCount = 0;
    const get = vi.fn().mockImplementation(async (js) => {
      callCount++;
      if (callCount === 1) {
        return { url_token: 'testuser', id: 'abc123' };
      }
      expect(js).toContain('limit=10');
      return {
        data: [{ id: 1, title: 'Test', answer_count: 0, description: '' }],
        paging: { totals: 1 },
      };
    });

    const page = { goto: vi.fn().mockResolvedValue(undefined), get };
    const result = await runCommand(cmd, page, { limit: 10 });

    expect(result).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid limits before navigation', async () => {
    const cmd = getRegistry().get('zhihu/collections');
    const page = { goto: vi.fn(), get: vi.fn() };

    await expect(runCommand(cmd, page, { limit: 0 })).rejects.toBeInstanceOf(ArgumentError);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('paginates collection list and deduplicates by collection id', async () => {
    const cmd = getRegistry().get('zhihu/collections');
    const get = vi.fn()
      .mockResolvedValueOnce({ url_token: 'testuser', id: 'abc123' })
      .mockResolvedValueOnce({
        data: [{ id: 1, title: 'A', item_count: 1, description: '' }],
        paging: { totals: 3, is_end: false, next: 'https://www.zhihu.com/api/v4/people/testuser/collections?offset=1&limit=1' },
      })
      .mockResolvedValueOnce({
        data: [
          { id: 1, title: 'A duplicate', item_count: 1, description: '' },
          { id: 2, title: 'B', item_count: 2, description: '' },
        ],
        paging: { totals: 3, is_end: true },
      });
    const page = { goto: vi.fn().mockResolvedValue(undefined), get };

    const result = await runCommand(cmd, page, { limit: 2 });

    expect(result.map((row) => row.title)).toEqual(['A', 'B']);
    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls[2][0]).toContain('offset=1');
  });

  it('throws EmptyResultError when no collections are returned', async () => {
    const cmd = getRegistry().get('zhihu/collections');
    const get = vi.fn()
      .mockResolvedValueOnce({ url_token: 'testuser', id: 'abc123' })
      .mockResolvedValueOnce({ data: [], paging: { totals: 0, is_end: true } });
    const page = { goto: vi.fn().mockResolvedValue(undefined), get };

    await expect(runCommand(cmd, page, { limit: 20 })).rejects.toBeInstanceOf(EmptyResultError);
  });
});

vi.mock('./api.js', () => ({ createZhihuClient: vi.fn() }));

async function runCommand(command, api, kwargs) {
    createZhihuClient.mockResolvedValue(api);
    return command.func(kwargs);
}
