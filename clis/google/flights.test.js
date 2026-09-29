import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { buildFlightBookingUrl, decodeFlightResponses, fetchFlightResults, selectNonstopFlight } from './flight-api.js';
import './flights.js';

const command = getRegistry().get('google/flights');
const args = { from: 'SIN', to: 'WSI', depart: '2026-12-01', return: '2026-12-04' };
const endpoint = 'https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/';

function rpc(data) {
    const frame = JSON.stringify([['wrb.fr', null, JSON.stringify(data)]]);
    return `)]}'\n\n${frame.length + 2}\n${frame}\n`;
}

function flight(from, to, date, number, { price = 641, connecting = false, hour = 11 } = {}) {
    const leg = [];
    leg[3] = from; leg[6] = to;
    leg[8] = [hour, 30]; leg[10] = [22, 20];
    leg[20] = date.split('-').map(Number); leg[21] = leg[20];
    leg[22] = ['SQ', number, null, 'Singapore Airlines'];
    return [['SQ', ['Singapore Airlines'], connecting ? [leg, leg] : [leg]], [[null, price], 'synthetic-selection']];
}

function searchResult(options) {
    return [null, [[], []], [options], null];
}

function page({ destination = 'WSI', cabin = 1, passengers = [1, 0, 0, 0] } = {}) {
    const journey = (from, to, date) => [[[[from, 0]]], [[[to, 0]]], null, 1, null, null, date];
    const criteria = [null, null, 1, null, [], cabin, passengers, null, null, null, null, null, null,
        [journey('SIN', destination, args.depart), journey(destination, 'SIN', args.return)], null, null, null, 1];
    const request = { url: endpoint + 'GetShoppingResults?hl=en', method: 'POST', requestBodyTruncated: false,
        requestBodyPreview: new URLSearchParams({ 'f.req': JSON.stringify([null, JSON.stringify([[], criteria, 0, 0, 0, 1])]), at: 'synthetic-csrf' }).toString(),
        requestHeaders: { 'content-type': 'application/x-www-form-urlencoded', 'x-goog-ext-259736195-jspb': '["en-US","SG","SGD"]',
            'X-Goog-BatchExecute-Bgr': 'synthetic-runtime-context' } };
    return { goto: vi.fn().mockResolvedValue(undefined), wait: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined), evaluate: vi.fn().mockResolvedValue(true),
        startNetworkCapture: vi.fn().mockResolvedValue(true),
        readNetworkCapture: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([request]),
        getCookies: vi.fn().mockResolvedValue([{ name: 'session', value: 'current-profile' }]),
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('Google Flights search and booking APIs', () => {
    it('selects both legs through API calls and verifies provider flight identities', async () => {
        const payloads = [];
        vi.stubGlobal('fetch', vi.fn(async (url, options) => {
            expect(options.headers.cookie).toBe('session=current-profile');
            expect(options.headers['X-Goog-BatchExecute-Bgr']).toBe('synthetic-runtime-context');
            const payload = JSON.parse(JSON.parse(new URLSearchParams(options.body).get('f.req'))[1]);
            payloads.push(structuredClone(payload));
            if (url.includes('GetBookingResults')) {
                const offers = [['Booking.com', 657], ['Expedia', 641]].map(([provider, price]) => [
                    0, [[provider.toUpperCase(), provider]], null, [['SQ', '261'], ['SQ', '262']], false, null, null, [[null, price]],
                ]);
                return new Response(rpc([null, [offers]]));
            }
            const optionsList = payload[1][13][0][8]
                ? [flight('WSI', 'SIN', args.return, '262', { hour: 23 })]
                : [flight('SIN', 'WSI', args.depart, '999', { connecting: true, price: 400 }),
                    flight('SIN', 'WSI', args.depart, '261')];
            return new Response(rpc(searchResult(optionsList)));
        }));
        const browser = page({ cabin: 3, passengers: [2, 0, 0, 0] });
        const rows = await command.func(browser, args);
        expect(payloads).toHaveLength(3);
        expect(payloads.every((payload) => payload[1][5] === 1 && JSON.stringify(payload[1][6]) === '[1,0,0,0]')).toBe(true);
        expect(payloads[1][1][13][0][8]).toEqual([['SIN', args.depart, 'WSI', null, 'SQ', '261']]);
        expect(payloads[2][1][13][1][8]).toEqual([['WSI', args.return, 'SIN', null, 'SQ', '262']]);
        expect(rows.map((row) => [row.provider, row.price])).toEqual([['Expedia', 641], ['Booking.com', 657]]);
        expect(rows[0]).toMatchObject({ currency: 'SGD', flightNo: 'SQ261 / SQ262',
            outboundAirline: 'Singapore Airlines', outboundDeparture: '11:30 AM on Tuesday, December 1',
            returnDeparture: '11:30 PM on Friday, December 4', separateTickets: null });
        expect(new URL(rows[0].url).pathname).toBe('/travel/flights/booking');
        expect(Object.keys(rows[0])).toEqual(command.columns);
        expect(browser.click).toHaveBeenCalledTimes(1);
        expect(browser.evaluate).toHaveBeenCalledTimes(1);
    });

    it('does not return a round-trip quote when only connecting return flights are offered', async () => {
        vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
            const payload = JSON.parse(JSON.parse(new URLSearchParams(options.body).get('f.req'))[1]);
            return new Response(rpc(searchResult(payload[1][13][0][8]
                ? [flight('WSI', 'SIN', args.return, '262', { connecting: true })]
                : [flight('SIN', 'WSI', args.depart, '261')])));
        }));
        await expect(command.func(page(), args)).rejects.toMatchObject({ code: 'EMPTY_RESULT' });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('rejects a captured request for another destination before replaying it', async () => {
        vi.stubGlobal('fetch', vi.fn());
        await expect(command.func(page({ destination: 'SYD' }), args)).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects invalid travel dates before opening the browser', async () => {
        const browser = page();
        await expect(command.func(browser, { ...args, depart: '2026-02-30' })).rejects.toMatchObject({ code: 'ARGUMENT' });
        expect(browser.goto).not.toHaveBeenCalled();
    });

    it('treats omitted protobuf zero hours as midnight and rejects wrong-date offers', () => {
        const option = flight('SIN', 'WSI', args.depart, '261', { hour: null });
        option[0][2][0][10] = [17];
        const body = rpc(searchResult([option]));
        expect(selectNonstopFlight(body, 'SIN', 'WSI', args.depart)).toMatchObject({ departure: '12:30 AM on Tuesday, December 1', arrival: '5:00 PM on Tuesday, December 1' });
        expect(() => selectNonstopFlight(body, 'SIN', 'WSI', '2026-12-02')).toThrowError(expect.objectContaining({ code: 'EMPTY_RESULT' }));
    });

    it('rejects a truncated RPC frame and an untrusted API origin', async () => {
        expect(() => decodeFlightResponses(rpc(searchResult([])).slice(0, -5))).toThrow('incomplete response frames');
        vi.stubGlobal('fetch', vi.fn());
        await expect(fetchFlightResults({ url: 'https://other.example/' }, [{ name: 'session', value: 'secret' }], 'GetBookingResults'))
            .rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('validates declared RPC lengths and Unicode character framing', () => {
        const body = rpc([null, ['日本語 ✈']]);
        expect(decodeFlightResponses(body)).toEqual([[null, ['日本語 ✈']]]);
        expect(() => decodeFlightResponses(body.replace(/\n\d+\n/, '\n999999\n'))).toThrow('incomplete response frames');
        const second = rpc([null, ['second']]).slice(6);
        expect(decodeFlightResponses(body + second)).toHaveLength(2);
    });

    it('encodes the selected airports, dates and flights in the public booking URL', () => {
        const url = new URL(buildFlightBookingUrl([['SIN', args.depart, 'WSI', null, 'SQ', '261'], ['WSI', args.return, 'SIN', null, 'SQ', '262']]));
        const decoded = Buffer.from(url.searchParams.get('tfs'), 'base64url').toString('utf8');
        expect(decoded).toContain(args.depart);
        expect(decoded).toContain(args.return);
        expect(decoded).toContain('261');
        expect(decoded).toContain('262');
        expect(url.searchParams.get('curr')).toBe('SGD');
        expect(url.searchParams.get('tfs')).toBe('CBwQAhpBEgoyMDI2LTEyLTAxIh8KA1NJThIKMjAyNi0xMi0wMRoDV1NJKgJTUTIDMjYxKABqBwgBEgNTSU5yBwgBEgNXU0kaQRIKMjAyNi0xMi0wNCIfCgNXU0kSCjIwMjYtMTItMDQaA1NJTioCU1EyAzI2MigAagcIARIDV1NJcgcIARIDU0lOQAFIAXABggELCP___________wGYAQE');
    });
});
