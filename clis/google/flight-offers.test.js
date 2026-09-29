import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { buildFlightBookingUrl, decodeFlightBookingSelections } from './flight-api.js';
import './flight-offers.js';

const command = getRegistry().get('google/flight-offers');
const selections = [['SIN', '2026-12-01', 'WSI', null, 'SQ', '261'], ['WSI', '2026-12-04', 'SIN', null, 'SQ', '262']];
const url = buildFlightBookingUrl(selections);

function page({ currency = 'SGD', wrongRequest = false } = {}) {
    const journeys = selections.map((flight) => {
        const journey = [];
        journey[6] = flight[1]; journey[8] = [[...flight]];
        return journey;
    });
    if (wrongRequest) journeys[1][8][0][5] = '999';
    const criteria = []; criteria[13] = journeys;
    return { goto: vi.fn().mockResolvedValue(undefined), startNetworkCapture: vi.fn().mockResolvedValue(true),
        readNetworkCapture: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([{
            url: 'https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetBookingResults?hl=en',
            method: 'POST', requestBodyTruncated: false,
            requestBodyPreview: new URLSearchParams({ 'f.req': JSON.stringify([null, JSON.stringify([[], criteria, null, 0])]) }).toString(),
            requestHeaders: { 'x-goog-ext-259736195-jspb': JSON.stringify(['en-US', 'SG', currency]) },
        }]), getCookies: vi.fn().mockResolvedValue([{ name: 'session', value: 'current-profile' }]),
    };
}

function quote(flights = [['SQ', '261'], ['SQ', '262']]) {
    const offer = [null, [['Expedia', 'Expedia']], null, flights, null, null, null, [[null, 641]]];
    const frame = JSON.stringify([['wrb.fr', null, JSON.stringify([null, [[offer]]])]]);
    return new Response(`)]}'\n\n${frame.length + 2}\n${frame}\n`);
}

afterEach(() => vi.unstubAllGlobals());

describe('Google Flights exact itinerary offers', () => {
    it('returns provider quotes only for the URL-selected flights and currency', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => quote()));
        const rows = await command.func(page(), { url });
        expect(rows).toEqual([{ rank: 1, provider: 'Expedia', price: 641, currency: 'SGD',
            flightNo: 'SQ261 / SQ262', separateTickets: null, url }]);
        expect(decodeFlightBookingSelections(new URL(url).searchParams.get('tfs'))).toEqual(selections.map((leg) => [leg]));
    });

    it.each([{ currency: 'USD' }, { wrongRequest: true }])('rejects mismatched captured context before replay: %j', async (options) => {
        vi.stubGlobal('fetch', vi.fn());
        await expect(command.func(page(options), { url })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects a provider response for different flights', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => quote([['XX', '100'], ['XX', '101']])));
        await expect(command.func(page(), { url })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it('rejects an unselected or malformed tfs before navigating', async () => {
        const browser = page();
        await expect(command.func(browser, { url: 'https://www.google.com/travel/flights/booking?tfs=invalid&curr=SGD' }))
            .rejects.toMatchObject({ code: 'ARGUMENT' });
        expect(browser.goto).not.toHaveBeenCalled();
    });
});
