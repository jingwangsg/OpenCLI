import { AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

const SEARCH_ENDPOINT = 'https://www.booking.com/dml/graphql';

const SEARCH_QUERY = `query FullSearch($input: SearchQueryInput!) {
  searchQueries { search(input: $input) { __typename ... on SearchQueryOutput {
    pagination { nbResultsPerPage nbResultsTotal }
    results {
      displayName { text }
      basicPropertyData { id pageName location { countryCode } starRating { value }
        reviewScore: reviews { score: totalScore reviewCount: reviewsCount } }
      priceDisplayInfoIrene { displayPrice { amountPerStay { amountUnformatted currency } } }
      location { mainDistance }
      matchingUnitConfigurations { unitConfigurations { name } }
      recommendedDate { checkin checkout }
    }
  } } }
}`;

export async function readBookingHotels(page, url, { destination, checkin, checkout, adults, rooms, children, currency, limit, offset }) {
    await page.goto(url);
    const context = await page.evaluate(() => ({
        csrf: window.booking?.env?.b_csrf_token,
        userAgent: navigator.userAgent,
        blocked: /captcha|challenge|verify you are|unusual traffic/i.test(document.title),
    }));
    if (context?.blocked) throw new AuthRequiredError('booking.com', 'Complete verification in this browser profile and retry');
    if (typeof context?.csrf !== 'string' || !context.csrf || typeof context.userAgent !== 'string' || !context.userAgent) {
        throw new CommandExecutionError('Booking.com page did not expose its API session context');
    }
    const cookies = await page.getCookies({ url: 'https://www.booking.com' });
    const headers = { 'content-type': 'application/json', 'x-booking-csrf-token': context.csrf,
        'User-Agent': context.userAgent, cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') };
    const target = new URL(url);
    const input = {
        dates: { checkin, checkout }, nbAdults: adults, nbRooms: rooms, nbChildren: children, childrenAges: [],
        location: { searchString: destination, destId: 0, destType: 'NO_DEST_TYPE' }, filters: {},
        pagination: { rowsPerPage: 25, offset }, sorters: { selectedSorter: 'popularity', referenceGeoId: null, tripTypeIntentId: null },
        doAvailabilityCheck: false, travelPurpose: 2,
        rawQueryForSession: target.pathname + target.search,
    };
    const rows = [];
    const seen = new Set();
    let nextOffset = offset;
    for (let pageIndex = 0; rows.length < limit; pageIndex += 1) {
        if (pageIndex >= 5) throw new CommandExecutionError('Booking.com FullSearch API pagination exceeded five pages before satisfying the limit');
        const pageInput = { ...input, pagination: { ...input.pagination, offset: nextOffset } };
        const pageBody = { operationName: 'FullSearch', query: SEARCH_QUERY, variables: { input: pageInput } };
        const response = await fetch(SEARCH_ENDPOINT, { method: 'POST', headers,
            body: JSON.stringify(pageBody), redirect: 'error', signal: AbortSignal.timeout(25000) });
        if (!response.ok) {
            if ([401, 403, 429].includes(response.status)) {
                throw new AuthRequiredError('booking.com', `Booking.com FullSearch API returned HTTP ${response.status}; complete verification in this browser profile and retry`);
            }
            throw new CommandExecutionError(`Booking.com FullSearch API returned HTTP ${response.status}`);
        }
        let result;
        try { result = await response.json(); }
        catch { throw new CommandExecutionError('Booking.com FullSearch API returned invalid JSON'); }
        if (result.errors?.length) throw new CommandExecutionError('Booking.com FullSearch API reported GraphQL errors');
        const search = result.data?.searchQueries?.search;
        if (search?.__typename !== 'SearchQueryOutput' || !Array.isArray(search.results) ||
            !Number.isInteger(search.pagination?.nbResultsTotal) || !Number.isInteger(search.pagination?.nbResultsPerPage) ||
            search.pagination.nbResultsPerPage <= 0) {
            throw new CommandExecutionError('Booking.com FullSearch API returned a malformed results page');
        }
        if (!search.results.length) {
            if (nextOffset < search.pagination.nbResultsTotal) {
                throw new CommandExecutionError('Booking.com FullSearch API returned an empty page before the reported end');
            }
            break;
        }
        const seenBefore = seen.size;
        for (const item of search.results) {
            const base = item.basicPropertyData;
            const propertyId = String(base?.id || '');
            const country = base?.location?.countryCode;
            const slug = base?.pageName;
            const name = item.displayName?.text;
            if (!/^\d+$/.test(propertyId) || !/^[a-z]{2}$/.test(country || '') ||
                typeof slug !== 'string' || !/^[^/?#]+$/.test(slug) || !name) {
                throw new CommandExecutionError('Booking.com FullSearch API returned a property without stable identity');
            }
            if (seen.has(propertyId)) continue;
            seen.add(propertyId);
            const recommended = item.recommendedDate;
            if ((recommended?.checkin && recommended.checkin !== checkin) ||
                (recommended?.checkout && recommended.checkout !== checkout)) continue;
            const display = item.priceDisplayInfoIrene?.displayPrice?.amountPerStay;
            const price = display?.amountUnformatted;
            if (price != null && (!Number.isFinite(price) || price < 0 || !display.currency)) {
                throw new CommandExecutionError('Booking.com FullSearch API returned an invalid stay price');
            }
            if (currency && price != null && display.currency !== currency) {
                throw new CommandExecutionError('Booking.com FullSearch API returned the wrong currency');
            }
            rows.push({
                rank: offset + rows.length + 1, name, country, slug,
                star_rating: Number.isFinite(base.starRating?.value) ? base.starRating.value : null,
                review_score: Number.isFinite(base.reviewScore?.score) ? base.reviewScore.score : null,
                review_count: Number.isInteger(base.reviewScore?.reviewCount) ? base.reviewScore.reviewCount : null,
                price_amount: price == null ? null : Math.round(price * 100) / 100,
                price_currency: price == null ? '' : display.currency,
                distance: item.location?.mainDistance || '',
                recommended_room: item.matchingUnitConfigurations?.unitConfigurations?.[0]?.name || '',
                url: `https://www.booking.com/hotel/${country}/${slug}.html`,
            });
            if (rows.length >= limit) break;
        }
        if (seen.size === seenBefore) throw new CommandExecutionError('Booking.com FullSearch API repeated a results page');
        nextOffset += search.pagination.nbResultsPerPage;
        if (nextOffset >= search.pagination.nbResultsTotal) break;
    }
    if (!rows.length) throw new EmptyResultError('booking search', `No hotels in ${destination} for the requested dates`);
    return rows;
}
