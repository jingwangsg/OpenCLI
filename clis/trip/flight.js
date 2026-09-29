/**
 * Trip.com (international) one-way flight search by IATA route + date.
 *
 * Reads the full signed flight-search API result using the current browser
 * profile's cookies and the page-generated request headers.
 */
import { ArgumentError, EmptyResultError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { readTripFlights } from './flight-api.js';
import {
    buildFlightSearchUrl,
    parseIataCode,
    parseIsoDate,
    parseListLimit,
} from './utils.js';

cli({
    site: 'trip',
    name: 'flight',
    access: 'read',
    description: 'Search Trip.com one-way flights by IATA route + departure date',
    domain: 'trip.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'from', required: true, positional: true, help: 'Departure IATA code (e.g. LON / LHR)' },
        { name: 'to', required: true, positional: true, help: 'Arrival IATA code (e.g. NYC / JFK)' },
        { name: 'date', required: true, help: 'Departure date (YYYY-MM-DD)' },
        { name: 'limit', type: 'int', default: 20, help: 'Number of flights (1-50)' },
    ],
    columns: [
        'rank',
        'airline', 'flightNo',
        'departureTime', 'departureAirport',
        'arrivalTime', 'arrivalAirport',
        'departureDateTime', 'arrivalDateTime',
        'duration', 'stops', 'connections', 'layoversMinutes',
        'price', 'currency',
        'url',
    ],
    func: async (page, kwargs) => {
        const fromCode = parseIataCode('from', kwargs.from);
        const toCode = parseIataCode('to', kwargs.to);
        if (fromCode === toCode) {
            throw new ArgumentError(`--from and --to must differ (got ${fromCode})`);
        }
        const date = parseIsoDate('date', kwargs.date);
        const limit = parseListLimit(kwargs.limit);

        const searchUrl = buildFlightSearchUrl(fromCode, toCode, date);
        const rows = await readTripFlights(page, searchUrl, { from: fromCode, to: toCode, depart: date });
        if (rows.length === 0) {
            throw new EmptyResultError('trip flight', `No flights for ${fromCode} to ${toCode} on ${date}`);
        }
        return rows.slice(0, limit).map((r, i) => ({
            rank: i + 1,
            ...r,
        }));
    },
});
