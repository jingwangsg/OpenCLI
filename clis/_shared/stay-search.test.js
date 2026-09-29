import { describe, expect, it } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import '../agoda/search.js';
import '../airbnb/search.js';

const args = { destination: 'Bangkok', checkin: '2026-10-15', checkout: '2026-10-17' };
for (const site of ['agoda', 'airbnb']) {
    describe(`${site} stay arguments`, () => {
        it.each([
            { destination: '' }, { checkin: '2026-02-30' }, { checkout: 'bad' },
            { checkout: '2026-10-15' }, { checkout: '2026-10-14' },
            { adults: 0 }, { adults: 17 }, { adults: '2.5' },
            { limit: 0 }, { limit: 51 }, { currency: '$' },
        ])('rejects %j before any I/O', async (invalid) => {
            await expect(getRegistry().get(`${site}/search`).func({}, { ...args, ...invalid }))
                .rejects.toMatchObject({ code: 'ARGUMENT' });
        });
    });
}
