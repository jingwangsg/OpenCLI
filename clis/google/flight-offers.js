import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { decodeFlightBookingSelections, readBookingResults } from './flight-api.js';

cli({
    site: 'google',
    name: 'flight-offers',
    access: 'read',
    description: 'Read provider quotes from a selected Google Flights itinerary through its booking API',
    domain: 'google.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [{ name: 'url', positional: true, required: true,
        help: 'Google Flights booking URL with a tfs itinerary token and curr=SGD' }],
    columns: ['rank', 'provider', 'price', 'currency', 'flightNo', 'separateTickets', 'url'],
    func: async (page, args) => {
        let url;
        try { url = new URL(String(args.url)); }
        catch { throw new ArgumentError('url must be a Google Flights booking URL'); }
        if (url.protocol !== 'https:' || url.hostname !== 'www.google.com' ||
            url.pathname !== '/travel/flights/booking' || !url.searchParams.get('tfs') ||
            url.searchParams.get('curr') !== 'SGD') {
            throw new ArgumentError('url must be a Google Flights booking URL with tfs and curr=SGD');
        }
        const journeys = decodeFlightBookingSelections(url.searchParams.get('tfs'));
        if (!await page.startNetworkCapture?.('GetBookingResults')) {
            throw new CommandExecutionError('Google Flights booking API capture is unavailable in this browser profile');
        }
        await page.readNetworkCapture();
        await page.goto(url.href, { waitUntil: 'none' });
        const rows = (await readBookingResults(page, journeys)).sort((a, b) => a.price - b.price);
        return rows.map((row, index) => ({ rank: index + 1, ...row,
            currency: 'SGD', separateTickets: null, url: url.href }));
    },
});
