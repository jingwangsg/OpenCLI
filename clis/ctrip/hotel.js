/** Hotel metadata from the site's first-party aggregate API. */
import { readTripHotelDetail } from '../_shared/trip-hotel-detail-api.js';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { buildHotelDetailUrl, parseHotelId } from './utils.js';

cli({
    site: 'ctrip',
    name: 'hotel',
    access: 'read',
    description: '查看携程单个酒店详情（评分细分、热门设施、入离政策、位置）',
    domain: 'hotels.ctrip.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'id', required: true, positional: true, help: 'Numeric Ctrip hotel id (use `ctrip hotel-suggest` to discover; e.g. 375539)' },
    ],
    columns: [
        'hotelId', 'name', 'enName',
        'star', 'score', 'scoreLabel', 'reviewCount', 'ratingBreakdown',
        'facilities', 'checkInOut',
        'cityName', 'address', 'lat', 'lon',
        'url',
    ],
    func: async (page, kwargs) => {
        const hotelId = parseHotelId(kwargs.id);
        const url = buildHotelDetailUrl(hotelId);
        const detail = await readTripHotelDetail(page, 'ctrip', hotelId);
        return [{ ...detail, url }];
    },
});
