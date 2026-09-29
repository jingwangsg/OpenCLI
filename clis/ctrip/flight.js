/**
 * 携程机票 oneway search — domestic + international flight search by route + date.
 *
 * Read the state backing the results list after the page reports completion.
 * It contains flights omitted by virtualized cards and by collapsed codeshares.
 * Project only flight/fare fields: the full state also contains booking tokens.
 *
 * Round-trip search lives in the sibling `flight-round` command; advanced filters
 * (airline whitelist, cabin selection beyond 全舱位) remain out of scope here.
 */
import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError, TimeoutError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { parseIataCode, parseIsoDate, parseStrictIntegerRange } from './utils.js';

const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const SEARCH_TIMEOUT_SECONDS = 30;
const READ_FLIGHTS_JS = `
  new Promise((resolve) => {
    const read = () => {
      if (/captcha|passport/.test(location.pathname) ||
          /验证码|verify the human|安全验证/i.test(document.body?.innerText || '')) return 'captcha';
      const list = document.querySelector('.flight-list');
      if (!list) return null;
      let fiber = list[Object.keys(list).find((key) => key.startsWith('__reactFiber$'))];
      while (fiber) {
        const props = fiber.memoizedProps;
        if (props?.flightList && typeof props.searchIsFinish === 'boolean') {
          if (!props.searchIsFinish) return null;
          if (typeof props.flightList.toJS !== 'function') return 'malformed';
          const flights = props.flightList.toJS();
          if (!Array.isArray(flights)) return 'malformed';
          if (flights.some((flight) => !Array.isArray(flight.flightSegments) || !Array.isArray(flight.priceList) ||
              flight.flightSegments.some((segment) => !Array.isArray(segment.flightList)))) return 'malformed';
          return flights.map((flight) => ({
            itineraryId: flight.itineraryId,
            flightSegments: flight.flightSegments.map((segment) => ({
              airlineName: segment.airlineName,
              transferCount: segment.transferCount,
              flightList: segment.flightList.map((leg) => Object.fromEntries([
                'flightNo', 'aircraftName', 'departureDateTime', 'departureAirportName',
                'arrivalDateTime', 'arrivalAirportName', 'arrivalTerminal',
              ].map((field) => [field, leg[field]]))),
            })),
            priceList: flight.priceList.slice(0, 1).map((fare) => ({ sortPrice: fare.totalPriceWithTax, cabin: fare.cabin })),
          }));
        }
        fiber = fiber.return;
      }
      return null;
    };
    const initial = read();
    if (initial !== null) return resolve(initial);
    const timer = setInterval(() => {
      const result = read();
      if (result !== null) { clearInterval(timer); clearTimeout(deadline); resolve(result); }
    }, 200);
    const deadline = setTimeout(() => { clearInterval(timer); resolve('timeout'); }, ${SEARCH_TIMEOUT_SECONDS * 1000});
  })
`;

function parseFlightLimit(raw) {
    return parseStrictIntegerRange('limit', raw, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT);
}

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function timePart(value) {
    const match = cleanString(value).match(/(?:^|\s)([0-2]\d:[0-5]\d)(?::[0-5]\d)?$/);
    return match?.[1] || '';
}

function cabinLabel(value) {
    const labels = { Y: '经济舱', S: '超级经济舱', C: '公务舱', F: '头等舱' };
    const codes = [...new Set(cleanString(value).toUpperCase().match(/[YSCF]/g) || [])];
    return codes.length > 0 ? codes.map((code) => labels[code]).join('/') : (cleanString(value) || null);
}

function mapItinerary(itinerary, searchUrl, index) {
    const segments = itinerary?.flightSegments;
    const prices = itinerary?.priceList;
    if (!cleanString(itinerary?.itineraryId) || !Array.isArray(segments) || segments.length === 0 || !Array.isArray(prices) || prices.length === 0) {
        throw new CommandExecutionError(`Ctrip flight results contained a malformed itinerary at index ${index}`);
    }
    const legs = segments.flatMap((segment) => Array.isArray(segment?.flightList) ? segment.flightList : []);
    const first = legs[0];
    const last = legs.at(-1);
    const airline = [...new Set(segments.map((segment) => cleanString(segment?.airlineName)).filter(Boolean))].join(' / ');
    const flightNo = [...new Set(legs.map((leg) => cleanString(leg?.flightNo)).filter(Boolean))].join(' / ');
    const aircraft = [...new Set(legs.map((leg) => cleanString(leg?.aircraftName)).filter(Boolean))].join(' / ') || null;
    const departureTime = timePart(first?.departureDateTime);
    const arrivalTime = timePart(last?.arrivalDateTime);
    const departureAirport = cleanString(first?.departureAirportName);
    const arrivalAirport = cleanString(last?.arrivalAirportName);
    const price = prices[0]?.sortPrice;
    if (!airline || !flightNo || !departureTime || !arrivalTime || !departureAirport || !arrivalAirport || !Number.isFinite(price)) {
        throw new CommandExecutionError(`Ctrip flight results contained a malformed itinerary at index ${index}`);
    }
    const row = {
        airline,
        flightNo,
        aircraft,
        departureTime,
        departureAirport,
        arrivalTime,
        arrivalAirport,
        terminal: cleanString(last?.arrivalTerminal) || null,
        price,
        currency: '¥',
        cabin: cabinLabel(prices[0]?.cabin),
        url: searchUrl,
    };
    const isConnecting = legs.length > 1 || segments.some((segment) => Number(segment?.transferCount || 0) > 0);
    return [row, isConnecting, cleanString(first?.departureDateTime), cleanString(itinerary.itineraryId)];
}

cli({
    site: 'ctrip',
    name: 'flight',
    access: 'read',
    description: '搜索携程一程机票（按出发/到达 IATA 三字码 + 日期）',
    domain: 'flights.ctrip.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'from', required: true, positional: true, help: 'Departure IATA code (e.g. BJS / PEK)' },
        { name: 'to', required: true, positional: true, help: 'Arrival IATA code (e.g. SHA / PVG)' },
        { name: 'date', required: true, help: 'Departure date (YYYY-MM-DD)' },
        { name: 'limit', default: DEFAULT_LIMIT, help: `Number of flights (${MIN_LIMIT}-${MAX_LIMIT})` },
    ],
    columns: [
        'rank',
        'airline', 'flightNo', 'aircraft',
        'departureTime', 'departureAirport',
        'arrivalTime', 'arrivalAirport', 'terminal',
        'price', 'currency', 'cabin',
        'url',
    ],
    func: async (page, kwargs) => {
        const fromCode = parseIataCode('from', kwargs.from);
        const toCode = parseIataCode('to', kwargs.to);
        if (fromCode === toCode) {
            throw new ArgumentError(`--from and --to must differ (got ${fromCode})`);
        }
        const date = parseIsoDate('date', kwargs.date);
        const limit = parseFlightLimit(kwargs.limit);

        const searchUrl =
            `https://flights.ctrip.com/online/list/oneway-${fromCode.toLowerCase()}-${toCode.toLowerCase()}` +
            `?depdate=${date}&cabin=Y_S_C_F&adult=1&child=0&infant=0`;
        await page.goto(searchUrl);
        const itineraries = await page.evaluate(READ_FLIGHTS_JS);
        if (itineraries === 'captcha') {
            throw new AuthRequiredError('flights.ctrip.com', 'Complete the Ctrip verification in your browser and retry');
        }
        if (itineraries === 'timeout') {
            throw new TimeoutError('Ctrip flight search', SEARCH_TIMEOUT_SECONDS, 'The results page did not report a completed search.');
        }
        if (!Array.isArray(itineraries)) {
            throw new CommandExecutionError('Ctrip flight results state is malformed');
        }
        if (itineraries.length === 0) {
            throw new EmptyResultError('ctrip flight', `No flights for ${fromCode}→${toCode} on ${date}`);
        }
        const rows = itineraries
            .map((itinerary, index) => mapItinerary(itinerary, searchUrl, index))
            // The page groups direct flights before transfers, then applies its
            // displayed starting price and departure-time order inside each group.
            .sort(([rowA, connectingA, departureA, idA], [rowB, connectingB, departureB, idB]) =>
                Number(connectingA) - Number(connectingB) || rowA.price - rowB.price ||
                departureA.localeCompare(departureB) || idA.localeCompare(idB))
            .slice(0, limit)
            .map(([row], index) => ({
                rank: index + 1,
                airline: row.airline,
                flightNo: row.flightNo,
                aircraft: row.aircraft,
                departureTime: row.departureTime,
                departureAirport: row.departureAirport,
                arrivalTime: row.arrivalTime,
                arrivalAirport: row.arrivalAirport,
                terminal: row.terminal,
                price: row.price,
                currency: row.currency,
                cabin: row.cabin,
                url: row.url,
            }));
        return rows;
    },
});

export const __test__ = { parseFlightLimit };
