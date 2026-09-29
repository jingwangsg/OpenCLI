import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';

export async function readTripHotelList(page, site, { cityId, checkin, checkout, limit }) {
    const settings = site === 'ctrip'
        ? { origin: 'https://m.ctrip.com', bu: 'HBU', locale: 'zh-CN', currency: 'CNY', pageId: '10650171192', adults: 1 }
        : { origin: 'https://www.trip.com', bu: 'IBU', locale: 'en-US', currency: 'USD', pageId: '10320668148', adults: 2 };
    const request = {
        date: { dateInfo: { checkInDate: checkin.replaceAll('-', ''), checkOutDate: checkout.replaceAll('-', ''), offset: 0 },
            dateType: 1, flexibleDateOptions: {} },
        destination: { geo: { cityId: Number(cityId) }, keyword: { word: '' }, type: 1 },
        paging: { pageCode: settings.pageId, pageIndex: 1, pageSize: 10 },
        roomQuantity: 1,
        filters: [{ filterId: site === 'ctrip' ? '80|0' : '80|0|0', type: '80', value: '0' },
            { filterId: '29|1', subType: '2', type: '29', value: `1|${settings.adults}` }],
        head: { bu: settings.bu, currency: settings.currency, cver: '0', group: site,
            locale: settings.locale, pageId: settings.pageId, platform: 'PC', timezone: '8' },
    };
    const cookies = await page.getCookies({ url: settings.origin });
    const headers = { 'content-type': 'application/json', locale: settings.locale.replace('-', '_'), currency: settings.currency,
        cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') };
    const rows = [];
    const seen = new Set();
    for (let pageIndex = 1; rows.length < limit; pageIndex += 1) {
        if (pageIndex > 10) throw new CommandExecutionError(`${site} hotel API pagination exceeded ten pages before satisfying the limit`);
        const body = { ...request, paging: { ...request.paging, pageIndex } };
        const response = await fetch(`${settings.origin}/restapi/soa2/34951/fetchHotelList`, {
            method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
            if ([401, 403, 432].includes(response.status)) {
                throw new AuthRequiredError(new URL(settings.origin).hostname,
                    `${site} hotel API returned HTTP ${response.status}; complete verification in this browser profile and retry`);
            }
            throw new CommandExecutionError(`${site} hotel API returned HTTP ${response.status}`);
        }
        let result;
        try { result = await response.json(); }
        catch { throw new CommandExecutionError(`${site} hotel API returned invalid JSON`); }
        const list = result?.data?.hotelList;
        if (result?.ResponseStatus?.Ack !== 'Success' || !Array.isArray(list) ||
            Number(result?.data?.pagingInfo?.pageIndex) !== pageIndex) {
            throw new CommandExecutionError(`${site} hotel API returned an incomplete or mismatched page`);
        }
        if (!list.length) break;
        const before = rows.length;
        for (const hotel of list) {
            const id = String(hotel?.hotelInfo?.summary?.hotelId || '');
            const name = hotel?.hotelInfo?.nameInfo?.name;
            if (!/^\d+$/.test(id) || typeof name !== 'string' || !name.trim()) {
                throw new CommandExecutionError(`${site} hotel API returned a hotel without an id or name`);
            }
            if (seen.has(id)) continue;
            seen.add(id);
            rows.push(hotel);
            if (rows.length >= limit) break;
        }
        if (rows.length === before) throw new CommandExecutionError(`${site} hotel API repeated a results page`);
    }
    return rows;
}
