import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { listId, mapPlace, mapsAccount, placeId, readList, readMapsApi } from './api.js';

// Maps uses GET for these mutations. Keep them separate from the read endpoint allowlist.
// [endpoint, APP_OPTIONS[28] token field, APP_OPTIONS[3] endpoint index] come from the site's EntityListService constructors and operation builders.
const OPERATIONS = { save: ['createitem', 29, 96], note: ['updateitem', 31, 102], 'list-description': ['update', 30, 101] };

async function writeMapsApi(page, list, operation, id, value, place) {
    const [endpoint, tokenField, endpointIndex] = OPERATIONS[operation];
    const cookies = await page.getCookies({ url: 'https://www.google.com' });
    const headers = { cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
        'User-Agent': await page.evaluate(() => navigator.userAgent) };
    const bootstrap = await fetch(`https://www.google.com/maps?authuser=${list.account}&hl=en`, {
        headers, redirect: 'error', signal: AbortSignal.timeout(25000),
    });
    if (!bootstrap.ok) throw new CommandExecutionError(`Google Maps session bootstrap returned HTTP ${bootstrap.status}`);
    const html = await bootstrap.text();
    const marker = 'window.APP_OPTIONS=';
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) throw new AuthRequiredError('google.com', 'Google Maps did not return the selected account bootstrap');
    const start = markerIndex + marker.length;
    let end = start, depth = 0, quoted = false, escaped = false;
    for (; end < html.length; end++) {
        const char = html[end];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '[') depth++;
        else if (char === ']' && --depth === 0) { end++; break; }
    }
    let options;
    try { options = JSON.parse(html.slice(start, end)); }
    catch { throw new CommandExecutionError('Google Maps session bootstrap layout changed'); }
    const token = options[28]?.[tokenField - 1];
    let apiUrl;
    try { apiUrl = new URL(options[3]?.[endpointIndex] || '', 'https://www.google.com'); }
    catch { throw new CommandExecutionError('Google Maps session bootstrap returned an invalid endpoint URL'); }
    const ei = html.match(/var kEI='([A-Za-z0-9_-]+)'/)?.[1];
    if (apiUrl.origin !== 'https://www.google.com' || apiUrl.pathname !== `/maps/preview/entitylist/${endpoint}` ||
        apiUrl.searchParams.get('authuser') !== list.account || typeof token !== 'string' || !token || !ei) {
        throw new CommandExecutionError('Google Maps write context omitted the exact endpoint, account, or operation token');
    }
    const text = (field, value) => `!${field}z${Buffer.from(value, 'utf8').toString('base64url')}`;
    const message = (field, body) => `!${field}m${body.split('!').length - 1}${body}`;
    const identity = message(1, `!1s${list.id}!2e1!3m1!1e1`);
    const flow = `!1s${ei}!7e81!28e2`;
    let pb;
    if (operation === 'list-description') {
        pb = identity + text(3, value) + message(4, flow) + text(6, token);
    } else {
        const ids = id.split(':').map((part) => BigInt(part).toString());
        const feature = `!1y${ids[0]}!2y${ids[1]}`;
        const itemIdentity = '!1m1!1e1' + message(2, feature);
        if (operation === 'note') {
            pb = identity + message(2, message(1, itemIdentity) + text(2, value)) + message(3, flow) + text(4, token);
        } else {
            const coordinates = place.location ? message(6, `!3d${place.location.latitude}!4d${place.location.longitude}`) : '';
            const item = message(2, coordinates + message(7, feature)) + text(3, place.name) + message(9, itemIdentity);
            pb = identity + message(2, item) + message(3, flow) + text(4, token);
        }
    }
    apiUrl.searchParams.set('pb', pb);
    let response;
    try {
        response = await fetch(apiUrl.href, { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error('write HTTP failure');
        const data = JSON.parse((await response.text()).replace(/^\)\]\}'\s*/, ''));
        if (!Array.isArray(data) || data[1] != null) throw new Error('write acknowledgement failure');
    } catch {
        throw new CommandExecutionError('Google Maps write outcome is uncertain; read the list before retrying. The write was not retried.');
    }
}

export async function mutateList(page, args, operation) {
    const id = listId(args.list);
    const account = mapsAccount(args.list, args.account);
    const target = operation === 'list-description' ? null : placeId(args.place);
    const value = operation === 'save' ? null : String(args.text ?? '');
    if (value !== null && value.length > (operation === 'note' ? 4000 : 400)) throw new ArgumentError(`${operation} exceeds the Maps text length limit`);
    const list = await readList(page, id, account);
    if (list.role !== 1) throw new AuthRequiredError('google.com', 'The selected Google account does not own this list; choose its account index');
    const item = list.items.find((item) => item.placeId === target);
    if (operation === 'note' && !item) throw new ArgumentError('The place is not in this list; save it first');
    const before = operation === 'save' ? !!item : operation === 'note' ? item.note : list.description;
    const after = operation === 'save' ? true : value;
    const row = { operation, status: before === after ? 'unchanged' : 'preview', listId: id, placeId: target, before, after };
    if (before === after || !args.execute) return [row];
    let place;
    if (operation === 'save') {
        const data = await readMapsApi(page, '/maps/preview/place', { authuser: account, pb: `!1m1!1s${target}` });
        place = mapPlace(data[6], 1);
        if (place.placeId !== target) throw new CommandExecutionError('Google Maps returned a different place before saving');
    }
    await writeMapsApi(page, list, operation, target, value, place);
    let updated;
    try { updated = await readList(page, id, account); }
    catch { throw new CommandExecutionError('The Maps write was submitted, but the fresh list read failed; check before retrying'); }
    const updatedItem = updated.items.find((item) => item.placeId === target);
    const actual = operation === 'save' ? !!updatedItem : operation === 'note' ? updatedItem?.note : updated.description;
    if (actual !== after) throw new CommandExecutionError('The Maps write was submitted, but the fresh list does not confirm the requested value; check before retrying');
    const expectedCount = list.items.length + (operation === 'save' ? 1 : 0);
    const changedElsewhere = updated.name !== list.name || updated.items.length !== expectedCount ||
        (operation !== 'list-description' && updated.description !== list.description) ||
        list.items.some((previous) => {
            const current = updated.items.find((item) => item.placeId === previous.placeId);
            return !current || (operation === 'note' && previous.placeId === target ? current.note !== value : current.note !== previous.note);
        });
    if (changedElsewhere) throw new CommandExecutionError('The target value was written, but other list content also changed; inspect the fresh list before retrying');
    return [{ ...row, status: 'verified' }];
}

for (const operation of Object.keys(OPERATIONS)) {
    cli({
        site: 'google-maps', name: operation, access: 'write',
        description: operation === 'save' ? 'Save a place to a Google Maps list' : operation === 'note' ? 'Set a saved place note' : 'Set a Google Maps list description',
        domain: 'www.google.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false,
        args: [
            { name: 'list', positional: true, required: true, help: 'List id or full Maps list URL' },
            ...(operation === 'list-description' ? [] : [{ name: 'place', positional: true, required: true, help: 'Place id or full Maps place URL' }]),
            ...(operation === 'save' ? [] : [{ name: 'text', positional: true, required: true, help: 'Exact new text; an empty string clears it' }]),
            { name: 'account', type: 'int', help: 'Google account index; defaults to the URL authuser or 0' },
            { name: 'execute', type: 'bool', default: false, help: 'Submit and verify the change; default previews it' },
        ],
        columns: ['operation', 'status', 'listId', 'placeId', 'before', 'after'],
        func: (page, args) => mutateList(page, args, operation),
    });
}
