// US holidays named in email deadlines ("by the Friday after Thanksgiving"). Holiday
// arithmetic is fixed, so code does it instead of trusting the model, which has resolved
// that example a week late. Pure functions: no environment, file or network access.
//
// Only fixed-rule holidays are listed. Easter and other lunar dates, and school periods
// (spring break, finals), are left out: their dates vary or are set by each school, so
// they return null and the model's date is kept. Dates are the actual calendar day, not
// a weekday the holiday is observed on.

const HOLIDAY_RULES = {
  newYearsDay: { fixed: [1, 1] },
  mlkDay: { nth: [1, 1, 3] },            // 3rd Monday of January
  valentinesDay: { fixed: [2, 14] },
  presidentsDay: { nth: [2, 1, 3] },     // 3rd Monday of February
  memorialDay: { last: [5, 1] },         // last Monday of May
  juneteenth: { fixed: [6, 19] },
  independenceDay: { fixed: [7, 4] },
  laborDay: { nth: [9, 1, 1] },          // 1st Monday of September
  halloween: { fixed: [10, 31] },
  veteransDay: { fixed: [11, 11] },
  thanksgiving: { nth: [11, 4, 4] },     // 4th Thursday of November
  christmasEve: { fixed: [12, 24] },
  christmas: { fixed: [12, 25] },
  newYearsEve: { fixed: [12, 31] },
};

// Names as written, after lowercasing, dropping apostrophes and splitting on anything
// that is not a letter or digit ("New Year's Day" -> "new years day", "MLK Jr. Day" ->
// "mlk jr day"). Exact phrases only: "new year", "labor" or "valentines" alone are not
// holidays here ("valentines" is also an ordinary plural).
const HOLIDAY_ALIASES = {
  newYearsDay: ['new years', 'new years day'],
  mlkDay: ['mlk', 'mlk day', 'mlk jr', 'mlk jr day', 'martin luther king day', 'martin luther king jr day',
    'martin luther king junior day'],
  valentinesDay: ['valentines day', 'st valentines day', 'saint valentines day'],
  presidentsDay: ['presidents day', 'washingtons birthday'],
  memorialDay: ['memorial day'],
  juneteenth: ['juneteenth', 'juneteenth day'],
  independenceDay: ['independence day', 'july 4', 'july 4th', 'july fourth', '4th of july', 'fourth of july'],
  laborDay: ['labor day', 'labour day'],
  halloween: ['halloween'],
  veteransDay: ['veterans day'],
  thanksgiving: ['thanksgiving', 'thanksgiving day'],
  christmasEve: ['christmas eve', 'xmas eve'],
  christmas: ['christmas', 'christmas day', 'xmas', 'xmas day'],
  newYearsEve: ['new years eve'],
};
const ALIAS_KEY = new Map(Object.entries(HOLIDAY_ALIASES).flatMap(([key, names]) => names.map((n) => [n, key])));
// Token lists, longest first, so "christmas eve" wins over "christmas".
const ALIAS_TOKENS = [...ALIAS_KEY.keys()].map((n) => n.split(' ')).sort((a, b) => b.length - a.length);

const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

function words(text) {
  return text.toLowerCase().replace(/['`‘’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}

// The date of a holiday in a given year, or null for an unknown holiday key.
export function holidayDate(key, year) {
  if (typeof key !== 'string' || !Object.hasOwn(HOLIDAY_RULES, key)) return null;
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  const rule = HOLIDAY_RULES[key];
  if (rule.fixed) return iso(year, ...rule.fixed);
  if (rule.nth) {
    const [month, weekday, n] = rule.nth;
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return iso(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const [month, weekday] = rule.last;
  const lastDay = new Date(Date.UTC(year, month, 0)); // day 0 of the next month
  return iso(year, month, lastDay.getUTCDate() - ((lastDay.getUTCDay() - weekday + 7) % 7));
}

// The canonical key for a holiday name as written in an email, or null.
export function holidayKey(name) {
  if (typeof name !== 'string') return null;
  const tokens = words(name);
  if (tokens[0] === 'the') tokens.shift(); // "the fourth of July"
  return ALIAS_KEY.get(tokens.join(' ')) ?? null;
}

function validTimeZone(zone) {
  if (typeof zone !== 'string') return false;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
}

// Same choices as the relative-day rule in core.mjs (copied, since core.mjs imports this
// file): tue/tues, thu/thur/thurs and fri are accepted; mon, wed, sat and sun are
// ordinary words and are not.
const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6 };
// Connecting words and a part of day, which do not change the date. "before" is one too,
// except directly after a weekday or "day" ("the Monday before Labor Day").
const FILLER = new Set(['by', 'before', 'on', 'at', 'due', 'until', 'the', 'is', 'are', 'starts', 'from',
  'eod', 'morning', 'afternoon', 'evening', 'night']);
// One clock time: 3:30 PM, 3:30PM, 3 pm, 15:30, noon, midnight ("p.m." is normalised first).
const CLOCK_TIME = /(?<![a-z0-9:])(?:(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s?[ap]m|(?:[01]?\d|2[0-3]):[0-5]\d|noon|midnight)(?![a-z0-9:])/g;

function aliasAt(tokens, i) {
  for (const alias of ALIAS_TOKENS) {
    if (alias.every((w, j) => tokens[i + j] === w)) return alias;
  }
  return null;
}

// A date for wording that is nothing but a holiday reference, counted from the day the
// email was sent; null for anything else.
//
// Accepted, around the connecting words above and at most one clock time:
//   <holiday> [year]                          "by Thanksgiving", "on Labor Day 2027"
//   <weekday> after|following <holiday>       "the Friday after Thanksgiving"
//   <weekday> before <holiday>                "the Monday before Labor Day"
//   day after|following|before <holiday>      "the day after Christmas"
// The holiday is its next occurrence on or after the sent day, unless a four-digit year
// follows it. Like the relative-day rule this is a whitelist: "Thanksgiving break", "the
// week of Thanksgiving", "two days after Christmas", "last Thanksgiving" and anything
// else return null, because a wrong correction is worse than none. For the same reason an
// offset form returns null when the year is unclear: when the result for the next
// occurrence is already past, or the result for the previous one is not yet past (the
// email was sent between the holiday and the day it points to).
export function holidayDayFromSent(wording, sentAt, timeZone) {
  if (typeof wording !== 'string' || typeof sentAt !== 'string') return null;
  let text = wording.toLowerCase().replace(/(?<![a-z])([ap])\.\s?m\.?(?![a-z])/g, '$1m');
  if ((text.match(CLOCK_TIME) ?? []).length > 1) return null;
  text = text.replace(CLOCK_TIME, ' ').replace(/\bno later than\b|\bend of (?:the )?day\b/g, ' ');
  const tokens = words(text);

  const items = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const alias = aliasAt(tokens, i);
    if (alias) {
      const item = { type: 'holiday', key: ALIAS_KEY.get(alias.join(' ')), year: null };
      i += alias.length - 1;
      if (/^\d{4}$/.test(tokens[i + 1] ?? '')) item.year = Number(tokens[++i]);
      items.push(item);
    } else if (Object.hasOwn(WEEKDAYS, t)) {
      items.push({ type: 'weekday', weekday: WEEKDAYS[t] });
    } else if (t === 'day') {
      items.push({ type: 'day' });
    } else if (t === 'after' || t === 'following'
      || (t === 'before' && (Object.hasOwn(WEEKDAYS, tokens[i - 1] ?? '') || tokens[i - 1] === 'day'))) {
      items.push({ type: 'direction', after: t !== 'before' });
    } else if (!FILLER.has(t)) {
      return null; // any other word, a number, or a holiday not listed
    }
  }

  let holiday, offset = (date) => date;
  if (items.length === 1 && items[0].type === 'holiday') {
    holiday = items[0];
  } else if (items.length === 3 && (items[0].type === 'weekday' || items[0].type === 'day')
    && items[1].type === 'direction' && items[2].type === 'holiday') {
    holiday = items[2];
    const after = items[1].after;
    if (items[0].type === 'day') {
      offset = (date) => addDays(date, after ? 1 : -1);
    } else {
      // Strictly after or before: "the Thursday after Thanksgiving" is a week later.
      const target = items[0].weekday;
      offset = (date) => {
        const from = weekdayOf(date);
        return addDays(date, after ? ((target - from + 7) % 7 || 7) : -((from - target + 7) % 7 || 7));
      };
    }
  } else {
    return null;
  }

  // Checked even when a year is written: bad input never yields a date.
  const sent = new Date(sentAt);
  if (!Number.isFinite(sent.valueOf()) || !validTimeZone(timeZone)) return null;
  if (holiday.year !== null) {
    const date = holidayDate(holiday.key, holiday.year);
    return date && offset(date);
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(sent).map((p) => [p.type, p.value]));
  const sentDay = `${parts.year}-${parts.month}-${parts.day}`;
  const year = Number(parts.year);
  const thisYear = holidayDate(holiday.key, year);
  if (!thisYear) return null;
  const next = thisYear >= sentDay ? thisYear : holidayDate(holiday.key, year + 1);
  const previous = thisYear < sentDay ? thisYear : holidayDate(holiday.key, year - 1);
  if (!next || !previous) return null;
  const result = offset(next);
  if (result < sentDay || offset(previous) >= sentDay) return null;
  return result;
}
