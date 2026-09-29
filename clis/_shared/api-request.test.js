import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForApiRequest } from './api-request.js';

afterEach(() => vi.useRealTimers());

describe('captured API request readiness', () => {
    it('returns immediately when the matching request is already available', async () => {
        const response = { url: '/flights', requestBodyPreview: '{"route":"SIN-TYO"}' };
        const page = { readNetworkCapture: vi.fn().mockResolvedValue([response]) };
        expect(await waitForApiRequest(page, (entry) => entry.url === '/flights', 'flights')).toBe(response);
        expect(page.readNetworkCapture).toHaveBeenCalledOnce();
    });

    it('ignores unrelated traffic and waits until the requested request is delivered', async () => {
        vi.useFakeTimers();
        const response = { url: '/flights', requestBodyPreview: '{"route":"SIN-OSA"}' };
        const page = { readNetworkCapture: vi.fn()
            .mockResolvedValueOnce([{ url: '/analytics', requestBodyPreview: '{"route":"SIN-TYO"}' }])
            .mockResolvedValueOnce([]).mockResolvedValueOnce([response]) };
        const pending = waitForApiRequest(page, (entry) => entry.url === '/flights', 'flights');
        await vi.advanceTimersByTimeAsync(400);
        expect(await pending).toBe(response);
        expect(page.readNetworkCapture).toHaveBeenCalledTimes(3);
    });

    it('fails with a timeout when no matching request arrives', async () => {
        vi.useFakeTimers();
        const page = { readNetworkCapture: vi.fn().mockResolvedValue([]) };
        const pending = expect(waitForApiRequest(page, () => true, 'flights', 500))
            .rejects.toMatchObject({ code: 'TIMEOUT' });
        await vi.advanceTimersByTimeAsync(500);
        await pending;
    });
});
