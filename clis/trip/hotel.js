/** Hotel metadata from the site's first-party aggregate API. */
import { readTripHotelDetail } from '../_shared/trip-hotel-detail-api.js';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { buildHotelDetailUrl, parseHotelId } from './utils.js';

cli({
    site: 'trip',
    name: 'hotel',
    access: 'read',
    description: 'Show a Trip.com hotel detail by id (rating breakdown, amenities, check-in/out policy)',
    domain: 'trip.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'id', required: true, positional: true, help: 'Numeric Trip.com hotel id (discover via the hotels list; e.g. 715233)' },
    ],
    columns: [
        'hotelId', 'name', 'enName',
        'star', 'score', 'scoreLabel', 'reviewCount', 'ratingBreakdown',
        'facilities', 'checkInOut',
        'cityName', 'address', 'lat', 'lon',
        'url',
    ],
    func: async (page, kwargs) => {
        const hotelId = parseHotelId('id', kwargs.id);
        const url = buildHotelDetailUrl(hotelId);
        const detail = await readTripHotelDetail(page, 'trip', hotelId);
        return [{ ...detail, url }];
    },
});
