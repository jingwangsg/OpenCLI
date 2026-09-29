import { TimeoutError } from '@jackwener/opencli/errors';

/** Wait for the browser to emit a complete API request that can be replayed. */
export async function waitForApiRequest(page, matches, label, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const entries = await page.readNetworkCapture();
        const request = entries.find(matches);
        if (request) return request;
        // Browser Bridge exposes a draining event queue, rather than a subscription.
        await new Promise((resolve) => setTimeout(resolve, Math.min(200, deadline - Date.now())));
    }
    throw new TimeoutError(label, timeoutMs / 1000);
}
