/** Ctrip hotel listings from its first-party JSON search API. */
import { ArgumentError, EmptyResultError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { readTripHotelList } from '../_shared/trip-hotel-api.js';
import { mapHotelRow, parseCityId, parseIsoDate, parseStrictIntegerRange } from './utils.js';

const MIN_LIMIT = 1;
const MAX_LIMIT = 30;
const DEFAULT_LIMIT = 10;

function parseHotelLimit(raw) {
    return parseStrictIntegerRange('limit', raw, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT);
}

cli({
    site: 'ctrip',
    name: 'hotel-search',
    access: 'read',
    description: '通过酒店 API 搜索携程酒店（按城市和日期，1间1成人）',
    domain: 'hotels.ctrip.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'city', required: true, positional: true, help: 'Numeric Ctrip city ID (use `ctrip search` or `ctrip hotel-suggest` to discover)' },
        { name: 'checkin', required: true, help: 'Check-in date (YYYY-MM-DD)' },
        { name: 'checkout', required: true, help: 'Check-out date (YYYY-MM-DD)' },
        { name: 'limit', default: DEFAULT_LIMIT, help: `Number of hotels (${MIN_LIMIT}-${MAX_LIMIT})` },
    ],
    columns: [
        'rank', 'hotelId', 'name', 'enName',
        'star', 'score', 'scoreLabel', 'reviewCount',
        'cityName', 'district', 'address',
        'lat', 'lon',
        'price', 'currency', 'url',
    ],
    func: async (page, kwargs) => {
        const cityId = parseCityId(kwargs.city);
        const checkin = parseIsoDate('checkin', kwargs.checkin);
        const checkout = parseIsoDate('checkout', kwargs.checkout);
        if (checkin >= checkout) throw new ArgumentError(`--checkin must be earlier than --checkout (got ${checkin} >= ${checkout})`);
        const limit = parseHotelLimit(kwargs.limit);

        const hotels = await readTripHotelList(page, 'ctrip', { cityId, checkin, checkout, limit });
        if (!hotels.length) throw new EmptyResultError('ctrip hotel-search', `No hotels for city=${cityId} on ${checkin} → ${checkout}`);
        return hotels.map((hotel, index) => mapHotelRow(hotel, index));
    },
});

export const __test__ = { parseHotelLimit };
