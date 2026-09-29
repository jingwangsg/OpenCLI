/**
 * Trip.com (international) round-trip flight search by IATA route + dates.
 *
 * The API returns outbound legs priced for a round trip. Return legs are
 * selected separately on the site.
 */
import { ArgumentError, EmptyResultError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { readTripFlights } from './flight-api.js';
import {
    buildFlightRoundSearchUrl,
    parseIataCode,
    parseIsoDate,
    parseListLimit,
} from './utils.js';

cli({
    site: 'trip',
    name: 'flight-round',
    access: 'read',
    description: 'Search Trip.com round-trip flights by IATA route + depart/return dates',
    domain: 'trip.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'from', required: true, positional: true, help: 'Departure IATA code (e.g. LON / LHR)' },
        { name: 'to', required: true, positional: true, help: 'Arrival IATA code (e.g. NYC / JFK)' },
        { name: 'depart', required: true, help: 'Outbound date (YYYY-MM-DD)' },
        { name: 'return', required: true, help: 'Return date (YYYY-MM-DD)' },
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
        const depart = parseIsoDate('depart', kwargs.depart);
        const ret = parseIsoDate('return', kwargs.return);
        if (depart >= ret) {
            throw new ArgumentError(`--depart must be before --return (got ${depart} .. ${ret})`);
        }
        const limit = parseListLimit(kwargs.limit);

        const searchUrl = buildFlightRoundSearchUrl(fromCode, toCode, depart, ret);
        const rows = await readTripFlights(page, searchUrl, { from: fromCode, to: toCode, depart, ret });
        if (rows.length === 0) {
            throw new EmptyResultError('trip flight-round', `No round-trip flights for ${fromCode} to ${toCode} on ${depart} .. ${ret}`);
        }
        return rows.slice(0, limit).map((r, i) => ({
            rank: i + 1,
            ...r,
        }));
    },
});
