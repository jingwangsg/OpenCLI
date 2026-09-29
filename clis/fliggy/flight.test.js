import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { getRegistry } from '@jackwener/opencli/registry';
import './flight.js';

const command = getRegistry().get('fliggy/flight');
const args = {
    from: 'SIN', to: 'OSA', depart: '2026-11-27', return: '2026-12-06',
    outbound: 'CX636,CX566', inbound: 'CX567,CX635',
};
const outLegs = [
    { marketingFlightNo: 'CX636', operatingFlightNo: 'CX636', depCityCode: 'SIN', arrCityCode: 'HKG',
        depAirportCode: 'SIN', arrAirportCode: 'HKG', depTimeStr: '2026-11-27 20:20:00',
        arrTimeStamp: 1_000_000, marketingAirlineCode: 'CX', operatingAirlineCode: 'CX', codeShare: false,
        depTerm: 'T4', arrTerm: 'T1' },
    { marketingFlightNo: 'CX566', operatingFlightNo: 'CX566', depCityCode: 'HKG', arrCityCode: 'OSA',
        depAirportCode: 'HKG', arrAirportCode: 'KIX', depTimeStr: '2026-11-28 01:50:00',
        depTimeStamp: 1_000_000 + 100 * 60_000, marketingAirlineCode: 'CX', operatingAirlineCode: 'CX',
        codeShare: false, depTerm: 'T1', arrTerm: 'T1' },
];
const backLegs = [
    { marketingFlightNo: 'CX567', operatingFlightNo: 'CX567', depCityCode: 'OSA', arrCityCode: 'HKG',
        depAirportCode: 'KIX', arrAirportCode: 'HKG', depTimeStr: '2026-12-06 09:25:00',
        arrTimeStamp: 2_000_000, marketingAirlineCode: 'CX', operatingAirlineCode: 'CX', codeShare: false,
        depTerm: 'T1', arrTerm: 'T1' },
    { marketingFlightNo: 'CX635', operatingFlightNo: 'CX635', depCityCode: 'HKG', arrCityCode: 'SIN',
        depAirportCode: 'HKG', arrAirportCode: 'SIN', depTimeStr: '2026-12-06 15:05:00',
        depTimeStamp: 2_000_000 + 125 * 60_000, marketingAirlineCode: 'CX', operatingAirlineCode: 'CX',
        codeShare: false, depTerm: 'T1', arrTerm: 'T4' },
];

function pageForApi({ wrongFinalFlight = false, pendingReturn = false } = {}) {
    const modes = [];
    const page = {
        goto: vi.fn(async () => {}),
        evaluate: vi.fn(async (script) => runInNewContext(script, {
            URLSearchParams, AbortSignal, setTimeout,
            fetch: async (url) => {
                const params = new URL(url, 'https://sijipiao.fliggy.com').searchParams;
                const mode = Number(params.get('searchMode'));
                const journeys = JSON.parse(params.get('searchJourney'));
                modes.push(mode);
                if (mode === 0) expect(journeys.map((x) => x.selectedFlights.length)).toEqual([0, 0]);
                if (mode === 1) expect(journeys.map((x) => x.selectedFlights.length)).toEqual([2, 0]);
                if (mode === 2) expect(journeys.map((x) => x.selectedFlights.length)).toEqual([2, 2]);
                if (mode === 1 && pendingReturn && modes.filter((value) => value === 1).length === 1) {
                    return { ok: true, text: async () => 'jsonpOpencli({"status":200,"success":1,"data":{"isContinue":true,"delayForNextPoll":0}})' };
                }
                const data = mode === 0 ? { flightItems: [{ flightInfo: [{ flightSegments: outLegs }] }] }
                    : mode === 1 ? { flightItems: [{ flightInfo: [{ flightSegments: backLegs }] }] }
                        : { flightInfos: [{ flightSegments: outLegs }, { flightSegments: wrongFinalFlight
                            ? [{ ...backLegs[0], marketingFlightNo: 'CX999' }, backLegs[1]] : backLegs }],
                        productItems: [
                            { totalAdultPrice: 400000, adultPrice: 200000, adultTax: 200000,
                                cabinInfo: [[{ cabinClass: 'Y' }], [{ cabinClass: 'Y' }]],
                                specialProductDesc: '仅限留学生购买' },
                            { totalAdultPrice: 446700, adultPrice: 244000, adultTax: 202700,
                                cabinInfo: [[{ cabinClass: 'Y' }], [{ cabinClass: 'Y' }]] },
                            // Cheapest total, but null + tax === total; must not be quoted as fare 0.
                            { totalAdultPrice: 202700, adultPrice: null, adultTax: 202700,
                                cabinInfo: [[{ cabinClass: 'Y' }], [{ cabinClass: 'Y' }]] },
                        ] };
                return { ok: true, text: async () => `jsonpOpencli(${JSON.stringify({ status: 200, success: 1, data })})` };
            },
        })),
    };
    return { page, modes };
}

describe('Fliggy exact round-trip API quote', () => {
    it('uses the current browser context for three dependent API requests and matches the fare', async () => {
        const { page, modes } = pageForApi();
        const [row] = await command.func(page, args);
        expect(modes).toEqual([0, 1, 2]);
        expect(row).toMatchObject({ outbound: 'CX636,CX566', inbound: 'CX567,CX635',
            outboundLayoversMinutes: '100', inboundLayoversMinutes: '125',
            price: 4467, fare: 2440, tax: 2027, priceIncludesTax: true, currency: 'CNY' });
        expect(page.goto).toHaveBeenCalledOnce();
    });

    it('follows a pending return response before requesting the selected-flight quote', async () => {
        const { page, modes } = pageForApi({ pendingReturn: true });
        const [row] = await command.func(page, args);
        expect(modes).toEqual([0, 1, 1, 2]);
        expect(row.price).toBe(4467);
    });

    it('rejects a quote for different final flights' , async () => {
        const { page } = pageForApi({ wrongFinalFlight: true });
        await expect(command.func(page, args)).rejects.toMatchObject({ code: 'COMMAND_EXEC' });
    });

    it('rejects invalid input before accessing the browser', async () => {
        const { page } = pageForApi();
        await expect(command.func(page, { ...args, depart: '2026-02-30' })).rejects.toMatchObject({ code: 'ARGUMENT' });
        expect(page.goto).not.toHaveBeenCalled();
    });
});
