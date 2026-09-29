import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './search.js';

const command = getRegistry().get('agoda/search');
const args = { destination: '9395', checkin: '2026-10-15', checkout: '2026-10-17',
    adults: 2, currency: 'SGD', limit: 2 };

function property(id, { soldOut = false, currency = 'SGD' } = {}) {
    return { propertyId: id, soldOut: soldOut ? {} : null,
        content: { informationSummary: {
            displayName: `Hotel ${id}`, rating: 4,
            address: { area: { name: 'Bangkok' } },
            propertyLinks: { propertyPage: `/hotel-${id}/hotel/bangkok-th.html` },
        }, reviews: { cumulative: { score: 8.8, reviewCount: 9993 } } },
        pricing: { isAvailable: !soldOut, offers: soldOut ? [] : [{ roomOffers: [{ room: {
            pricing: [{ currency, price: {
                perNight: { inclusive: { display: 172.5 } },
                perBook: { inclusive: { display: 345 } },
            } }],
        } }] }] },
    };
}

function page(cityId = 9395) {
    const body = { operationName: 'citySearch', variables: { CitySearchRequest: {
        cityId, searchRequest: { searchCriteria: { localCheckInDate: args.checkin,
            los: 2, adults: 2, rooms: 1, currency: 'SGD' }, page: { pageNumber: 1, pageToken: 'current' } },
    } } };
    return { goto: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue('results'),
        startNetworkCapture: vi.fn().mockResolvedValue(true),
        readNetworkCapture: vi.fn().mockResolvedValue([{
            url: 'https://www.agoda.com/graphql/search', method: 'POST', responseStatus: 200,
            requestBodyTruncated: false, requestBodyPreview: JSON.stringify(body),
            requestHeaders: { 'x-gate-meta': 'browser-generated' },
        }]),
        getCookies: vi.fn().mockResolvedValue([{ name: 'session', value: 'current-profile' }]),
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('Agoda hotel GraphQL search', () => {
    it('replays the current-profile request, skips sold-out properties and fetches page two', async () => {
        const pages = [];
        const apiFetch = vi.fn(async (url, options) => {
            expect(url).toBe('https://www.agoda.com/graphql/search');
            expect(options.headers.cookie).toBe('session=current-profile');
            const number = JSON.parse(options.body).variables.CitySearchRequest.searchRequest.page.pageNumber;
            pages.push(number);
            const properties = number === 1 ? [property(10), property(11, { soldOut: true })]
                : [property(12)];
            return new Response(JSON.stringify({ data: { citySearch: { properties } } }), { status: 200 });
        });
        vi.stubGlobal('fetch', apiFetch);
        const rows = await command.func(page(), args);
        expect(pages).toEqual([1, 2]);
        expect(rows.map((row) => row.id)).toEqual(['10', '12']);
        expect(rows[0]).toMatchObject({ price: 172.5, priceUnit: 'night', totalPrice: 345,
            taxesIncluded: true, stars: 4, rating: 8.8, reviews: 9993, currency: 'SGD' });
        expect(Object.keys(rows[0])).toEqual(command.columns);
    });

    it('resolves a city name before replaying its citySearch request', async () => {
        const browser = page(5085);
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (String(url).includes('GetUnifiedSuggestResult')) return new Response(JSON.stringify({ ViewModelList: [
                { Name: 'Tokyo', ResultUrl: '/search?city=5085' },
                { Name: 'Tokyo', ResultUrl: '/search?city=5085&tracking=abc' },
            ] }), { status: 200 });
            return new Response(JSON.stringify({ data: { citySearch: { properties: [property(20)] } } }), { status: 200 });
        }));
        const rows = await command.func(browser, { ...args, destination: 'Tokyo', limit: 1 });
        expect(rows[0].id).toBe('20');
        expect(new URL(browser.goto.mock.calls[0][0]).searchParams.get('city')).toBe('5085');
    });

    it('rejects a captured request for a different city before replay', async () => {
        const apiFetch = vi.fn();
        vi.stubGlobal('fetch', apiFetch);
        await expect(command.func(page(5085), args)).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it.each(['repeated', 'partial', 'cap'])('rejects %s API results instead of returning partial rows', async (failure) => {
        vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
            const number = JSON.parse(options.body).variables.CitySearchRequest.searchRequest.page.pageNumber;
            return new Response(JSON.stringify({
                ...(failure === 'partial' ? { errors: [{ message: 'upstream failed' }] } : {}),
                data: { citySearch: { properties: [property(failure === 'cap' ? number : 1)] } },
            }));
        }));
        await expect(command.func(page(), { ...args, limit: 50 })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it('returns fewer rows only when the next API page establishes exhaustion', async () => {
        vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
            const number = JSON.parse(options.body).variables.CitySearchRequest.searchRequest.page.pageNumber;
            return new Response(JSON.stringify({ data: { citySearch: { properties: number === 1 ? [property(1)] : [] } } }));
        }));
        expect(await command.func(page(), args)).toHaveLength(1);
    });
});
