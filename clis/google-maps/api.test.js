import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { listId, mapPlace, placeId, readMapsApi } from './api.js';
import './search.js';
import './place.js';
import './list.js';

function page() {
    return { getCookies: vi.fn().mockResolvedValue([{ name: 'session', value: 'profile-cookie' }]),
        evaluate: vi.fn().mockResolvedValue('Browser UA'), goto: vi.fn(), click: vi.fn() };
}

function place(number) {
    const data = [];
    data[4] = []; data[4][2] = '$20–40'; data[4][7] = 4.8; data[4][8] = 120;
    data[7] = ['https://example.com']; data[9] = [null, null, 1.3, 103.8];
    data[10] = `0x1:0x${number.toString(16)}`; data[11] = `Place ${number}`;
    data[18] = 'Singapore'; data[178] = [['6000 0000']];
    data[203] = [[['Tuesday', 2, [2026, 9, 29], [['10 AM–7 PM', [[10], [19]]]]]]];
    return data;
}

function response(value) { return new Response(")]}'\n" + JSON.stringify(value)); }

afterEach(() => vi.unstubAllGlobals());

describe('Google Maps JSON API commands', () => {
    it('paginates with the protobuf offset and never navigates or clicks', async () => {
        const offsets = [];
        vi.stubGlobal('fetch', vi.fn(async (url, options) => {
            expect(options.headers.cookie).toBe('session=profile-cookie');
            const query = new URL(url).searchParams;
            const offset = Number(query.get('pb').match(/!8i(\d+)/)[1]);
            offsets.push(offset);
            const records = Array.from({ length: 20 }, (_, i) => { const row = []; row[14] = place(offset + i + 1); return row; });
            return response([[query.get('q'), records]]);
        }));
        const browser = page();
        const command = getRegistry().get('google-maps/search');
        const rows = await command.func(browser, { query: 'cafes in Singapore', limit: 35 });
        expect(offsets).toEqual([0, 20]);
        expect(rows).toHaveLength(35);
        expect(new Set(rows.map((row) => row.placeId)).size).toBe(35);
        expect(Object.keys(rows[0])).toEqual(command.columns);
        expect(rows[0].hours).toBe('Tuesday: 10 AM–7 PM');
        expect(browser.goto).not.toHaveBeenCalled();
        expect(browser.click).not.toHaveBeenCalled();
    });

    it('rejects repeated pages instead of returning partial search results', async () => {
        const records = Array.from({ length: 20 }, (_, i) => { const row = []; row[14] = place(i + 1); return row; });
        vi.stubGlobal('fetch', vi.fn(async () => response([['query', records]])));
        await expect(getRegistry().get('google-maps/search').func(page(), { query: 'query', limit: 25 }))
            .rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it('rejects a detail response for a different place', async () => {
        const data = []; data[6] = place(2);
        vi.stubGlobal('fetch', vi.fn(async () => response(data)));
        await expect(getRegistry().get('google-maps/place').func(page(), { place: '0x1:0x1' }))
            .rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it.each(['18446744073709551615', '-1'])('preserves saved-place 64-bit identity %s and exact note text', async (wireId) => {
        const list = []; list[0] = ['test-list-id']; list[4] = 'Test list'; list[5] = 'Description';
        const item = []; item[1] = []; item[1][6] = ['1', wireId];
        item[2] = 'Example'; item[3] = '备注\nsecond line'; list[8] = [item]; list[12] = 1;
        vi.stubGlobal('fetch', vi.fn(async () => response([list])));
        const browser = page();
        expect(await getRegistry().get('google-maps/list').func(browser, { list: 'test-list-id' })).toEqual([
            { rank: 1, placeId: '0x1:0xffffffffffffffff', name: 'Example', note: '备注\nsecond line',
                url: 'https://www.google.com/maps/place/Example/data=!4m2!3m1!1s0x1:0xffffffffffffffff?authuser=0' },
        ]);
        expect(await getRegistry().get('google-maps/list-info').func(browser, { list: 'test-list-id' }))
            .toEqual([{ listId: 'test-list-id', name: 'Test list', description: 'Description', count: 1,
                url: 'https://www.google.com/maps/@/data=!4m2!11m1!2stest-list-id?authuser=0' }]);
        expect(browser.goto).not.toHaveBeenCalled();
        expect(browser.click).not.toHaveBeenCalled();
    });

    it('distinguishes empty lists from malformed or different lists', async () => {
        const list = []; list[0] = ['test-list-id']; list[4] = 'Empty'; list[8] = []; list[12] = 0;
        vi.stubGlobal('fetch', vi.fn(async () => response([list])));
        expect(await getRegistry().get('google-maps/list').func(page(), { list: 'test-list-id' })).toEqual([]);
        await expect(getRegistry().get('google-maps/list').func(page(), { list: 'different-list' }))
            .rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it('does not treat a GET mutation as an allowed read', async () => {
        const browser = page();
        await expect(readMapsApi(browser, '/maps/preview/entitylist/updateitem', {})).rejects.toMatchObject({ code: 'ARGUMENT' });
        expect(browser.getCookies).not.toHaveBeenCalled();
    });

    it('validates public identifiers and does not silently invent a place name', () => {
        expect(placeId('https://www.google.com/maps/place/Example/data=!1s0x0001:0x0002')).toBe('0x1:0x2');
        expect(listId('https://www.google.com/maps/@/data=!4m2!11m1!2stest-list-id')).toBe('test-list-id');
        expect(() => placeId('https://other.example/maps/place/Example/data=!1s0x1:0x2')).toThrow('Google Maps');
        const data = place(1); data[11] = '  ';
        expect(() => mapPlace(data, 1)).toThrow('stable id or name');
    });
});

describe('Google Maps completeness and account invariants', () => {
    it('keeps the URL account and rejects conflicting explicit accounts', async () => {
        const list = []; list[0] = ['test-list-id']; list[4] = 'List'; list[8] = []; list[12] = 0;
        const fetchMock = vi.fn(async (url) => {
            expect(new URL(url).searchParams.get('authuser')).toBe('1');
            return response([list]);
        });
        vi.stubGlobal('fetch', fetchMock);
        const url = 'https://www.google.com/maps/@/data=!4m2!11m1!2stest-list-id?authuser=1';
        expect(await getRegistry().get('google-maps/list').func(page(), { list: url })).toEqual([]);
        await expect(getRegistry().get('google-maps/list').func(page(), { list: url, account: 0 })).rejects.toMatchObject({ code: 'ARGUMENT' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it.each([null, 'wrong type'])('rejects malformed list items %s', async (item) => {
        const list = []; list[0] = ['test-list-id']; list[4] = 'List'; list[8] = [item]; list[12] = 1;
        vi.stubGlobal('fetch', vi.fn(async () => response([list])));
        await expect(getRegistry().get('google-maps/list').func(page(), { list: 'test-list-id' })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });
    it('does not report a truncated list as complete', async () => {
        const list = []; list[0] = ['test-list-id']; list[4] = 'List'; list[8] = []; list[12] = 113;
        vi.stubGlobal('fetch', vi.fn(async () => response([list])));
        await expect(getRegistry().get('google-maps/list').func(page(), { list: 'test-list-id' })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });
    it('rejects malformed business records instead of treating them as pagination exhaustion', async () => {
        const records = Array.from({ length: 20 }, (_, i) => { const row = []; row[14] = place(i + 1); return row; });
        records[3] = [null];
        vi.stubGlobal('fetch', vi.fn(async () => response([['query', records]])));
        await expect(getRegistry().get('google-maps/search').func(page(), { query: 'query', limit: 35 })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });
    it('recognizes a metadata-only empty result and fails on an unsupported nonempty layout', async () => {
        const metadata = []; metadata[8] = 'request'; metadata[9] = 'tracking';
        vi.stubGlobal('fetch', vi.fn(async () => response([['query', [metadata]]])));
        expect(await getRegistry().get('google-maps/search').func(page(), { query: 'query' })).toEqual([]);
        const data = [['query', [metadata]]]; data[64] = [[1]];
        vi.stubGlobal('fetch', vi.fn(async () => response(data)));
        await expect(getRegistry().get('google-maps/search').func(page(), { query: 'query' })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });
    it('accepts its own emitted place URLs without losing identity', () => {
        const row = mapPlace(place(17), 1);
        expect(placeId(row.url)).toBe(row.placeId);
        expect(() => placeId('0x10000000000000000:0x1')).toThrow('64-bit');
    });
});
