import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError, TimeoutError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { parseStaySearch } from '../_shared/stay-search.js';

const SEARCH_ENDPOINT = 'https://www.agoda.com/graphql/search';
const WAIT_FOR_RESULTS_JS = `new Promise((resolve) => {
  const check = () => {
    if (/captcha|access denied|verify you are human/i.test(document.title)) return 'auth';
    if (document.querySelector('[data-selenium="hotel-item"]')) return 'results';
    if (/No properties found|No properties available/i.test(document.body.innerText || '')) return 'empty';
    return null;
  };
  const first = check(); if (first) return resolve(first);
  const observer = new MutationObserver(() => { const found = check(); if (found) { observer.disconnect(); resolve(found); } });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => { observer.disconnect(); resolve('timeout'); }, 25000);
})`;

cli({
    site: 'agoda', name: 'search', access: 'read',
    description: 'Search Agoda hotel offers through its GraphQL API by city, dates, and adults',
    domain: 'agoda.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false,
    args: [
        { name: 'destination', required: true, positional: true, help: 'City name or Agoda city ID (e.g. Osaka / 9590)' },
        { name: 'checkin', required: true, help: 'Check-in date (YYYY-MM-DD)' },
        { name: 'checkout', required: true, help: 'Check-out date (YYYY-MM-DD)' },
        { name: 'adults', default: 2, help: 'Adults in one room (1-16)' },
        { name: 'currency', default: 'SGD', help: 'Currency code (e.g. SGD / USD / CNY)' },
        { name: 'limit', default: 10, help: 'Number of hotels (1-50)' },
    ],
    columns: ['rank', 'id', 'name', 'area', 'stars', 'rating', 'reviews', 'price', 'priceUnit',
        'totalPrice', 'currency', 'taxesIncluded', 'nights', 'checkin', 'checkout', 'url'],
    func: async (page, kwargs) => {
        const args = parseStaySearch(kwargs);
        let city = args.destination;
        if (!/^\d+$/.test(city)) {
            let payload;
            try {
                const response = await fetch(`https://www.agoda.com/api/cronos/search/GetUnifiedSuggestResult/3/1/1/0/en-us/?searchText=${encodeURIComponent(city)}`, {
                    signal: AbortSignal.timeout(15000),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                payload = await response.json();
            } catch (error) {
                throw new CommandExecutionError(`Agoda city lookup failed: ${error.message}`);
            }
            if (!Array.isArray(payload?.ViewModelList)) throw new CommandExecutionError('Agoda city lookup returned a malformed response');
            const candidates = new Map();
            for (const item of payload.ViewModelList) {
                const id = new URL(item.ResultUrl || '/', 'https://www.agoda.com').searchParams.get('city');
                if (id && /^\d+$/.test(id)) candidates.set(id, item.Name);
            }
            const exact = [...candidates].filter(([, name]) => name?.toLowerCase() === city.toLowerCase());
            const matches = exact.length ? exact : [...candidates];
            if (matches.length !== 1) throw new ArgumentError(`Choose a specific Agoda city or city ID: ${[...candidates].map(([id, name]) => `${name} (${id})`).join(', ') || 'no matching cities'}`);
            city = matches[0][0];
        }
        const query = new URLSearchParams({ city, checkIn: args.checkin, checkOut: args.checkout,
            adults: String(args.adults), rooms: '1', currency: args.currency });
        const searchUrl = `https://www.agoda.com/search?${query}`;
        if (!await page.startNetworkCapture?.('/graphql/search')) {
            throw new CommandExecutionError('Agoda search API capture is unavailable in this browser profile');
        }
        await page.goto(searchUrl, { waitUntil: 'none' });
        const state = await page.evaluate(WAIT_FOR_RESULTS_JS);
        if (state === 'auth') throw new AuthRequiredError('agoda.com', 'Complete the browser verification and retry');
        if (state === 'timeout') throw new TimeoutError('Agoda hotel search', 25);
        if (state === 'empty') throw new EmptyResultError('agoda search', `No hotels in ${args.destination} for the requested dates`);

        const captures = await page.readNetworkCapture();
        const request = captures.find((entry) => {
            if (entry.url !== SEARCH_ENDPOINT || entry.method !== 'POST' || entry.responseStatus !== 200 || entry.requestBodyTruncated) return false;
            try { return JSON.parse(entry.requestBodyPreview).operationName === 'citySearch'; }
            catch { return false; }
        });
        if (!request) throw new CommandExecutionError('Agoda citySearch API request was not captured');
        const body = JSON.parse(request.requestBodyPreview);
        const search = body.variables?.CitySearchRequest;
        const criteria = search?.searchRequest?.searchCriteria;
        if (Number(search?.cityId) !== Number(city) || criteria?.localCheckInDate !== args.checkin ||
            Number(criteria?.los) !== args.nights || Number(criteria?.adults) !== args.adults ||
            Number(criteria?.rooms) !== 1 || criteria?.currency !== args.currency) {
            throw new CommandExecutionError('Agoda citySearch API request did not match the requested stay');
        }
        const cookies = await page.getCookies({ url: 'https://www.agoda.com' });
        const headers = { ...request.requestHeaders,
            cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') };
        const rows = [];
        const seen = new Set();
        let pageNumber = Number(search.searchRequest.page.pageNumber) || 1;
        while (rows.length < args.limit) {
            if (pageNumber > 5) throw new CommandExecutionError('Agoda search API pagination exceeded five pages before satisfying the limit');
            const pageBody = structuredClone(body);
            pageBody.variables.CitySearchRequest.searchRequest.page.pageNumber = pageNumber;
            const response = await fetch(SEARCH_ENDPOINT, { method: 'POST', headers,
                body: JSON.stringify(pageBody), signal: AbortSignal.timeout(25000) });
            if (!response.ok) {
                if ([401, 403, 429].includes(response.status)) {
                    throw new AuthRequiredError('agoda.com', `Agoda search API returned HTTP ${response.status}; complete verification in this browser profile and retry`);
                }
                throw new CommandExecutionError(`Agoda search API returned HTTP ${response.status}`);
            }
            let result;
            try { result = await response.json(); }
            catch { throw new CommandExecutionError('Agoda search API returned invalid JSON'); }
            if (result.errors?.length) throw new CommandExecutionError('Agoda search API reported GraphQL errors');
            const properties = result.data?.citySearch?.properties;
            if (!Array.isArray(properties)) throw new CommandExecutionError('Agoda search API returned a malformed property list');
            if (!properties.length) break;
            const seenBefore = seen.size;
            for (const property of properties) {
                const id = String(property.propertyId || '');
                if (!/^\d+$/.test(id)) throw new CommandExecutionError('Agoda search API returned a property without an id');
                if (seen.has(id)) continue;
                seen.add(id);
                if (property.soldOut || property.pricing?.isAvailable === false) continue;
                const info = property.content?.informationSummary;
                const offer = property.pricing?.offers?.[0]?.roomOffers?.[0]?.room?.pricing?.[0];
                const nightly = offer?.price?.perNight?.inclusive?.display;
                const total = offer?.price?.perBook?.inclusive?.display;
                if (!info?.displayName || !Number.isFinite(nightly) ||
                    !Number.isFinite(total) || offer.currency !== args.currency ||
                    !info.propertyLinks?.propertyPage?.startsWith('/')) {
                    throw new CommandExecutionError('Agoda search API returned a property with missing identity or stay price');
                }
                const review = property.content?.reviews?.cumulative;
                const hotelUrl = new URL(info.propertyLinks.propertyPage, 'https://www.agoda.com');
                for (const [key, value] of Object.entries({ checkIn: args.checkin, los: String(args.nights),
                    adults: String(args.adults), rooms: '1', currency: args.currency })) hotelUrl.searchParams.set(key, value);
                rows.push({ rank: rows.length + 1, id, name: info.displayName,
                    area: info.address?.area?.name || null,
                    stars: Number.isFinite(info.rating) ? info.rating : null,
                    rating: Number.isFinite(review?.score) ? review.score : null,
                    reviews: Number.isInteger(review?.reviewCount) ? review.reviewCount : null,
                    price: nightly, priceUnit: 'night', totalPrice: total, currency: offer.currency,
                    taxesIncluded: true, nights: args.nights, checkin: args.checkin, checkout: args.checkout,
                    url: hotelUrl.href });
                if (rows.length >= args.limit) break;
            }
            if (seen.size === seenBefore) throw new CommandExecutionError('Agoda search API repeated a results page');
            pageNumber += 1;
        }
        if (!rows.length) throw new EmptyResultError('agoda search', `No available hotels in ${args.destination} for the requested dates`);
        return rows;
    },
});
