import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { mapPlace, readMapsApi } from './api.js';

cli({
    site: 'google-maps', name: 'search', access: 'read',
    description: 'Search Google Maps places through its JSON API',
    domain: 'www.google.com', strategy: Strategy.COOKIE, browser: true, navigateBefore: false,
    args: [
        { name: 'query', positional: true, required: true, help: 'Place name or category with a location' },
        { name: 'limit', type: 'int', default: 20, help: 'Number of places (1-100)' },
    ],
    columns: ['rank', 'placeId', 'name', 'rating', 'reviews', 'address', 'phone', 'website', 'priceRange', 'hours', 'location', 'url'],
    func: async (page, args) => {
        const query = String(args.query || '').trim();
        const limit = Number(args.limit ?? 20);
        if (!query || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new ArgumentError('Provide a query and a limit between 1 and 100');
        const rows = [];
        const seen = new Set();
        for (let offset = 0; rows.length < limit; offset += 20) {
            if (offset >= 200) throw new CommandExecutionError('Google Maps search exhausted ten pages before satisfying the limit');
            const data = await readMapsApi(page, '/search', { tbm: 'map', q: query, pb: `!7i20!8i${offset}!10b1` });
            if (!Array.isArray(data[0]?.[1]) || typeof data[0]?.[0] !== 'string' ||
                data[0][0].trim().toLowerCase() !== query.toLowerCase()) {
                throw new CommandExecutionError('Google Maps search returned a different query or malformed results');
            }
            const records = data[0][1];
            const metadata = records[0];
            const hasMetadata = metadata?.[14] == null && typeof metadata?.[8] === 'string' && typeof metadata?.[9] === 'string';
            const places = (hasMetadata ? records.slice(1) : records).map((entry) => entry?.[14]);
            if (places.some((place) => !Array.isArray(place))) throw new CommandExecutionError('Google Maps search returned a malformed place record');
            if (!places.length && Array.isArray(data[64]) && data[64].length) throw new CommandExecutionError('Google Maps returned an unsupported search response layout');
            if (!places.length) break;
            const before = rows.length;
            for (const place of places) {
                const row = mapPlace(place, rows.length + 1);
                if (seen.has(row.placeId)) continue;
                seen.add(row.placeId);
                rows.push(row);
                if (rows.length >= limit) break;
            }
            if (rows.length === before) throw new CommandExecutionError('Google Maps search repeated a results page');
            if (places.length < 20) break;
        }
        return rows;
    },
});
