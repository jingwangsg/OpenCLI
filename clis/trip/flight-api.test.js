import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseFlightStream, readTripFlights } from './flight-api.js';

const searchUrl = 'https://us.trip.com/flights/showfarefirst?dcity=sin&acity=osa&ddate=2026-11-27&rdate=2026-12-06&triptype=rt';
const route = { from: 'SIN', to: 'OSA', depart: '2026-11-27', ret: '2026-12-06' };
const sections = [
    { departDateTime: '2026-11-27 20:20:00', arriveDateTime: '2026-11-28 00:10:00',
        departPoint: { cityCode: 'SIN', airportCode: 'SIN' }, arrivePoint: { cityCode: 'HKG', airportCode: 'HKG' },
        flightInfo: { flightNo: 'CX636', airlineCode: 'CX' } },
    { departDateTime: '2026-11-28 01:50:00', arriveDateTime: '2026-11-28 06:20:00',
        departPoint: { cityCode: 'HKG', airportCode: 'HKG' }, arrivePoint: { cityCode: 'OSA', airportCode: 'KIX' },
        flightInfo: { flightNo: 'CX566', airlineCode: 'CX' } },
];
const result = {
    basicInfo: { recordCount: 1, currency: 'USD' },
    airlineList: [{ code: 'CX', name: 'Cathay Pacific' }],
    itineraryList: [{ journeyList: [{ duration: 540, transSectionList: sections }],
        policies: [{ seatCount: 4, price: { totalPrice: 624 } }] }],
};

function capturedPage({ requestDate = route.depart, status = 200 } = {}) {
    return {
        startNetworkCapture: vi.fn().mockResolvedValue(true),
        goto: vi.fn().mockResolvedValue(undefined),
        readNetworkCapture: vi.fn().mockResolvedValue([{
            url: 'https://us.trip.com/restapi/soa2/27015/FlightListSearchSSE', method: 'POST',
            responseStatus: status, requestBodyTruncated: false,
            requestBodyPreview: JSON.stringify({ searchCriteria: { journeyInfoTypes: [
                { departCode: 'SIN', arriveCode: 'OSA', departDate: requestDate },
                { departCode: 'OSA', arriveCode: 'SIN', departDate: route.ret },
            ] } }),
            requestHeaders: { token: 'signed', 'w-payload-source': 'opaque', currency: 'USD' },
        }]),
        getCookies: vi.fn().mockResolvedValue([{ name: 'session', value: 'profile-cookie' }]),
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('Trip.com flight API', () => {
    it('replays the page-signed request with current cookies and reads the complete itinerary', async () => {
        const page = capturedPage();
        const apiFetch = vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify(result)}\n\n`, {
            status: 200, headers: { 'content-type': 'text/event-stream' },
        }));
        vi.stubGlobal('fetch', apiFetch);
        const rows = await readTripFlights(page, searchUrl, route);
        expect(page.startNetworkCapture).toHaveBeenCalledWith('FlightListSearchSSE');
        expect(page.goto).toHaveBeenCalledWith(searchUrl, { waitUntil: 'none' });
        expect(apiFetch).toHaveBeenCalledOnce();
        expect(apiFetch.mock.calls[0][1].headers).toMatchObject({ token: 'signed',
            'w-payload-source': 'opaque', cookie: 'session=profile-cookie' });
        expect(rows).toEqual([{ airline: 'Cathay Pacific', flightNo: 'CX636 / CX566',
            departureTime: '20:20', departureAirport: 'SIN', arrivalTime: '06:20', arrivalAirport: 'KIX',
            departureDateTime: '2026-11-27 20:20:00', arrivalDateTime: '2026-11-28 06:20:00',
            duration: '9h 0m', stops: '1 stop', connections: 'HKG', layoversMinutes: '100',
            price: 624, currency: 'USD', url: searchUrl }]);
    });

    it('rejects a captured request for a different date before calling the API', async () => {
        const apiFetch = vi.fn();
        vi.stubGlobal('fetch', apiFetch);
        await expect(readTripFlights(capturedPage({ requestDate: '2026-11-28' }), searchUrl, route))
            .rejects.toMatchObject({ code: 'COMMAND_EXEC', message: expect.stringContaining('route and dates') });
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it('rejects partial SSE results and preserves an empty complete result', () => {
        expect(() => parseFlightStream(`data: ${JSON.stringify({ ...result, basicInfo: { recordCount: 2, currency: 'USD' } })}\n\n`))
            .toThrow('complete itinerary list');
        expect(parseFlightStream('data: {"basicInfo":{"recordCount":0,"currency":"USD"},"itineraryList":[]}\n\n')
            .itineraryList).toEqual([]);
    });

    it('rejects a verification response before replaying it', async () => {
        const apiFetch = vi.fn();
        vi.stubGlobal('fetch', apiFetch);
        await expect(readTripFlights(capturedPage({ status: 432 }), searchUrl, route))
            .rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
        expect(apiFetch).not.toHaveBeenCalled();
    });
});
