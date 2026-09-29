import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';

export function placeId(value) {
    const raw = String(value || '').trim();
    let candidate = raw;
    if (/^https?:/.test(raw)) {
        let url;
        try { url = new URL(raw); }
        catch { throw new ArgumentError('Expected a Google Maps place URL or 0x…:0x… place id'); }
        if (!['www.google.com', 'google.com', 'maps.google.com'].includes(url.hostname)) {
            throw new ArgumentError('Place URLs must belong to Google Maps');
        }
        try { candidate = decodeURIComponent(url.pathname + url.search).match(/0x[\da-f]+:0x[\da-f]+/i)?.[0] || ''; }
        catch { throw new ArgumentError('Google Maps place URL contains invalid percent encoding'); }
    }
    if (!/^0x[\da-f]{1,16}:0x[\da-f]{1,16}$/i.test(candidate)) throw new ArgumentError('Expected a Google Maps place URL or 64-bit 0x…:0x… place id');
    return candidate.split(':').map((part) => `0x${BigInt(part).toString(16)}`).join(':');
}

export function listId(value) {
    const raw = String(value || '').trim();
    let candidate = raw;
    if (/^https?:/.test(raw)) {
        let url;
        try { url = new URL(raw); }
        catch { throw new ArgumentError('Expected a Google Maps list URL or list id'); }
        if (!['www.google.com', 'google.com', 'maps.google.com'].includes(url.hostname)) throw new ArgumentError('List URLs must belong to Google Maps');
        try { candidate = decodeURIComponent(url.pathname + url.search).match(/!2s([A-Za-z0-9_-]+)/)?.[1] || ''; }
        catch { throw new ArgumentError('Google Maps list URL contains invalid percent encoding'); }
    }
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidate)) throw new ArgumentError('Expected a Google Maps list URL or list id');
    return candidate;
}

export async function readMapsApi(page, path, params) {
    if (!['/search', '/maps/preview/place', '/maps/preview/entitylist/getlist'].includes(path)) {
        throw new ArgumentError('Unsupported Google Maps read endpoint');
    }
    const cookies = await page.getCookies({ url: 'https://www.google.com' });
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const url = new URL(path, 'https://www.google.com');
    url.search = new URLSearchParams({ authuser: '0', hl: 'en', ...params }).toString();
    const response = await fetch(url.href, { headers: {
        cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '), 'User-Agent': userAgent,
    }, redirect: 'error', signal: AbortSignal.timeout(25000) });
    if ([401, 403, 429].includes(response.status)) throw new AuthRequiredError('google.com', `Google Maps returned HTTP ${response.status}; verify the selected profile`);
    if (!response.ok) throw new CommandExecutionError(`Google Maps API returned HTTP ${response.status}`);
    const body = await response.text();
    let data;
    try {
        data = JSON.parse(body.replace(/^\)\]\}'\s*/, ''));
        if (typeof data?.d === 'string') data = JSON.parse(data.d.replace(/^\)\]\}'\s*/, ''));
    } catch {
        if (/unusual traffic|captcha|consent.google/i.test(body)) throw new AuthRequiredError('google.com', 'Complete the Maps verification in the selected profile');
        throw new CommandExecutionError('Google Maps API returned invalid JSON');
    }
    if (!Array.isArray(data)) throw new CommandExecutionError('Google Maps API returned an unexpected response');
    return data;
}

export function mapPlace(data, rank) {
    if (!Array.isArray(data) || !/^0x[\da-f]+:0x[\da-f]+$/i.test(data[10] || '') ||
        typeof data[11] !== 'string' || !data[11].trim()) {
        throw new CommandExecutionError('Google Maps place data omitted a stable id or name');
    }
    const id = placeId(data[10]);
    const latitude = data[9]?.[2];
    const longitude = data[9]?.[3];
    const days = data[203]?.[0];
    if (days != null && (!Array.isArray(days) || days.some((day) => !Array.isArray(day) || typeof day[0] !== 'string' ||
        (day[3] != null && (!Array.isArray(day[3]) || day[3].some((slot) => !Array.isArray(slot) || typeof slot[0] !== 'string')))))) {
        throw new CommandExecutionError('Google Maps place returned malformed opening hours');
    }
    return {
        rank, placeId: id, name: data[11].trim(),
        rating: Number.isFinite(data[4]?.[7]) ? data[4][7] : null,
        reviews: Number.isInteger(data[4]?.[8]) ? data[4][8] : null,
        address: typeof data[18] === 'string' ? data[18] : null,
        phone: typeof data[178]?.[0]?.[0] === 'string' ? data[178][0][0] : null,
        website: typeof data[7]?.[0] === 'string' ? data[7][0] : null,
        priceRange: typeof data[4]?.[2] === 'string' ? data[4][2] : null,
        hours: Array.isArray(days) ? days.map((day) => `${day[0]}: ${(day[3] || []).map((slot) => slot[0]).join(', ')}`).join(' / ') : null,
        location: Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null,
        url: `https://www.google.com/maps/place/${encodeURIComponent(data[11].trim())}/data=!4m2!3m1!1s${id}`,
    };
}

export function mapsAccount(input, explicit) {
    let fromUrl;
    if (/^https?:/.test(String(input || ''))) {
        try { fromUrl = new URL(input).searchParams.get('authuser') ?? undefined; }
        catch { throw new ArgumentError('Invalid Google Maps URL'); }
    }
    if (explicit != null && fromUrl != null && String(explicit) !== fromUrl) throw new ArgumentError('The account argument conflicts with the URL authuser');
    const account = String(explicit ?? fromUrl ?? '0');
    if (!/^\d+$/.test(account)) throw new ArgumentError('Google Maps account must be a nonnegative account index');
    return account;
}

export async function readList(page, id, account = '0') {
    let list = (await readMapsApi(page, '/maps/preview/entitylist/getlist', {
        authuser: account, pb: `!1m4!1s${id}!2e1!3m1!1e1!2e2!3e3!4i500!8i3!16b1`,
    }))[0];
    // The first read is capped at 500 items; re-read with the exact total when the list is larger.
    if (Number.isSafeInteger(list?.[12]) && list[12] > 500) {
        list = (await readMapsApi(page, '/maps/preview/entitylist/getlist', {
            authuser: account, pb: `!1m4!1s${id}!2e1!3m1!1e1!2e2!3e3!4i${list[12]}!8i3!16b1`,
        }))[0];
    }
    const entries = list?.[8] === null && list[12] === 0 ? [] : list?.[8];
    if (list?.[0]?.[0] !== id || typeof list[4] !== 'string' || !Array.isArray(entries) ||
        (list[5] != null && typeof list[5] !== 'string') || !Number.isSafeInteger(list[12]) || entries.length !== list[12]) {
        throw new CommandExecutionError('Google Maps list returned a different list, malformed metadata, or fewer items than its total count');
    }
    const seen = new Set();
    const items = entries.map((item, index) => {
        const ids = item?.[1]?.[6];
        if (!Array.isArray(ids) || ids.length !== 2 || !ids.every((id) => typeof id === 'string' && /^-?\d+$/.test(id) &&
            BigInt(id) >= -(1n << 63n) && BigInt(id) < (1n << 64n)) ||
            typeof item[2] !== 'string' || !item[2].trim() || (item[3] != null && typeof item[3] !== 'string')) {
            throw new CommandExecutionError('Google Maps list item omitted its place identity, name, or note');
        }
        // The list endpoint serializes the same 64 bits as either signed or unsigned decimal strings.
        const id = ids.map((value) => `0x${BigInt.asUintN(64, BigInt(value)).toString(16)}`).join(':');
        if (seen.has(id)) throw new CommandExecutionError('Google Maps list returned duplicate place identities');
        seen.add(id);
        return { rank: index + 1, placeId: id, name: item[2], note: item[3] || '',
            url: `https://www.google.com/maps/place/${encodeURIComponent(item[2])}/data=!4m2!3m1!1s${id}?authuser=${account}` };
    });
    return { id, account, role: list[1], name: list[4], description: list[5] || '', items,
        url: `https://www.google.com/maps/@/data=!4m2!11m1!2s${id}?authuser=${account}` };
}
