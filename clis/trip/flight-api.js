import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { waitForApiRequest } from '../_shared/api-request.js';

const FLIGHT_ENDPOINT = 'https://us.trip.com/restapi/soa2/27015/FlightListSearchSSE';

export function parseFlightStream(body) {
    const events = body.split(/\r?\n/).filter((line) => line.startsWith('data:'));
    let complete = null;
    for (const line of events) {
        let value;
        try { value = JSON.parse(line.slice(5).trim()); }
        catch { continue; }
        const list = value?.itineraryList;
        const count = value?.basicInfo?.recordCount;
        if (Array.isArray(list) && Number.isInteger(count) && count === list.length) complete = value;
    }
    if (!complete) throw new CommandExecutionError('Trip.com flight API did not return a complete itinerary list');
    if (typeof complete.basicInfo.currency !== 'string' || !complete.basicInfo.currency) {
        throw new CommandExecutionError('Trip.com flight API omitted the currency');
    }
    return complete;
}

export async function readTripFlights(page, searchUrl, { from, to, depart, ret }) {
    if (!await page.startNetworkCapture?.('FlightListSearchSSE')) {
        throw new CommandExecutionError('Trip.com flight API capture is unavailable in this browser profile');
    }
    // load-bearing: the capture queue drains on read; a stale search from this tab would otherwise match first.
    await page.readNetworkCapture();
    await page.goto(searchUrl, { waitUntil: 'none' });
    const request = await waitForApiRequest(page,
        (entry) => entry.url === FLIGHT_ENDPOINT && entry.method === 'POST', 'Trip.com flight API request');
    if ([401, 403, 432].includes(request.responseStatus)) {
        throw new AuthRequiredError('trip.com', `Trip.com flight API returned HTTP ${request.responseStatus}; complete verification in this browser profile and retry`);
    }
    if (request.requestBodyTruncated || !request.requestBodyPreview) {
        throw new CommandExecutionError('Trip.com flight API did not expose a complete request');
    }
    let criteria;
    try { criteria = JSON.parse(request.requestBodyPreview).searchCriteria?.journeyInfoTypes; }
    catch { throw new CommandExecutionError('Trip.com flight API request body was malformed'); }
    const expected = [{ departCode: from, arriveCode: to, departDate: depart }];
    if (ret) expected.push({ departCode: to, arriveCode: from, departDate: ret });
    if (!Array.isArray(criteria) || criteria.length !== expected.length ||
        criteria.some((journey, index) => expected[index].departCode !== String(journey.departCode || '').toUpperCase()
            || expected[index].arriveCode !== String(journey.arriveCode || '').toUpperCase()
            || expected[index].departDate !== String(journey.departDate || '').slice(0, 10))) {
        throw new CommandExecutionError('Trip.com flight API request did not match the requested route and dates');
    }

    const cookies = await page.getCookies({ url: 'https://us.trip.com' });
    const response = await fetch(FLIGHT_ENDPOINT, {
        method: 'POST',
        headers: { ...request.requestHeaders, cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') },
        body: request.requestBodyPreview,
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok || !/text\/event-stream/i.test(response.headers.get('content-type') || '')) {
        if ([401, 403, 432].includes(response.status)) {
            throw new AuthRequiredError('trip.com', `Trip.com flight API returned HTTP ${response.status}; complete verification in this browser profile and retry`);
        }
        throw new CommandExecutionError(`Trip.com flight API returned HTTP ${response.status} without an event stream`);
    }
    const result = parseFlightStream(await response.text());
    const airlines = new Map((result.airlineList || []).map((airline) => [airline.code, airline.name]));
    const rows = [];
    for (const itinerary of result.itineraryList) {
        const journeys = itinerary.journeyList;
        const sections = journeys?.[0]?.transSectionList;
        if (!Array.isArray(journeys) || journeys.length !== 1 || !Array.isArray(sections) || !sections.length) {
            throw new CommandExecutionError('Trip.com flight API returned a malformed itinerary');
        }
        const first = sections[0];
        const last = sections.at(-1);
        if ((first.departPoint?.cityCode !== from && first.departPoint?.airportCode !== from) ||
            (last.arrivePoint?.cityCode !== to && last.arrivePoint?.airportCode !== to) ||
            first.departDateTime?.slice(0, 10) !== depart ||
            sections.some((section) => !section.flightInfo?.flightNo || !section.departDateTime || !section.arriveDateTime
                || !section.departPoint?.airportCode || !section.arrivePoint?.airportCode
                || !section.departPoint.cityCode || !section.arrivePoint.cityCode)) {
            throw new CommandExecutionError('Trip.com flight API returned a flight for a different route/date or missing leg details');
        }
        const prices = (itinerary.policies || []).filter((policy) => policy.seatCount !== 0
            && Number.isFinite(policy.price?.totalPrice) && policy.price.totalPrice > 0)
            .map((policy) => policy.price.totalPrice);
        if (!prices.length) continue;
        const duration = journeys[0].duration;
        const airline = [...new Set(sections.map((section) => airlines.get(section.flightInfo.airlineCode)
            || section.flightInfo.airlineCode))].join(' / ');
        const connections = [];
        const layovers = [];
        for (let index = 1; index < sections.length; index += 1) {
            const previous = sections[index - 1];
            const next = sections[index];
            if (previous.arrivePoint.cityCode !== next.departPoint.cityCode) {
                throw new CommandExecutionError('Trip.com flight API returned disconnected flight legs');
            }
            const minutes = (Date.parse(next.departDateTime.replace(' ', 'T') + 'Z')
                - Date.parse(previous.arriveDateTime.replace(' ', 'T') + 'Z')) / 60000;
            if (!Number.isInteger(minutes) || minutes < 0) {
                throw new CommandExecutionError('Trip.com flight API returned an invalid connection duration');
            }
            connections.push(previous.arrivePoint.cityCode);
            layovers.push(minutes);
        }
        rows.push({
            airline,
            flightNo: sections.map((section) => section.flightInfo.flightNo).join(' / '),
            departureTime: first.departDateTime.slice(11, 16),
            departureAirport: first.departPoint.airportCode,
            arrivalTime: last.arriveDateTime.slice(11, 16),
            arrivalAirport: last.arrivePoint.airportCode,
            departureDateTime: first.departDateTime,
            arrivalDateTime: last.arriveDateTime,
            duration: Number.isFinite(duration) ? `${Math.floor(duration / 60)}h ${duration % 60}m` : null,
            stops: sections.length === 1 ? 'Nonstop' : `${sections.length - 1} stop${sections.length === 2 ? '' : 's'}`,
            connections: connections.join(','),
            layoversMinutes: layovers.join(','),
            price: Math.min(...prices),
            currency: result.basicInfo.currency,
            url: searchUrl,
        });
    }
    return rows.sort((a, b) => a.price - b.price || a.departureDateTime.localeCompare(b.departureDateTime));
}
