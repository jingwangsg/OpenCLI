import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import { waitForApiRequest } from '../_shared/api-request.js';

const FLIGHT_API_PATH = '/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/';

export function decodeFlightResponses(body) {
    const responses = [];
    let cursor = 4;
    try {
        if (body.slice(0, 4) !== ")]}'") throw new Error('missing RPC prefix');
        while (cursor < body.length) {
            while (/[\n\r ]/.test(body[cursor] || '')) cursor += 1;
            if (cursor === body.length) break;
            const newline = body.indexOf('\n', cursor);
            const lengthText = body.slice(cursor, newline);
            if (newline < 0 || !/^\d+$/.test(lengthText)) throw new Error('missing frame length');
            const length = Number(lengthText);
            cursor = newline + 1;
            // Google counts UTF-16 characters and both framing newlines, not UTF-8 bytes.
            const end = cursor + length - 2;
            if (end >= body.length || body[end] !== '\n') throw new Error('incomplete frame');
            const frames = JSON.parse(body.slice(cursor, end));
            cursor = end + 1;
            for (const frame of frames) {
                if (frame[0] !== 'wrb.fr' || typeof frame[2] !== 'string') continue;
                const decoded = JSON.parse(frame[2]);
                if (Array.isArray(decoded)) responses.push(decoded);
            }
        }
    } catch { throw new CommandExecutionError('Google Flights API returned malformed or incomplete response frames'); }
    if (!responses.length) throw new CommandExecutionError('Google Flights API returned no response data');
    return responses;
}

export function parseBookingResults(body) {
    const options = decodeFlightResponses(body).filter((data) => Array.isArray(data[1]?.[0])).at(-1)?.[1][0];
    if (!options?.length) throw new CommandExecutionError('Google Flights booking API returned no provider quotes');
    return options.map((option) => {
        const provider = option?.[1]?.[0]?.[1];
        const price = option?.[7]?.[0]?.[1];
        const legs = option?.[3];
        if (typeof provider !== 'string' || !provider || !Number.isFinite(price) || price <= 0 ||
            !Array.isArray(legs) || !legs.length || legs.some((leg) => !Array.isArray(leg) ||
                !/^[A-Z0-9]{2}$/.test(leg[0]) || !/^\d+[A-Z]?$/.test(String(leg[1])))) {
            throw new CommandExecutionError('Google Flights booking API returned a malformed provider quote');
        }
        return { provider, price, flightNo: legs.map((leg) => leg[0] + leg[1]).join(' / ') };
    });
}

export async function fetchFlightResults(request, cookies, method, payload) {
    const url = new URL(request.url);
    if (url.origin !== 'https://www.google.com' || !url.pathname.startsWith(FLIGHT_API_PATH) ||
        request.requestBodyTruncated || !request.requestBodyPreview) {
        throw new CommandExecutionError('Google Flights API did not expose a complete request on the expected origin');
    }
    url.pathname = FLIGHT_API_PATH + method;
    const body = new URLSearchParams(request.requestBodyPreview);
    if (payload) body.set('f.req', JSON.stringify([null, JSON.stringify(payload)]));
    // The page's complete request context matters: omitting its runtime headers
    // can yield HTTP 200 with no flights even when the same route has offers.
    const response = await fetch(url.href, {
        method: 'POST',
        headers: { ...request.requestHeaders, cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') },
        body: body.toString(), redirect: 'error', signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
        if ([401, 403, 429].includes(response.status)) {
            throw new AuthRequiredError('google.com', `Google Flights API returned HTTP ${response.status}; complete verification in this browser profile and retry`);
        }
        throw new CommandExecutionError(`Google Flights API returned HTTP ${response.status}`);
    }
    return response.text();
}

export async function readBookingResults(page, expectedJourneys) {
    const request = await waitForApiRequest(page, (entry) =>
        new URL(entry.url).origin === 'https://www.google.com' &&
        new URL(entry.url).pathname === FLIGHT_API_PATH + 'GetBookingResults' && entry.method === 'POST', 'Google Flights booking API request');
    let criteria;
    let context;
    try {
        criteria = JSON.parse(JSON.parse(new URLSearchParams(request.requestBodyPreview).get('f.req'))[1])[1];
        context = JSON.parse(request.requestHeaders['x-goog-ext-259736195-jspb']);
    } catch { throw new CommandExecutionError('Google Flights booking API request was malformed'); }
    const journeys = criteria?.[13];
    if (context?.[2] !== 'SGD' || !Array.isArray(journeys) || journeys.length !== expectedJourneys.length ||
        journeys.some((journey, index) => journey[6] !== expectedJourneys[index][0][1] ||
            JSON.stringify(journey[8]) !== JSON.stringify(expectedJourneys[index]))) {
        throw new CommandExecutionError('Google Flights booking API request did not match the selected itinerary and currency');
    }
    const cookies = await page.getCookies({ url: 'https://www.google.com' });
    const rows = parseBookingResults(await fetchFlightResults(request, cookies, 'GetBookingResults'));
    const flightNo = expectedJourneys.flat().map((leg) => leg[4] + leg[5]).join(' / ');
    if (rows.some((row) => row.flightNo !== flightNo)) throw new CommandExecutionError('Google Flights booking API returned a quote for different flights');
    return rows;
}

export function decodeFlightBookingSelections(tfs) {
    // tfs is the public itinerary protobuf, not an authentication token.
    const readFields = (bytes) => {
        let cursor = 0;
        const fields = new Map();
        const integer = () => {
            let value = 0n;
            for (let shift = 0n; shift < 70n && cursor < bytes.length; shift += 7n) {
                const byte = bytes[cursor++];
                value |= BigInt(byte & 127) << shift;
                if (!(byte & 128)) return value;
            }
            throw new Error('invalid varint');
        };
        while (cursor < bytes.length) {
            const tag = Number(integer());
            const field = tag >> 3;
            const wire = tag & 7;
            let value;
            if (wire === 0) value = integer();
            else if (wire === 2) {
                const length = Number(integer());
                if (!Number.isSafeInteger(length) || cursor + length > bytes.length) throw new Error('truncated field');
                value = bytes.subarray(cursor, cursor + length);
                cursor += length;
            } else throw new Error('unsupported wire type');
            fields.set(field, [...(fields.get(field) || []), value]);
        }
        return fields;
    };
    try {
        if (!/^[A-Za-z0-9_-]+={0,2}$/.test(tfs)) throw new Error('invalid base64');
        const journeys = readFields(Buffer.from(tfs, 'base64url')).get(3);
        if (!journeys?.length) throw new Error('missing journeys');
        return journeys.map((bytes) => {
            const journey = readFields(bytes);
            const legs = journey.get(4);
            if (!legs?.length) throw new Error('missing selected flights');
            const selections = legs.map((bytes) => {
                const fields = readFields(bytes);
                const [from, date, to, airline, number] = [1, 2, 3, 5, 6].map((field) => fields.get(field)?.[0]?.toString());
                if (!/^[A-Z]{3}$/.test(from || '') || !/^[A-Z]{3}$/.test(to || '') || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') ||
                    !/^[A-Z0-9]{2}$/.test(airline || '') || !/^\d+[A-Z]?$/.test(number || '')) throw new Error('invalid flight identity');
                return [from, date, to, null, airline, number];
            });
            if (journey.get(2)?.[0]?.toString() !== selections[0][1]) throw new Error('journey date mismatch');
            return selections;
        });
    } catch { throw new ArgumentError('tfs must encode a complete selected Google Flights itinerary'); }
}

export function selectNonstopFlight(body, from, to, date) {
    const result = decodeFlightResponses(body).filter((data) => Array.isArray(data[1]) && data[1].length === 2).at(-1);
    if (!result) throw new CommandExecutionError('Google Flights search API omitted its route metadata');
    const options = [...(result[2]?.[0] || []), ...(result[3]?.[0] || [])];
    const candidates = [];
    for (const option of options) {
        const flight = option?.[0];
        if (!Array.isArray(flight?.[2])) throw new CommandExecutionError('Google Flights search API returned malformed flight legs');
        if (flight[2].length !== 1) continue;
        const leg = flight[2][0];
        if (leg[3] !== from || leg[6] !== to) continue;
        const times = [];
        for (const [dateParts, timeParts] of [[leg[20], leg[8]], [leg[21], leg[10]]]) {
            if (!Array.isArray(dateParts) || dateParts.length !== 3 || !dateParts.every(Number.isInteger) ||
                !Array.isArray(timeParts)) {
                throw new CommandExecutionError(`Google Flights search API omitted a flight date or time (${JSON.stringify({ dateParts, timeParts })})`);
            }
            // In this protobuf JSON representation, zero hours/minutes are null or omitted at the end of an array.
            const hour = timeParts[0] ?? 0;
            const minute = timeParts[1] ?? 0;
            const day = dateParts.map((part, index) => index ? String(part).padStart(2, '0') : part).join('-');
            const parsed = new Date(day + 'T00:00:00Z');
            if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ||
                !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
                throw new CommandExecutionError('Google Flights search API returned an invalid date or time');
            }
            const label = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(parsed);
            times.push({ date: day, label: `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'} on ${label}` });
        }
        if (times[0].date !== date) continue;
        const airlineCode = leg[22]?.[0];
        const flightNumber = String(leg[22]?.[1] || '');
        const airline = leg[22]?.[3];
        const price = option[1]?.[0]?.[1];
        const token = option[1]?.[1];
        if (!/^[A-Z0-9]{2}$/.test(airlineCode || '') || !/^\d+[A-Z]?$/.test(flightNumber) ||
            typeof airline !== 'string' || !airline || !Number.isFinite(price) || price <= 0 || typeof token !== 'string' || !token) {
            throw new CommandExecutionError('Google Flights search API omitted a fare or flight identity');
        }
        candidates.push({ price, token, airline, departure: times[0].label, arrival: times[1].label,
            selection: [from, date, to, null, airlineCode, flightNumber] });
    }
    if (!candidates.length) throw new EmptyResultError('google flights', `No nonstop flights for ${from} to ${to} on ${date}`);
    return candidates.sort((a, b) => a.price - b.price)[0];
}

function protobufInteger(value) {
    let remaining = BigInt.asUintN(64, BigInt(value));
    const bytes = [];
    do { bytes.push(Number(remaining & 127n) | (remaining > 127n ? 128 : 0)); remaining >>= 7n; } while (remaining);
    return Buffer.from(bytes);
}

function protobufField(number, value) {
    if (typeof value === 'number') return Buffer.concat([protobufInteger(number * 8), protobufInteger(value)]);
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return Buffer.concat([protobufInteger(number * 8 + 2), protobufInteger(bytes.length), bytes]);
}

export function buildFlightBookingUrl(selections) {
    // These public tfs fields match the site's selected two-leg nonstop URL.
    const journeys = selections.map(([from, date, to, , airline, number]) => protobufField(3, Buffer.concat([
        protobufField(2, date), protobufField(4, Buffer.concat([
            protobufField(1, from), protobufField(2, date), protobufField(3, to),
            protobufField(5, airline), protobufField(6, number),
        ])), protobufField(5, 0),
        protobufField(13, Buffer.concat([protobufField(1, 1), protobufField(2, from)])),
        protobufField(14, Buffer.concat([protobufField(1, 1), protobufField(2, to)])),
    ])));
    const tfs = Buffer.concat([protobufField(1, 28), protobufField(2, 2), ...journeys,
        protobufField(8, 1), protobufField(9, 1), protobufField(14, 1),
        protobufField(16, protobufField(1, -1)), protobufField(19, 1)]).toString('base64url');
    return `https://www.google.com/travel/flights/booking?${new URLSearchParams({ tfs, hl: 'en', curr: 'SGD' })}`;
}
