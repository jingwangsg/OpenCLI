import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './mutations.js';

const id = 'test-list-id';
const fid = '0x1:0xffffffffffffffff';
const browser = () => ({ getCookies: vi.fn().mockResolvedValue([{ name: 'sid', value: 'test' }]),
    evaluate: vi.fn().mockResolvedValue('Browser UA'), goto: vi.fn(), click: vi.fn() });
function list(note = 'before', description = 'old description', included = true, role = 1) {
    const data = []; data[0] = [id]; data[1] = role; data[4] = 'Test list'; data[5] = description;
    const item = []; item[1] = []; item[1][6] = ['1', '-1']; item[2] = 'Place'; item[3] = note;
    data[8] = included ? [item] : []; data[12] = data[8].length;
    return [data];
}
function reply(data) { return new Response(")]}'\n" + JSON.stringify(data)); }
function bootstrap(account = '1') {
    const options = []; options[2] = 'Quoted \" value \\ with ] bracket'; options[3] = []; options[28] = [];
    for (const [index, path, tokenField] of [[96, 'createitem', 29], [101, 'update', 30], [102, 'updateitem', 31]]) {
        options[3][index] = `/maps/preview/entitylist/${path}?authuser=${account}&hl=en`;
        options[28][tokenField - 1] = `token-${path}`;
    }
    return new Response(`var kEI='test-context';window.APP_OPTIONS=${JSON.stringify(options)};`);
}
const run = (name, page, args) => getRegistry().get(`google-maps/${name}`).func(page, { list: id, account: 1, place: fid, ...args });
afterEach(() => vi.unstubAllGlobals());

describe('Google Maps mutation contracts', () => {
    it('previews exact values without constructing or sending a mutation', async () => {
        const fetchMock = vi.fn(async (url) => { expect(new URL(url).pathname).toBe('/maps/preview/entitylist/getlist'); return reply(list()); });
        vi.stubGlobal('fetch', fetchMock);
        const page = browser();
        expect(await run('note', page, { text: '新备注\n第二行' })).toEqual([{ operation: 'note', status: 'preview', listId: id, placeId: fid, before: 'before', after: '新备注\n第二行' }]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(page.goto).not.toHaveBeenCalled(); expect(page.click).not.toHaveBeenCalled();
    });
    it('preserves an existing saved place and its note as a no-op', async () => {
        const fetchMock = vi.fn(async () => reply(list('existing note'))); vi.stubGlobal('fetch', fetchMock);
        expect(await run('save', browser(), { execute: true })).toMatchObject([{ status: 'unchanged', before: true, after: true }]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it.each([['note', '新备注\n😀', 'updateitem', 4], ['list-description', 'New description 😀', 'update', 6]])('binds %s to the requested account and verifies a fresh read', async (operation, text, endpoint, tokenField) => {
        let reads = 0, writes = 0;
        vi.stubGlobal('fetch', vi.fn(async (rawUrl, options) => {
            const url = new URL(rawUrl);
            expect(url.searchParams.get('authuser')).toBe('1');
            if (url.pathname === '/maps') return bootstrap();
            if (url.pathname.endsWith('/getlist')) return reply(++reads === 1 ? list() : operation === 'note' ? list(text) : list('before', text));
            expect(url.pathname).toBe(`/maps/preview/entitylist/${endpoint}`); writes++;
            expect(options.redirect).toBe('error'); expect(options.cache).toBe('no-store');
            const pb = url.searchParams.get('pb');
            expect(pb).toContain(`!1s${id}`);
            expect(pb).toContain(`!${operation === 'note' ? 2 : 3}z${Buffer.from(text).toString('base64url')}`);
            expect(pb).toContain(`!${tokenField}z${Buffer.from(`token-${endpoint}`).toString('base64url')}`);
            if (operation === 'note') expect(pb).toContain('!1y1!2y18446744073709551615');
            const value = Buffer.from(text).toString('base64url');
            const token = Buffer.from(`token-${endpoint}`).toString('base64url');
            expect(pb).toBe(operation === 'note'
                ? `!1m4!1stest-list-id!2e1!3m1!1e1!2m7!1m5!1m1!1e1!2m2!1y1!2y18446744073709551615!2z${value}!3m3!1stest-context!7e81!28e2!4z${token}`
                : `!1m4!1stest-list-id!2e1!3m1!1e1!3z${value}!4m3!1stest-context!7e81!28e2!6z${token}`);
            return reply([]);
        }));
        const page = browser();
        expect(await run(operation, page, { text, execute: true })).toMatchObject([{ status: 'verified' }]);
        expect({ reads, writes }).toEqual({ reads: 2, writes: 1 });
        expect(page.goto).not.toHaveBeenCalled(); expect(page.click).not.toHaveBeenCalled();
    });
    it('saves the exact place through createitem and reads membership afterward', async () => {
        let reads = 0, writes = 0;
        vi.stubGlobal('fetch', vi.fn(async (rawUrl) => {
            const url = new URL(rawUrl);
            if (url.pathname === '/maps') return bootstrap();
            if (url.pathname.endsWith('/getlist')) return reply(list('', '', ++reads > 1));
            if (url.pathname.endsWith('/place')) {
                const place = []; place[10] = fid; place[11] = 'Place'; place[9] = [null, null, 1.3, 103.8];
                const data = []; data[6] = place; return reply(data);
            }
            expect(url.pathname).toBe('/maps/preview/entitylist/createitem'); writes++;
            expect(url.searchParams.get('pb')).toBe(`!1m4!1stest-list-id!2e1!3m1!1e1!2m14!2m6!6m2!3d1.3!4d103.8!7m2!1y1!2y18446744073709551615!3zUGxhY2U!9m5!1m1!1e1!2m2!1y1!2y18446744073709551615!3m3!1stest-context!7e81!28e2!4z${Buffer.from('token-createitem').toString('base64url')}`);
            return reply([]);
        }));
        expect(await run('save', browser(), { execute: true })).toMatchObject([{ status: 'verified', after: true }]);
        expect(writes).toBe(1); expect(reads).toBe(2);
    });
    it('rejects a bootstrap for another account before sending a mutation', async () => {
        const fetchMock = vi.fn(async (url) => new URL(url).pathname === '/maps' ? bootstrap('0') : reply(list()));
        vi.stubGlobal('fetch', fetchMock);
        await expect(run('note', browser(), { text: 'new', execute: true })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    it('rejects insufficient list permission and text overflow', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => reply(list('', '', true, 4))));
        await expect(run('note', browser(), { text: 'new', execute: true })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
        await expect(run('list-description', browser(), { text: 'x'.repeat(401), execute: true })).rejects.toMatchObject({ code: 'ARGUMENT' });
    });
    it.each(['http', 'ack', 'read'])('never retries a write after %s uncertainty', async (failure) => {
        let reads = 0, writes = 0;
        vi.stubGlobal('fetch', vi.fn(async (rawUrl) => {
            const url = new URL(rawUrl);
            if (url.pathname === '/maps') return bootstrap();
            if (url.pathname.endsWith('/getlist')) { reads++; return reply(list()); }
            writes++;
            if (failure === 'http') throw new Error('Connection lost');
            if (failure === 'ack') return reply([null, ['error']]);
            return reply([]);
        }));
        await expect(run('note', browser(), { text: 'new', execute: true })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(writes).toBe(1);
        expect(reads).toBe(failure === 'read' ? 2 : 1);
    });
});

describe('Google Maps independent verification failures', () => {
    it.each(['missing-member', 'other-note', 'description', 'read-error'])('does not confirm a mutation after %s', async (failure) => {
        let reads = 0, writes = 0;
        const before = list();
        const other = []; other[1] = []; other[1][6] = ['1', '2']; other[2] = 'Other'; other[3] = 'Preserve me';
        before[0][8].push(other); before[0][12] = 2;
        vi.stubGlobal('fetch', vi.fn(async (rawUrl) => {
            const url = new URL(rawUrl);
            if (url.pathname === '/maps') return bootstrap();
            if (url.pathname.endsWith('/getlist')) {
                if (++reads === 1) return reply(before);
                if (failure === 'read-error') throw new Error('Read connection failed');
                const after = structuredClone(before); after[0][8][0][3] = 'new';
                if (failure === 'missing-member') { after[0][8].pop(); after[0][12] = 1; }
                if (failure === 'other-note') after[0][8][1][3] = 'Unexpected change';
                if (failure === 'description') after[0][5] = 'Unexpected change';
                return reply(after);
            }
            writes++; return reply([]);
        }));
        await expect(run('note', browser(), { text: 'new', execute: true })).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
        expect(writes).toBe(1); expect(reads).toBe(2);
    });
});
