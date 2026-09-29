import { AuthRequiredError, CommandExecutionError, EmptyResultError, TimeoutError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { parseStaySearch } from '../_shared/stay-search.js';

cli({
    site: 'airbnb', name: 'search', access: 'read',
    description: 'Search Airbnb stays through its StaysSearch API by destination, dates, and adults',
    domain: 'airbnb.com.sg', strategy: Strategy.COOKIE, browser: true, navigateBefore: false,
    args: [
        { name: 'destination', required: true, positional: true, help: 'City or destination (e.g. Osaka / Tokyo)' },
        { name: 'checkin', required: true, help: 'Check-in date (YYYY-MM-DD)' },
        { name: 'checkout', required: true, help: 'Check-out date (YYYY-MM-DD)' },
        { name: 'adults', default: 2, help: 'Adults (1-16)' },
        { name: 'currency', default: 'SGD', help: 'Currency code (e.g. SGD / USD / CNY)' },
        { name: 'limit', default: 10, help: 'Number of stays (1-50)' },
    ],
    columns: ['rank', 'id', 'name', 'description', 'rating', 'reviews', 'price', 'priceUnit',
        'currency', 'nights', 'checkin', 'checkout', 'url'],
    func: async (page, kwargs) => {
        const args = parseStaySearch(kwargs);
        const query = new URLSearchParams({ checkin: args.checkin, checkout: args.checkout,
            adults: String(args.adults), currency: args.currency });
        const searchUrl = `https://www.airbnb.com.sg/s/${encodeURIComponent(args.destination)}/homes?${query}`;
        if (!await page.startNetworkCapture?.('/api/v3/StaysSearch/')) {
            throw new CommandExecutionError('Airbnb StaysSearch API capture is unavailable in this browser profile');
        }
        await page.goto(searchUrl);
        const state = await page.evaluate(`(() => {
            if (/\\/login|\\/captcha/.test(location.pathname) || /verify you are human|access denied/i.test(document.title)) return 'auth';
            const first = document.querySelector('[data-testid="card-container"] a[href*="/rooms/"]')?.getAttribute('href');
            const next = document.querySelector('a[aria-label="Next"]');
            return first && next ? { firstId: first.match(/\\/rooms\\/(\\d+)/)?.[1] } : null;
        })()`);
        if (state === 'auth') throw new AuthRequiredError('airbnb.com.sg', 'Complete browser verification or login and retry');
        if (!state?.firstId) throw new CommandExecutionError('Airbnb search needs a results page with pagination to capture its API request');
        await page.click('a[aria-label="Next"]');
        const nextId = await page.evaluate(`new Promise((resolve) => {
            const previous = ${JSON.stringify(state.firstId)};
            const check = () => document.querySelector('[data-testid="card-container"] a[href*="/rooms/"]')
                ?.getAttribute('href')?.match(/\\/rooms\\/(\\d+)/)?.[1];
            const first = check(); if (first && first !== previous) return resolve(first);
            const observer = new MutationObserver(() => { const current = check(); if (current && current !== previous) { observer.disconnect(); resolve(current); } });
            observer.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve('timeout'); }, 20000);
        })`);
        if (nextId === 'timeout') throw new TimeoutError('Airbnb StaysSearch API bootstrap', 20);
        const captures = await page.readNetworkCapture();
        const request = captures.find((entry) => {
            const url = new URL(entry.url);
            return url.origin === 'https://www.airbnb.com.sg' && url.pathname.startsWith('/api/v3/StaysSearch/') &&
                entry.method === 'POST' && entry.responseStatus === 200 && !entry.requestBodyTruncated && entry.requestBodyPreview;
        });
        if (!request) throw new CommandExecutionError('Airbnb StaysSearch API request was not captured');
        if (request.responseBodyTruncated || !request.responsePreview) throw new CommandExecutionError('Airbnb StaysSearch API capture did not contain a complete response');
        let body;
        let captured;
        try { body = JSON.parse(request.requestBodyPreview); captured = JSON.parse(request.responsePreview); }
        catch { throw new CommandExecutionError('Airbnb StaysSearch API capture was malformed'); }
        const params = body.variables?.staysSearchRequest?.rawParams;
        const param = (name) => params?.find((entry) => entry.filterName === name)?.filterValues?.[0];
        if (body.operationName !== 'StaysSearch' || param('checkin') !== args.checkin ||
            param('checkout') !== args.checkout || Number(param('adults')) !== args.adults ||
            param('query')?.toLowerCase() !== args.destination.toLowerCase()) {
            throw new CommandExecutionError('Airbnb StaysSearch API request did not match the requested stay');
        }
        const initialCursor = captured?.data?.presentation?.staysSearch?.results?.paginationInfo?.pageCursors?.[0];
        if (typeof initialCursor !== 'string') throw new CommandExecutionError('Airbnb StaysSearch API omitted its first-page cursor');
        const cookies = await page.getCookies({ url: 'https://www.airbnb.com.sg' });
        const headers = { ...request.requestHeaders,
            cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') };
        const rows = [];
        const seen = new Set();
        const seenCursors = new Set();
        let cursor = initialCursor;
        for (let index = 0; rows.length < args.limit && cursor; index += 1) {
            if (index >= 10) throw new CommandExecutionError('Airbnb StaysSearch API pagination exceeded ten pages before satisfying the limit');
            if (seenCursors.has(cursor)) throw new CommandExecutionError('Airbnb StaysSearch API repeated a page cursor');
            seenCursors.add(cursor);
            const pageBody = structuredClone(body);
            pageBody.variables.staysSearchRequest.cursor = cursor;
            pageBody.variables.staysMapSearchRequestV2.cursor = cursor;
            const response = await fetch(request.url, { method: 'POST', headers,
                body: JSON.stringify(pageBody), signal: AbortSignal.timeout(25000) });
            if (!response.ok) {
                if ([401, 403, 429].includes(response.status)) {
                    throw new AuthRequiredError('airbnb.com.sg', `Airbnb StaysSearch API returned HTTP ${response.status}; complete verification in this browser profile and retry`);
                }
                throw new CommandExecutionError(`Airbnb StaysSearch API returned HTTP ${response.status}`);
            }
            let result;
            try { result = await response.json(); }
            catch { throw new CommandExecutionError('Airbnb StaysSearch API returned invalid JSON'); }
            if (result.errors?.length) throw new CommandExecutionError('Airbnb StaysSearch API reported GraphQL errors');
            const search = result.data?.presentation?.staysSearch?.results;
            const listings = search?.searchResults;
            if (!Array.isArray(listings) || !Array.isArray(search?.paginationInfo?.pageCursors)) {
                throw new CommandExecutionError('Airbnb StaysSearch API returned a malformed results page');
            }
            if (!listings.length) {
                if (search.paginationInfo.pageCursors[index + 1]) throw new CommandExecutionError('Airbnb StaysSearch API returned an empty page before the reported end');
                break;
            }
            const before = rows.length;
            for (const listing of listings) {
                const encoded = listing.demandStayListing?.id;
                // Supplemental cards carry no listing id and are not exact stay offers.
                const id = typeof encoded === 'string'
                    ? Buffer.from(encoded, 'base64').toString('utf8').match(/^DemandStayListing:(\d+)$/)?.[1] : undefined;
                const label = listing.structuredDisplayPrice?.primaryLine?.accessibilityLabel || '';
                const priceMatch = label.match(/([\d,]+(?:\.\d+)?)\s*([A-Z]{3})\s+for\s+(\d+)\s+nights?/i);
                if (!id || !priceMatch || Number(priceMatch[3]) !== args.nights) continue;
                if (priceMatch[2] !== args.currency) {
                    throw new CommandExecutionError('Airbnb StaysSearch API returned a price in the wrong currency');
                }
                if (seen.has(id)) continue;
                seen.add(id);
                const rating = String(listing.avgRatingA11yLabel || '').match(/([\d.]+) out of 5 average rating(?:,\s*([\d,]+) reviews?)?/);
                const roomUrl = new URL(`https://www.airbnb.com.sg/rooms/${id}`);
                for (const [key, value] of query) roomUrl.searchParams.set(key, value);
                rows.push({ rank: rows.length + 1, id,
                    name: listing.nameLocalized?.localizedStringWithTranslationPreference || listing.subtitle || null,
                    description: listing.title || null,
                    rating: rating ? Number(rating[1]) : null,
                    reviews: rating?.[2] ? Number(rating[2].replaceAll(',', '')) : null,
                    price: Number(priceMatch[1].replaceAll(',', '')), priceUnit: 'stay',
                    currency: priceMatch[2], nights: args.nights, checkin: args.checkin,
                    checkout: args.checkout, url: roomUrl.href });
                if (rows.length >= args.limit) break;
            }
            if (rows.length === before) throw new CommandExecutionError('Airbnb StaysSearch API page had no new exact-date offers');
            cursor = search.paginationInfo.pageCursors[index + 1] || null;
        }
        if (!rows.length) throw new EmptyResultError('airbnb search', `No stays in ${args.destination} for the requested dates`);
        return rows;
    },
});
