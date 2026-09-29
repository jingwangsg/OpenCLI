import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './hotel-search.js';

const command = getRegistry().get('trip/hotel-search');
const args = { city: '219', checkin: '2026-11-28', checkout: '2026-12-01', limit: 3 };

function hotel(id, name, price, total) {
    return { hotelInfo: {
        summary: { hotelId: id }, nameInfo: { name },
        commentInfo: { commentScore: '9.3', commentDescription: 'Great', commenterNumber: '1.2K reviews' },
        positionInfo: { positionDescs: ['Dotonbori', 'Near Namba'] },
    }, roomInfo: [{ summary: { physicsName: 'Standard Double' },
        priceInfo: { price, currency: 'USD' },
        priceInfoLayer: { payInfo: { total: { content: `$${total}`, title: 'Prepay Online' } } },
    }] };
}

function page() {
    return { goto: vi.fn().mockResolvedValue(undefined),
        getCookies: vi.fn().mockResolvedValue([{ name: 'session', value: 'current-profile' }]),
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('Trip.com hotel search API', () => {
    it('queries dates and city directly, paginates, and reports nightly and stay totals', async () => {
        const pages = [];
        const apiFetch = vi.fn(async (_url, options) => {
            const body = JSON.parse(options.body);
            const index = body.paging.pageIndex;
            expect(body.destination.geo.cityId).toBe(219);
            expect(body.date.dateInfo).toMatchObject({ checkInDate: '20261128', checkOutDate: '20261201' });
            pages.push(index);
            expect(options.headers.cookie).toBe('session=current-profile');
            const hotels = index === 1 ? [hotel('1', 'Hotel A', 88, '291.41'), hotel('2', 'Hotel B', 53, '178.60')]
                : [hotel('1', 'Hotel A', 88, '291.41'), hotel('3', 'Hotel C', 71, '234.50')];
            return new Response(JSON.stringify({ ResponseStatus: { Ack: 'Success' },
                data: { pagingInfo: { pageIndex: index }, hotelList: hotels } }), { status: 200 });
        });
        vi.stubGlobal('fetch', apiFetch);
        const browser = page();
        const rows = await command.func(browser, args);
        expect(browser.goto).not.toHaveBeenCalled();
        expect(pages).toEqual([1, 2]);
        expect(rows.map((row) => row.hotelId)).toEqual(['1', '2', '3']);
        expect(rows[0]).toMatchObject({ name: 'Hotel A', reviews: 1200, room: 'Standard Double',
            price: 88, totalPrice: 291.41, totalPriceLabel: 'Prepay Online', currency: 'USD' });
        expect(Object.keys(rows[0])).toEqual(command.columns);
    });

    it('rejects invalid dates before calling the API', async () => {
        const apiFetch = vi.fn();
        vi.stubGlobal('fetch', apiFetch);
        await expect(command.func(page(), { ...args, checkout: args.checkin })).rejects.toMatchObject({ code: 'ARGUMENT' });
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it('rejects an API page whose index differs from the request', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            ResponseStatus: { Ack: 'Success' }, data: { pagingInfo: { pageIndex: 2 }, hotelList: [hotel('1', 'A', 88, '291.41')] },
        }), { status: 200 })));
        await expect(command.func(page(), args)).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it('rejects repeated results instead of returning an incomplete list', async () => {
        vi.stubGlobal('fetch', vi.fn(async (_url, options) => new Response(JSON.stringify({
            ResponseStatus: { Ack: 'Success' }, data: { pagingInfo: { pageIndex: JSON.parse(options.body).paging.pageIndex },
                hotelList: [hotel('1', 'A', 88, '291.41')] },
        }))));
        await expect(command.func(page(), args)).rejects.toMatchObject({ code: 'COMMAND_EXEC', message: expect.stringContaining('repeated') });
    });

    it('does not report success when a page limit truncates available results', async () => {
        vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
            const pageIndex = JSON.parse(options.body).paging.pageIndex;
            return new Response(JSON.stringify({ ResponseStatus: { Ack: 'Success' },
                data: { pagingInfo: { pageIndex }, hotelList: [hotel(String(pageIndex), 'A', 88, '291.41')] } }));
        }));
        await expect(command.func(page(), { ...args, limit: 20 })).rejects.toMatchObject({ code: 'COMMAND_EXEC', message: expect.stringContaining('ten pages') });
    });
});
