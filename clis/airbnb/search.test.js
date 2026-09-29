import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './search.js';

const command = getRegistry().get('airbnb/search');
const args = { destination: 'Bangkok', checkin: '2026-10-15', checkout: '2026-10-17',
    adults: 2, currency: 'SGD', limit: 2 };

function listing(id, quote = '$115 SGD for 2 nights') {
    return { demandStayListing: { id: Buffer.from(`DemandStayListing:${id}`).toString('base64') },
        nameLocalized: { localizedStringWithTranslationPreference: `Private room ${id}` },
        title: 'Room in Bangkok', avgRatingA11yLabel: '4.99 out of 5 average rating, 130 reviews',
        structuredDisplayPrice: { primaryLine: { accessibilityLabel: quote } },
    };
}

function page(query = 'Bangkok') {
    const request = { operationName: 'StaysSearch', variables: {
        staysSearchRequest: { cursor: 'cursor1', rawParams: [
            ['checkin', args.checkin], ['checkout', args.checkout], ['adults', '2'], ['query', query],
        ].map(([filterName, value]) => ({ filterName, filterValues: [value] })) },
        staysMapSearchRequestV2: { cursor: 'cursor1' },
    } };
    return { goto: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValueOnce({ firstId: '10' }).mockResolvedValueOnce('12'),
        click: vi.fn().mockResolvedValue(undefined),
        startNetworkCapture: vi.fn().mockResolvedValue(true),
        readNetworkCapture: vi.fn().mockResolvedValue([{
            url: 'https://www.airbnb.com.sg/api/v3/StaysSearch/hash', method: 'POST', responseStatus: 200,
            requestBodyTruncated: false, requestBodyPreview: JSON.stringify(request),
            responsePreview: JSON.stringify({ data: { presentation: { staysSearch: { results: {
                paginationInfo: { pageCursors: ['cursor0', 'cursor1'] },
            } } } } }),
            requestHeaders: { 'X-Airbnb-API-Key': 'browser-key', 'X-CSRF-Token': 'browser-csrf' },
        }]),
        getCookies: vi.fn().mockResolvedValue([{ name: 'session', value: 'current-profile' }]),
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('Airbnb StaysSearch API', () => {
    it('replays the captured request from page one and paginates without reading card prices', async () => {
        const cursors = [];
        vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
            expect(options.headers.cookie).toBe('session=current-profile');
            const cursor = JSON.parse(options.body).variables.staysSearchRequest.cursor;
            cursors.push(cursor);
            const searchResults = cursor === 'cursor0'
                ? [listing('10'), listing('11', '$99 SGD for 3 nights')]
                : [listing('10'), listing('12')];
            return new Response(JSON.stringify({ data: { presentation: { staysSearch: { results: {
                searchResults, paginationInfo: { pageCursors: ['cursor0', 'cursor1', 'cursor2'] },
            } } } } }), { status: 200 });
        }));
        const browser = page();
        const rows = await command.func(browser, args);
        expect(cursors).toEqual(['cursor0', 'cursor1']);
        expect(rows.map((row) => row.id)).toEqual(['10', '12']);
        expect(rows[0]).toMatchObject({ price: 115, priceUnit: 'stay', currency: 'SGD',
            rating: 4.99, reviews: 130, nights: 2 });
        expect(Object.keys(rows[0])).toEqual(command.columns);
        expect(browser.click).toHaveBeenCalledWith('a[aria-label="Next"]');
    });

    it('rejects a captured request for a different destination before replay', async () => {
        const apiFetch = vi.fn();
        vi.stubGlobal('fetch', apiFetch);
        await expect(command.func(page('Osaka'), args)).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it('rejects a price in the wrong currency', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {
            presentation: { staysSearch: { results: { searchResults: [listing('10', '$115 USD for 2 nights')],
                paginationInfo: { pageCursors: ['cursor0'] } } } },
        } }), { status: 200 })));
        await expect(command.func(page(), { ...args, limit: 1 })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it('does not send profile cookies to a captured URL on another origin', async () => {
        const browser = page();
        const entries = await browser.readNetworkCapture();
        entries[0].url = 'https://unrelated.example/api/v3/StaysSearch/hash';
        const apiFetch = vi.fn();
        vi.stubGlobal('fetch', apiFetch);
        await expect(command.func(browser, args)).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(apiFetch).not.toHaveBeenCalled();
        expect(browser.getCookies).not.toHaveBeenCalled();
    });

    it.each(['repeated', 'empty', 'partial', 'cap'])('rejects %s API pages instead of returning partial rows', async (failure) => {
        let number = 0;
        vi.stubGlobal('fetch', vi.fn(async () => {
            number += 1;
            const pageCursors = failure === 'repeated' ? ['cursor0', 'cursor0']
                : Array.from({ length: 12 }, (_, i) => `cursor${i}`);
            return new Response(JSON.stringify({
                ...(failure === 'partial' ? { errors: [{ message: 'upstream failed' }] } : {}),
                data: { presentation: { staysSearch: { results: {
                    searchResults: failure === 'empty' ? [] : [listing(String(number))], paginationInfo: { pageCursors },
                } } } },
            }));
        }));
        await expect(command.func(page(), { ...args, limit: 50 })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it.each(['missing', 'truncated'])('rejects a %s captured response before fetching', async (failure) => {
        const browser = page();
        const entries = await browser.readNetworkCapture();
        if (failure === 'missing') delete entries[0].responsePreview;
        else entries[0].responseBodyTruncated = true;
        const apiFetch = vi.fn();
        vi.stubGlobal('fetch', apiFetch);
        await expect(command.func(browser, args)).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(apiFetch).not.toHaveBeenCalled();
    });
});
