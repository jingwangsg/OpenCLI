import { CommandExecutionError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { mapPlace, placeId, readMapsApi } from './api.js';

cli({
    site: 'google-maps', name: 'place', access: 'read',
    description: 'Read Google Maps place details by stable place id or full Maps URL',
    domain: 'www.google.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false,
    args: [{ name: 'place', positional: true, required: true, help: '0x…:0x… id or a full Google Maps place URL' }],
    columns: ['rank', 'placeId', 'name', 'rating', 'reviews', 'address', 'phone', 'website', 'priceRange', 'hours', 'location', 'url'],
    func: async (page, args) => {
        const id = placeId(args.place);
        const data = await readMapsApi(page, '/maps/preview/place', { pb: `!1m1!1s${id}` });
        const row = mapPlace(data[6], 1);
        if (row.placeId !== id) throw new CommandExecutionError('Google Maps returned a different place');
        return [row];
    },
});
