/** Trip.com hotel listings from the site's JSON search API. */
import { ArgumentError, EmptyResultError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { readTripHotelList } from '../_shared/trip-hotel-api.js';
import { buildHotelSearchUrl, parseCityId, parseIsoDate, parseListLimit } from './utils.js';

cli({
    site: 'trip',
    name: 'hotel-search',
    access: 'read',
    description: 'List Trip.com hotel API offers for one room and two adults by city id + dates',
    domain: 'trip.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'city', required: true, positional: true, help: 'Numeric Trip.com city id (e.g. 219 for Osaka)' },
        { name: 'checkin', required: true, help: 'Check-in date (YYYY-MM-DD)' },
        { name: 'checkout', required: true, help: 'Check-out date (YYYY-MM-DD)' },
        { name: 'limit', type: 'int', default: 20, help: 'Number of hotels (1-50)' },
    ],
    columns: [
        'rank', 'hotelId', 'name', 'score', 'reviewLabel', 'reviews',
        'location', 'room', 'price', 'totalPrice', 'totalPriceLabel', 'currency', 'url',
    ],
    func: async (page, kwargs) => {
        const cityId = parseCityId('city', kwargs.city);
        const checkin = parseIsoDate('checkin', kwargs.checkin);
        const checkout = parseIsoDate('checkout', kwargs.checkout);
        if (checkin >= checkout) {
            throw new ArgumentError(`--checkin must be before --checkout (got ${checkin} .. ${checkout})`);
        }
        const limit = parseListLimit(kwargs.limit);
        const searchUrl = buildHotelSearchUrl(cityId, checkin, checkout);
        const hotels = await readTripHotelList(page, 'trip', { cityId, checkin, checkout, limit });
        if (!hotels.length) throw new EmptyResultError('trip hotel-search', `No hotels for city ${cityId} on ${checkin} .. ${checkout}`);
        return hotels.map((hotel, index) => {
            const info = hotel.hotelInfo;
            const hotelId = String(info.summary.hotelId);
            const name = info.nameInfo.name;
            const room = hotel.roomInfo?.[0];
            const price = room?.priceInfo?.price;
            const totalText = room?.priceInfoLayer?.payInfo?.total?.content;
            const totalValue = typeof totalText === 'string' ? Number(totalText.replace(/[^0-9.]/g, '')) : NaN;
            const reviewText = info.commentInfo?.commenterNumber || '';
            const reviewMatch = String(reviewText).match(/([\d,.]+)\s*([kKmM]?)/);
            const reviews = reviewMatch ? Math.round(Number(reviewMatch[1].replaceAll(',', ''))
                * (reviewMatch[2].toLowerCase() === 'k' ? 1000 : reviewMatch[2].toLowerCase() === 'm' ? 1000000 : 1)) : null;
            const score = Number(info.commentInfo?.commentScore);
            return {
                rank: index + 1, hotelId, name: name.trim(),
                score: Number.isFinite(score) && score > 0 ? score : null,
                reviewLabel: info.commentInfo?.commentDescription || null,
                reviews: Number.isFinite(reviews) ? reviews : null,
                location: info.positionInfo?.positionDescs?.filter(Boolean).join(', ') || null,
                room: room?.summary?.physicsName || room?.summary?.saleRoomName || null,
                price: Number.isFinite(price) ? price : null,
                totalPrice: Number.isFinite(totalValue) ? totalValue : null,
                totalPriceLabel: room?.priceInfoLayer?.payInfo?.total?.title || null,
                currency: room?.priceInfo?.currency || null,
                url: searchUrl,
            };
        });
    },
});
