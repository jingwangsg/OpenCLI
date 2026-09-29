import { ArgumentError } from '@jackwener/opencli/errors';

export function parseStaySearch(args) {
    const destination = String(args.destination || '').trim();
    if (!destination) throw new ArgumentError('destination is required');
    const dates = ['checkin', 'checkout'].map((name) => {
        const value = String(args[name] || '');
        const parsed = new Date(`${value}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
            throw new ArgumentError(`--${name} must be a real calendar date in YYYY-MM-DD format`);
        }
        return value;
    });
    if (dates[1] <= dates[0]) throw new ArgumentError('--checkout must be after --checkin');
    const adults = Number(args.adults ?? 2);
    const limit = Number(args.limit ?? 10);
    if (!/^\d+$/.test(String(args.adults ?? 2)) || adults < 1 || adults > 16) {
        throw new ArgumentError('--adults must be an integer between 1 and 16');
    }
    if (!/^\d+$/.test(String(args.limit ?? 10)) || limit < 1 || limit > 50) {
        throw new ArgumentError('--limit must be an integer between 1 and 50');
    }
    const currency = String(args.currency ?? 'SGD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ArgumentError('--currency must be a three-letter currency code');
    return { destination, checkin: dates[0], checkout: dates[1], adults, limit, currency,
        nights: (Date.parse(dates[1]) - Date.parse(dates[0])) / 86400000 };
}
