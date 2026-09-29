import { AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

export async function readTripHotelDetail(page, site, hotelId) {
    const trip = site === 'trip';
    const origin = trip ? 'https://www.trip.com' : 'https://m.ctrip.com';
    const service = trip ? '33269' : '33278';
    const cookies = await page.getCookies({ url: origin });
    // Ctrip omits check-in/out policies without dates. Match the sites' current
    // +08:00 default calendar; this command reports metadata, not room prices.
    const now = Date.now();
    const dates = [now, now + 86400000].map((time) =>
        new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(time)).replaceAll('-', ''));
    const body = { hotelId: Number(hotelId), checkIn: dates[0], checkOut: dates[1],
        adult: 2, child: 0, childrenAgeList: [], roomQuantity: 1,
        head: { bu: trip ? 'IBU' : 'HBU', currency: trip ? 'USD' : 'CNY', cver: '0',
            group: site, locale: trip ? 'en-US' : 'zh-CN', platform: 'PC' } };
    const response = await fetch(`${origin}/restapi/soa2/${service}/getHotelDetailAggregate`, {
        method: 'POST', headers: { 'content-type': 'application/json',
            cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') },
        body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
        if ([401, 403, 432].includes(response.status)) throw new AuthRequiredError(new URL(origin).hostname,
            `${site} hotel detail API returned HTTP ${response.status}; complete verification in this browser profile and retry`);
        throw new CommandExecutionError(`${site} hotel detail API returned HTTP ${response.status}`);
    }
    let result;
    try { result = await response.json(); }
    catch { throw new CommandExecutionError(`${site} hotel detail API returned invalid JSON`); }
    const detail = result?.data;
    if (result?.ResponseStatus?.Ack !== 'Success' || !detail || typeof detail !== 'object') {
        throw new CommandExecutionError(`${site} hotel detail API returned malformed data`);
    }
    const base = detail.hotelBaseInfo || {};
    const name = base.nameInfo || {};
    const clean = (value) => value == null ? null : String(value).replace(/\s+/g, ' ').trim() || null;
    const hotelName = clean(name.name);
    if (!base.masterHotelId || !hotelName) throw new EmptyResultError(`${site} hotel`, `No detail exposed for hotel id ${hotelId}`);
    if (String(base.masterHotelId) !== String(hotelId)) throw new CommandExecutionError(`${site} hotel detail API returned a different hotel`);
    const number = (value) => Number.isFinite(Number(value)) && Number(value) !== 0 ? Number(value) : null;
    const position = detail.hotelPositionInfo || {};
    const comment = detail.hotelComment?.comment || {};
    const scoreDetail = Array.isArray(comment.scoreDetail) ? comment.scoreDetail : [];
    const facilities = trip ? detail.hotelFacilityPopV2?.hotelPopularFacility?.list : detail.hotelFacilityBelt?.facilityList;
    if (facilities != null && !Array.isArray(facilities)) throw new CommandExecutionError(`${site} hotel detail API returned malformed facilities`);
    const policy = detail.hotelPolicyInfo?.checkInAndOut?.content;
    return {
        hotelId: String(base.masterHotelId), name: hotelName, enName: clean(name.nameEn),
        star: Number.isFinite(base.starInfo?.level) && base.starInfo.level > 0 ? base.starInfo.level : null,
        score: number(comment.score), scoreLabel: clean(comment.scoreDescription),
        reviewCount: Number.isFinite(comment.totalComment) && comment.totalComment > 0 ? comment.totalComment : null,
        ratingBreakdown: scoreDetail.map((entry) => entry?.showName && entry.showScore
            ? `${clean(entry.showName)} ${clean(entry.showScore)}` : null).filter(Boolean).join(' / ') || null,
        facilities: (Array.isArray(facilities) ? facilities : []).map((entry) => clean(entry?.facilityDesc)).filter(Boolean).join(' / ') || null,
        checkInOut: (Array.isArray(policy) ? policy : []).map((entry) => entry
            ? clean((trip ? entry.title || '' : '') + (entry.description || '')) : null).filter(Boolean).join(' / ') || null,
        cityName: clean(base.cityName), address: clean(position.address), lat: number(position.lat), lon: number(position.lng),
    };
}
