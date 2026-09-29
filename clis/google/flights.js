import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { waitForApiRequest } from '../_shared/api-request.js';
import { buildFlightBookingUrl, fetchFlightResults, parseBookingResults, selectNonstopFlight } from './flight-api.js';

cli({
    site: 'google',
    name: 'flights',
    access: 'read',
    description: 'Compare Google Flights nonstop round trips for one adult in economy through its APIs',
    domain: 'google.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'from', required: true, positional: true, help: 'Departure airport IATA code (e.g. SIN)' },
        { name: 'to', required: true, positional: true, help: 'Arrival airport IATA code (e.g. SYD / WSI)' },
        { name: 'depart', required: true, help: 'Outbound date (YYYY-MM-DD)' },
        { name: 'return', required: true, help: 'Return date (YYYY-MM-DD)' },
    ],
    columns: [
        'rank', 'provider', 'price', 'currency', 'flightNo',
        'outboundAirline', 'outboundDeparture', 'outboundArrival',
        'returnAirline', 'returnDeparture', 'returnArrival',
        'separateTickets', 'url',
    ],
    func: async (page, args) => {
        const from = String(args.from || '').trim().toUpperCase();
        const to = String(args.to || '').trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) {
            throw new ArgumentError('from and to must be different 3-letter airport IATA codes');
        }
        const depart = String(args.depart || '').trim();
        const ret = String(args.return || '').trim();
        for (const [name, value] of [['depart', depart], ['return', ret]]) {
            const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            const date = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
            if (!date || date.toISOString().slice(0, 10) !== value) {
                throw new ArgumentError(`${name} must be a valid YYYY-MM-DD date`);
            }
        }
        if (depart >= ret) throw new ArgumentError('depart must be before return');

        const searchUrl = new URL('https://www.google.com/travel/flights');
        searchUrl.searchParams.set('hl', 'en');
        searchUrl.searchParams.set('curr', 'SGD');
        searchUrl.searchParams.set('q', `Flights from ${from} to ${to} on ${depart} through ${ret}`);
        await page.goto(searchUrl.href);
        await page.wait({ selector: 'button[aria-label^="Stops,"]', timeout: 25 });
        if (!await page.startNetworkCapture?.('GetShoppingResults')) {
            throw new CommandExecutionError('Google Flights search API capture is unavailable in this browser profile');
        }
        await page.readNetworkCapture();
        await page.click('button[aria-label^="Stops,"]');
        await page.wait({ selector: '[role="dialog"] [role="radiogroup"]', timeout: 10 });
        const selected = await page.evaluate(() => {
            const option = [...document.querySelectorAll('[role="dialog"] label')]
                .find((label) => label.textContent.trim() === 'Nonstop only');
            if (option) option.click();
            return Boolean(option);
        });
        if (!selected) throw new CommandExecutionError('Google Flights nonstop filter was not found');
        const request = await waitForApiRequest(page, (entry) =>
            entry.url.startsWith('https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults?')
            && entry.method === 'POST', 'Google Flights search API request');
        let criteria;
        let context;
        try {
            const encoded = JSON.parse(new URLSearchParams(request.requestBodyPreview).get('f.req'));
            criteria = JSON.parse(encoded[1])[1];
            context = JSON.parse(request.requestHeaders['x-goog-ext-259736195-jspb']);
        } catch { throw new CommandExecutionError('Google Flights search API request was malformed'); }
        const journeys = criteria?.[13];
        if (context?.[2] !== 'SGD' || !Array.isArray(journeys) || journeys.length !== 2 ||
            journeys.some((journey, index) => journey?.[0]?.[0]?.[0]?.[0] !== (index ? to : from) ||
                journey?.[1]?.[0]?.[0]?.[0] !== (index ? from : to) || journey?.[6] !== (index ? ret : depart))) {
            throw new CommandExecutionError('Google Flights search API request did not match the requested route, dates, and currency');
        }
        criteria[5] = 1;
        criteria[6] = [1, 0, 0, 0];
        const cookies = await page.getCookies({ url: 'https://www.google.com' });
        const outbound = selectNonstopFlight(await fetchFlightResults(request, cookies, 'GetShoppingResults',
            [[], criteria, 0, 0, 0, 1]), from, to, depart);
        journeys[0][8] = [outbound.selection];
        const inbound = selectNonstopFlight(await fetchFlightResults(request, cookies, 'GetShoppingResults',
            [[null, outbound.token], criteria, 0, 0, 0, 1]), to, from, ret);
        journeys[1][8] = [inbound.selection];
        const rows = parseBookingResults(await fetchFlightResults(request, cookies, 'GetBookingResults',
            [[null, inbound.token], criteria, null, 0])).sort((a, b) => a.price - b.price);
        const selections = [outbound.selection, inbound.selection];
        const flightNo = selections.map((leg) => leg[4] + leg[5]).join(' / ');
        if (rows.some((row) => row.flightNo !== flightNo)) {
            throw new CommandExecutionError('Google Flights booking API returned a quote for different flights');
        }
        const url = buildFlightBookingUrl(selections);
        return rows.map((row, index) => ({
            rank: index + 1, provider: row.provider, price: row.price, currency: 'SGD', flightNo: row.flightNo,
            outboundAirline: outbound.airline, outboundDeparture: outbound.departure, outboundArrival: outbound.arrival,
            returnAirline: inbound.airline, returnDeparture: inbound.departure, returnArrival: inbound.arrival,
            separateTickets: null, url,
        }));
    },
});
