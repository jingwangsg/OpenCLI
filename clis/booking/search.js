import { ArgumentError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { readBookingHotels } from './search-api.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizePositiveInt(value, defaultValue, label, max) {
  const raw = value ?? defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ArgumentError(`${label} must be a positive integer`);
  }
  if (typeof max === 'number' && n > max) {
    throw new ArgumentError(`${label} must be <= ${max}`);
  }
  return n;
}

function normalizeNonNegativeInt(value, defaultValue, label, max) {
  const raw = value ?? defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new ArgumentError(`${label} must be a non-negative integer`);
  }
  if (typeof max === 'number' && n > max) {
    throw new ArgumentError(`${label} must be <= ${max}`);
  }
  return n;
}

function normalizeDate(value, label) {
  const v = String(value || '').trim();
  if (!v) {
    throw new ArgumentError(`${label} is required (YYYY-MM-DD)`);
  }
  if (!DATE_RE.test(v)) {
    throw new ArgumentError(`${label} must be YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
  const [year, month, day] = v.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new ArgumentError(`${label} is not a valid calendar date: ${v}`);
  }
  return v;
}

function normalizeCurrency(value) {
  if (value == null || value === '') return '';
  const v = String(value).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(v)) {
    throw new ArgumentError(`currency must be a 3-letter ISO code (e.g. USD, JPY, CNY), got ${JSON.stringify(value)}`);
  }
  return v;
}

const ALLOWED_LANGS = new Set([
  'en-us', 'en-gb', 'zh-cn', 'zh-tw', 'ja', 'ko', 'de', 'fr', 'es', 'it',
  'pt-br', 'pt-pt', 'ru', 'th', 'vi', 'tr', 'pl', 'nl', 'ar',
]);

function normalizeLang(value) {
  if (value == null || value === '') return '';
  const v = String(value).trim().toLowerCase();
  if (!ALLOWED_LANGS.has(v)) {
    throw new ArgumentError(`lang must be one of: ${[...ALLOWED_LANGS].join(', ')}`);
  }
  return v;
}

function buildSearchUrl({
  destination,
  checkin,
  checkout,
  adults,
  rooms,
  children,
  offset,
  currency,
  lang,
}) {
  const file = lang ? `searchresults.${lang}.html` : 'searchresults.html';
  const params = new URLSearchParams();
  params.set('ss', destination);
  params.set('checkin', checkin);
  params.set('checkout', checkout);
  params.set('group_adults', String(adults));
  params.set('no_rooms', String(rooms));
  params.set('group_children', String(children));
  if (offset > 0) params.set('offset', String(offset));
  if (currency) params.set('selected_currency', currency);
  return `https://www.booking.com/${file}?${params.toString()}`;
}

cli({
  site: 'booking',
  name: 'search',
  description: 'Search Booking.com hotel stay prices through its FullSearch API.',
  access: 'read',
  example: 'opencli booking search Tokyo --checkin 2026-06-15 --checkout 2026-06-17 -f yaml',
  domain: 'www.booking.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'destination', required: true, positional: true, help: 'Destination keyword (city, district, or hotel name)' },
    { name: 'checkin', required: true, help: 'Check-in date YYYY-MM-DD' },
    { name: 'checkout', required: true, help: 'Check-out date YYYY-MM-DD' },
    { name: 'adults', type: 'int', default: 2, help: 'Number of adults (1-30)' },
    { name: 'rooms', type: 'int', default: 1, help: 'Number of rooms (1-30)' },
    { name: 'children', type: 'int', default: 0, help: 'Number of children (0-10)' },
    { name: 'currency', required: false, help: 'Force result currency (e.g. USD, JPY, CNY)' },
    { name: 'lang', required: false, help: 'Force result language (e.g. en-us, zh-cn, ja)' },
    { name: 'limit', type: 'int', default: 25, help: 'Max rows to return (1-100; Booking pages 25 per request)' },
    { name: 'offset', type: 'int', default: 0, help: 'Result offset for pagination (multiple of 25)' },
  ],
  columns: [
    'rank',
    'name',
    'country',
    'slug',
    'star_rating',
    'review_score',
    'review_count',
    'price_amount',
    'price_currency',
    'distance',
    'recommended_room',
    'url',
  ],
  func: async (page, kwargs) => {
    const destination = String(kwargs.destination || '').trim();
    if (!destination) throw new ArgumentError('destination is required');
    const checkin = normalizeDate(kwargs.checkin, 'checkin');
    const checkout = normalizeDate(kwargs.checkout, 'checkout');
    if (checkin >= checkout) {
      throw new ArgumentError(`checkout (${checkout}) must be after checkin (${checkin})`);
    }
    const adults = normalizePositiveInt(kwargs.adults, 2, 'adults', 30);
    const rooms = normalizePositiveInt(kwargs.rooms, 1, 'rooms', 30);
    const children = normalizeNonNegativeInt(kwargs.children, 0, 'children', 10);
    const currency = normalizeCurrency(kwargs.currency);
    const lang = normalizeLang(kwargs.lang);
    const limit = normalizePositiveInt(kwargs.limit, 25, 'limit', 100);
    const offset = normalizeNonNegativeInt(kwargs.offset, 0, 'offset', 1000);

    const url = buildSearchUrl({ destination, checkin, checkout, adults, rooms, children, offset, currency, lang });
    return readBookingHotels(page, url, { destination, checkin, checkout, adults, rooms,
      children, currency, limit, offset });
  },
});

export const __test__ = {
  normalizePositiveInt,
  normalizeNonNegativeInt,
  normalizeDate,
  normalizeCurrency,
  normalizeLang,
  buildSearchUrl,
};
