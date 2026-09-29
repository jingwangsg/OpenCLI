import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError, TimeoutError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
    site: 'fliggy',
    name: 'flight',
    access: 'read',
    description: '查询飞猪国际往返指定航班的含税报价（使用已登录浏览器的机票 API）',
    domain: 'sijipiao.fliggy.com',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'from', required: true, positional: true, help: '出发城市 IATA 代码，如 SIN' },
        { name: 'to', required: true, positional: true, help: '目的地城市 IATA 代码，如 OSA / TYO' },
        { name: 'depart', required: true, help: '去程日期 YYYY-MM-DD' },
        { name: 'return', required: true, help: '返程日期 YYYY-MM-DD' },
        { name: 'outbound', required: true, help: '按顺序列出全部去程航班号，如 CX636,CX566' },
        { name: 'inbound', required: true, help: '按顺序列出全部返程航班号，如 CX567,CX635' },
    ],
    columns: ['outbound', 'inbound', 'depart', 'return', 'outboundLayoversMinutes',
        'inboundLayoversMinutes', 'cabin', 'price', 'fare', 'tax', 'priceIncludesTax', 'currency', 'url'],
    func: async (page, kwargs) => {
        const from = String(kwargs.from || '').toUpperCase();
        const to = String(kwargs.to || '').toUpperCase();
        if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) {
            throw new ArgumentError('from/to must be different city IATA codes');
        }
        const depart = String(kwargs.depart || '');
        const ret = String(kwargs.return || '');
        for (const [name, value] of [['depart', depart], ['return', ret]]) {
            const parsed = new Date(`${value}T00:00:00Z`);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
                throw new ArgumentError(`--${name} must be a real date in YYYY-MM-DD format`);
            }
        }
        if (depart >= ret) throw new ArgumentError('--depart must be before --return');
        const outbound = String(kwargs.outbound || '').toUpperCase().replace(/\s+/g, '');
        const inbound = String(kwargs.inbound || '').toUpperCase().replace(/\s+/g, '');
        const flightNumbers = /^[A-Z0-9]{2}\d{1,4}[A-Z]?(?:,[A-Z0-9]{2}\d{1,4}[A-Z]?)*$/;
        if (!flightNumbers.test(outbound) || !flightNumbers.test(inbound)) {
            throw new ArgumentError('--outbound and --inbound need comma-separated flight numbers in travel order');
        }

        const search = new URL('https://sijipiao.fliggy.com/ie/flight_search_result.htm');
        for (const [key, value] of Object.entries({
            depCityName: from, depCityCode: from, arrCityName: to, arrCityCode: to,
            tripType: '1', depDate: depart, arrDate: ret, searchBy: 'lowprice',
        })) search.searchParams.set(key, value);
        await page.goto(search.href);

        // The page's JSONP API accepts the profile's cookies without UI clicks.
        const raw = await page.evaluate(`(async () => {
            const journeys = ${JSON.stringify([
                { depCityCode: from, arrCityCode: to, depCityName: from, arrCityName: to, depDate: depart, selectedFlights: [] },
                { depCityCode: to, arrCityCode: from, depCityName: to, arrCityName: from, depDate: ret, selectedFlights: [] },
            ])};
            const wanted = ${JSON.stringify([outbound.split(','), inbound.split(',')])};
            const request = async (mode) => {
                const params = new URLSearchParams({
                    callback: 'jsonpOpencli', supportMultiTrip: 'true', searchBy: 'lowprice',
                    childPassengerNum: '0', infantPassengerNum: '0', searchJourney: JSON.stringify(journeys),
                    tripType: '1', searchCabinType: '0', agentId: '-1', controller: '1',
                    searchMode: String(mode), b2g: '0', formNo: '-1', cardId: '', needMemberPrice: '',
                    t: String(Date.now()),
                });
                const deadline = Date.now() + 20000;
                while (Date.now() < deadline) {
                    params.set('t', String(Date.now()));
                    const response = await fetch('/ie/flight_search_result_poller.do?' + params, {
                        credentials: 'include', signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
                    });
                    const body = await response.text();
                    if (!response.ok || !body.startsWith('jsonpOpencli(')) {
                        throw new Error(/captcha|login|verify|验证/i.test(body) ? 'auth' : 'api-response');
                    }
                    const result = JSON.parse(body.slice('jsonpOpencli('.length).replace(/\\);?$/, ''));
                    if (result.status !== 200 || result.success !== 1 || !result.data) throw new Error('api-status');
                    if (!result.data.isContinue) return result.data;
                    const delay = Number(result.data.delayForNextPoll || 0);
                    if (!Number.isFinite(delay) || delay < 0 || Date.now() + delay >= deadline) throw new Error('poll-timeout');
                    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
                }
                throw new Error('poll-timeout');
            };
            const select = (items, numbers, origin, destination, date) => {
                const match = items.find((item) => {
                    const segments = item.flightInfo?.[0]?.flightSegments;
                    return Array.isArray(segments) && segments.length === numbers.length &&
                        segments.every((leg, i) => leg.marketingFlightNo === numbers[i]) &&
                        segments[0].depCityCode === origin && segments.at(-1).arrCityCode === destination &&
                        segments[0].depTimeStr?.startsWith(date);
                });
                if (!match) throw new Error('missing-' + numbers.join(','));
                return match.flightInfo[0].flightSegments.map((leg) => ({
                    marketFlightNo: leg.marketingFlightNo, operatFlightNo: leg.operatingFlightNo,
                    flightTime: leg.depTimeStr, depCityCode: leg.depCityCode, arrCityCode: leg.arrCityCode,
                    depAirportCode: leg.depAirportCode, arrAirportCode: leg.arrAirportCode,
                    marketingAirlineCode: leg.marketingAirlineCode, operatingAirlineCode: leg.operatingAirlineCode,
                    codeShare: leg.codeShare, depTerm: leg.depTerm, arrTerm: leg.arrTerm,
                }));
            };
            try {
                const out = await request(0);
                if (!Array.isArray(out.flightItems)) throw new Error('api-shape');
                journeys[0].selectedFlights = select(out.flightItems, wanted[0], journeys[0].depCityCode, journeys[0].arrCityCode, journeys[0].depDate);
                const back = await request(1);
                if (!Array.isArray(back.flightItems)) throw new Error('api-shape');
                journeys[1].selectedFlights = select(back.flightItems, wanted[1], journeys[1].depCityCode, journeys[1].arrCityCode, journeys[1].depDate);
                const quoted = await request(2);
                if (!Array.isArray(quoted.flightInfos) || quoted.flightInfos.length !== 2 ||
                    !Array.isArray(quoted.productItems) || !quoted.flightInfos.every((info, i) =>
                        info.flightSegments?.map((leg) => leg.marketingFlightNo).join(',') === wanted[i].join(',') &&
                        info.flightSegments?.[0]?.depTimeStr?.startsWith(journeys[i].depDate) &&
                        info.flightSegments?.[0]?.depCityCode === journeys[i].depCityCode &&
                        info.flightSegments?.at(-1)?.arrCityCode === journeys[i].arrCityCode)) {
                    throw new Error('quote-identity');
                }
                const fares = quoted.productItems.filter((item) =>
                    !item.specialProductDesc && !item.productFlagDesc &&
                    item.cabinInfo?.length === 2 && item.cabinInfo.flat().every((cabin) => cabin.cabinClass === 'Y') &&
                    Number.isInteger(item.adultPrice) && Number.isInteger(item.adultTax) &&
                    Number.isInteger(item.totalAdultPrice) && item.totalAdultPrice > 0 &&
                    item.adultPrice + item.adultTax === item.totalAdultPrice);
                if (!fares.length) throw new Error('no-economy-fare');
                const fare = fares.sort((a, b) => a.totalAdultPrice - b.totalAdultPrice)[0];
                const layovers = quoted.flightInfos.map((info) => info.flightSegments.slice(1).map((leg, i) =>
                    Math.round((leg.depTimeStamp - info.flightSegments[i].arrTimeStamp) / 60000)));
                return { price: fare.totalAdultPrice / 100, fare: fare.adultPrice / 100,
                    tax: fare.adultTax / 100, outboundLayoversMinutes: layovers[0].join(','),
                    inboundLayoversMinutes: layovers[1].join(',') };
            } catch (error) { return { error: String(error.message || error) }; }
        })()`);
        if (raw?.error?.includes('timeout')) throw new TimeoutError('Fliggy flight API search phase', 20);
        if (raw?.error === 'auth') throw new AuthRequiredError('fliggy.com', 'Complete verification in the logged-in browser profile and retry');
        if (raw?.error?.startsWith('missing-')) throw new EmptyResultError('fliggy flight', `Flight ${raw.error.slice(8)} was not offered for this route/date`);
        if (!raw || raw.error) {
            throw new CommandExecutionError(`Fliggy flight API did not return a complete matching quote (state=${String(raw?.error || 'invalid')})`);
        }
        return [{ outbound, inbound, depart, return: ret,
            outboundLayoversMinutes: raw.outboundLayoversMinutes, inboundLayoversMinutes: raw.inboundLayoversMinutes,
            cabin: 'economy', price: raw.price, fare: raw.fare, tax: raw.tax,
            priceIncludesTax: true, currency: 'CNY', url: search.href }];
    },
});
