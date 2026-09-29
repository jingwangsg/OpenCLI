import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBookingHotels } from './search-api.js';

const url = 'https://www.booking.com/searchresults.html?ss=Osaka&checkin=2026-11-28&checkout=2026-12-01&group_adults=2&no_rooms=1&group_children=0&selected_currency=SGD';
const args = { destination: 'Osaka', checkin: '2026-11-28', checkout: '2026-12-01',
    adults: 2, rooms: 1, children: 0, currency: 'SGD', limit: 2, offset: 0 };

function hotel(id, currency = 'SGD') {
    return { displayName: { text: `Hotel ${id}` },
        basicPropertyData: { id, pageName: `hotel-${id}`, location: { countryCode: 'jp' },
            starRating: { value: 4 }, reviewScore: { score: 9.1, reviewCount: 159 } },
        priceDisplayInfoIrene: { displayPrice: { amountPerStay: {
            amountUnformatted: 388.922, currency,
        } } },
        location: { mainDistance: '3 km from centre' },
        matchingUnitConfigurations: { unitConfigurations: [{ name: 'Standard Double' }] },
    };
}

function page(context = { csrf: 'browser-token', userAgent: 'Browser UA' }) {
    return { goto: vi.fn().mockResolvedValue(undefined), evaluate: vi.fn().mockResolvedValue(context),
        getCookies: vi.fn().mockResolvedValue([{ name: 'session', value: 'current-profile' }]),
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('Booking.com FullSearch API', () => {
    it('queries the requested stay directly and follows the actual page size', async () => {
        const offsets = [];
        const apiFetch = vi.fn(async (_url, options) => {
            expect(options.headers.cookie).toBe('session=current-profile');
            expect(options.headers['x-booking-csrf-token']).toBe('browser-token');
            expect(options.headers['User-Agent']).toBe('Browser UA');
            const input = JSON.parse(options.body).variables.input;
            expect(input.sorters.selectedSorter).toBe('popularity');
            expect(input.dates).toEqual({ checkin: args.checkin, checkout: args.checkout });
            expect(input.location.searchString).toBe(args.destination);
            offsets.push(input.pagination.offset);
            const results = [hotel(input.pagination.offset === 0 ? 1 : 2)];
            return new Response(JSON.stringify({ data: { searchQueries: { search: {
                __typename: 'SearchQueryOutput', results, pagination: { nbResultsTotal: 50, nbResultsPerPage: 20 },
            } } } }), { status: 200 });
        });
        vi.stubGlobal('fetch', apiFetch);
        const browser = page();
        const rows = await readBookingHotels(browser, url.replace('searchresults.html', 'searchresults.zh-cn.html'), args);
        expect(offsets).toEqual([0, 20]);
        expect(rows.map((row) => row.slug)).toEqual(['hotel-1', 'hotel-2']);
        expect(rows[0]).toMatchObject({ price_amount: 388.92, price_currency: 'SGD',
            star_rating: 4, review_score: 9.1, review_count: 159,
            recommended_room: 'Standard Double', url: 'https://www.booking.com/hotel/jp/hotel-1.html' });
    });

    it('rejects a missing API session context before sending requests', async () => {
        const apiFetch = vi.fn();
        vi.stubGlobal('fetch', apiFetch);
        await expect(readBookingHotels(page({}), url, args)).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it('rejects a price in the wrong currency', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {
            searchQueries: { search: { __typename: 'SearchQueryOutput', results: [hotel(1, 'JPY')], pagination: { nbResultsTotal: 1, nbResultsPerPage: 20 } } },
        } }), { status: 200 })));
        await expect(readBookingHotels(page(), url, { ...args, limit: 1 })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it.each(['repeated', 'empty', 'partial', 'cap'])('rejects %s API results instead of returning partial rows', async (failure) => {
        vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
            const offset = JSON.parse(options.body).variables.input.pagination.offset;
            return new Response(JSON.stringify({
                ...(failure === 'partial' ? { errors: [{ message: 'upstream failed' }] } : {}),
                data: { searchQueries: { search: { __typename: 'SearchQueryOutput', results: failure === 'empty' ? [] : [hotel(failure === 'cap' ? offset + 1 : 1)],
                    pagination: { nbResultsTotal: 1000, nbResultsPerPage: 20 } } } },
            }));
        }));
        await expect(readBookingHotels(page(), url, { ...args, limit: 50 })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it('reports a genuine zero-result API response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { searchQueries: { search: {
            __typename: 'SearchQueryOutput', results: [], pagination: { nbResultsTotal: 0, nbResultsPerPage: 20 },
        } } } }))));
        await expect(readBookingHotels(page(), url, args)).rejects.toMatchObject({ code: 'EMPTY_RESULT' });
    });

    it('does not return a recommended-date price as the requested stay', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { searchQueries: { search: {
            __typename: 'SearchQueryOutput', results: [
                { ...hotel(1), recommendedDate: { checkin: '2026-11-29', checkout: args.checkout } }, hotel(2),
            ], pagination: { nbResultsTotal: 2, nbResultsPerPage: 20 },
        } } } }))));
        const rows = await readBookingHotels(page(), url, args);
        expect(rows.map((row) => row.slug)).toEqual(['hotel-2']);
    });
});
