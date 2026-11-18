// Holiday dates are fixed rules, so code resolves wording like "the Friday after
// Thanksgiving" from the sent date. Pure functions only; no model or network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { holidayDate, holidayDayFromSent, holidayKey } from '../app/pipeline/holidays.mjs';

const KEYS = ['newYearsDay', 'mlkDay', 'valentinesDay', 'presidentsDay', 'memorialDay', 'juneteenth', 'independenceDay',
  'laborDay', 'halloween', 'veteransDay', 'thanksgiving', 'christmasEve', 'christmas', 'newYearsEve'];

test('holidayDate gives the calendar date of each holiday', () => {
  // Weekday anchors, worked by hand. Nov 1 2026 is a Sunday, so the first Thursday is
  // Nov 5 and the fourth Nov 26. Nov 1 2027 is a Monday (365 days later) -> Nov 25.
  // Nov 1 2028 is a Wednesday (366 days after Nov 1 2027, since Feb 29 2028 falls in
  // between: Monday + 2) -> first Thursday Nov 2, fourth Nov 23.
  assert.equal(holidayDate('thanksgiving', 2026), '2026-11-26');
  assert.equal(holidayDate('thanksgiving', 2027), '2027-11-25');
  assert.equal(holidayDate('thanksgiving', 2028), '2028-11-23');
  // Edge of the 4th-Thursday rule. Nov 1 2029 is a Thursday (365 days after a Wednesday),
  // so Nov 1 is itself the first Thursday and the fourth is Nov 22, the earliest possible.
  // Nov 1 2030 is a Friday, so the first Thursday is Nov 7 and the fourth Nov 28, the latest.
  assert.equal(holidayDate('thanksgiving', 2029), '2029-11-22');
  assert.equal(holidayDate('thanksgiving', 2030), '2030-11-28');
  // Sep 1 2026 is 61 days before Sunday Nov 1 (61 = 8*7 + 5) -> Tuesday; first Monday Sep 7.
  assert.equal(holidayDate('laborDay', 2026), '2026-09-07');
  // May 31 is 154 days (22 weeks) before Nov 1, so it shares Nov 1's weekday: Sunday in
  // 2026 (last Monday May 25) and Monday in 2027 (May 31 itself).
  assert.equal(holidayDate('memorialDay', 2026), '2026-05-25');
  assert.equal(holidayDate('memorialDay', 2027), '2027-05-31');
  // Jan 1 2027 is a Friday (Jan 1 2026 Thursday + 365 days): Mondays Jan 4, 11, 18.
  assert.equal(holidayDate('mlkDay', 2027), '2027-01-18');
  // Feb 1 2027 is Jan 1 + 31 days -> Monday: Mondays Feb 1, 8, 15.
  assert.equal(holidayDate('presidentsDay', 2027), '2027-02-15');
  // 2026: Jan 1 Thursday -> Mondays Jan 5, 12, 19. Feb 1 Sunday -> Mondays Feb 2, 9, 16.
  assert.equal(holidayDate('mlkDay', 2026), '2026-01-19');
  assert.equal(holidayDate('presidentsDay', 2026), '2026-02-16');
  assert.equal(holidayDate('laborDay', 2027), '2027-09-06');
  assert.equal(holidayDate('laborDay', 2028), '2028-09-04');
  assert.equal(holidayDate('memorialDay', 2028), '2028-05-29');

  const fixed = { newYearsDay: '01-01', valentinesDay: '02-14', juneteenth: '06-19', independenceDay: '07-04',
    halloween: '10-31', veteransDay: '11-11', christmasEve: '12-24', christmas: '12-25', newYearsEve: '12-31' };
  for (const year of [2025, 2026, 2027, 2028, 2030]) {
    for (const [key, monthDay] of Object.entries(fixed)) {
      assert.equal(holidayDate(key, year), `${year}-${monthDay}`, `${key} ${year}`);
    }
  }
  // Weekday rules land on the right weekday, inside the right part of the month, every year.
  for (let year = 2020; year <= 2040; year++) {
    const check = (key, weekday, month, from, to) => {
      const date = holidayDate(key, year);
      const day = Number(date.slice(8));
      assert.equal(new Date(`${date}T00:00:00Z`).getUTCDay(), weekday, `${key} ${year}`);
      assert.equal(date.slice(5, 7), month, `${key} ${year}`);
      assert.ok(day >= from && day <= to, `${key} ${year}: ${date}`);
    };
    check('mlkDay', 1, '01', 15, 21);
    check('presidentsDay', 1, '02', 15, 21);
    check('memorialDay', 1, '05', 25, 31);
    check('laborDay', 1, '09', 1, 7);
    check('thanksgiving', 4, '11', 22, 28);
  }
});

test('holidayDate returns null for unknown keys and bad years', () => {
  for (const key of ['easter', 'springBreak', 'Thanksgiving', '', null, undefined, 'toString', '__proto__']) {
    assert.equal(holidayDate(key, 2026), null, String(key));
  }
  for (const year of ['2026', 2026.5, NaN, null, undefined, 999, 10000]) {
    assert.equal(holidayDate('thanksgiving', year), null, String(year));
  }
  for (const key of KEYS) assert.match(holidayDate(key, 2026), /^2026-\d{2}-\d{2}$/);
});

test('holidayKey maps every alias, ignoring case and apostrophes', () => {
  const aliases = {
    newYearsDay: ["New Year's", 'new years day', "New Year's Day", 'NEW YEAR’S DAY'],
    mlkDay: ['MLK Day', 'mlk', 'Martin Luther King Day', 'MLK Jr. Day', 'Martin Luther King Jr. Day'],
    valentinesDay: ["Valentine's Day", 'valentines day', "St. Valentine's Day"],
    presidentsDay: ["Presidents' Day", 'presidents day', "President's Day", "Washington's Birthday"],
    memorialDay: ['Memorial Day'],
    juneteenth: ['Juneteenth', 'juneteenth day'],
    independenceDay: ['Independence Day', 'July 4th', 'july 4', 'the Fourth of July', '4th of July', 'fourth of july'],
    laborDay: ['Labor Day', 'labour day'],
    halloween: ['Halloween'],
    veteransDay: ["Veterans Day", "Veterans' Day", "Veteran's Day"],
    thanksgiving: ['Thanksgiving', 'thanksgiving day', 'THANKSGIVING'],
    christmasEve: ['Christmas Eve', 'xmas eve'],
    christmas: ['Christmas', 'Christmas Day', 'Xmas', 'xmas day'],
    newYearsEve: ["New Year's Eve", 'new years eve'],
  };
  for (const [key, names] of Object.entries(aliases)) {
    for (const name of names) assert.equal(holidayKey(name), key, name);
  }
  assert.deepEqual(Object.keys(aliases).sort(), [...KEYS].sort());
});

test('holidayKey rejects near-misses and non-holidays', () => {
  for (const name of ['thanks giving break', 'Thanksgiving break', 'labor', 'christmas tree', 'new year', 'Easter',
    'spring break', 'fall break', 'finals', 'midterms', 'valentines', 'memorial', 'the week of thanksgiving', '', '  ', 'day']) {
    assert.equal(holidayKey(name), null, name);
  }
  for (const value of [null, undefined, 42, {}, ['thanksgiving']]) assert.equal(holidayKey(value), null);
});

// Sent Thursday 2026-11-12 at 3:23 PM in Chicago (21:23 UTC).
const SENT = '2026-11-12T21:23:00Z';
const CHI = 'America/Chicago';
const from = (wording, sentAt = SENT, zone = CHI) => holidayDayFromSent(wording, sentAt, zone);

test('the reported case: the Friday after Thanksgiving is November 27, 2026', () => {
  assert.equal(from('by the Friday after Thanksgiving'), '2026-11-27');
});

test('a holiday alone is its next occurrence on or after the sent day', () => {
  assert.equal(from('by Thanksgiving'), '2026-11-26');
  assert.equal(from('before Thanksgiving'), '2026-11-26'); // "before" here is a connecting word
  assert.equal(from('on Christmas Eve'), '2026-12-24');
  assert.equal(from("New Year's Day"), '2027-01-01');
  assert.equal(from('Labor Day'), '2027-09-06');
  assert.equal(from('by the Fourth of July'), '2027-07-04');
  assert.equal(from('due MLK Jr. Day'), '2027-01-18');
  // Sent on the holiday itself: that day.
  assert.equal(from('by Thanksgiving', '2026-11-26T15:00:00Z'), '2026-11-26');
  // Sent after it: next year's.
  assert.equal(from('by Thanksgiving', '2026-12-01T15:00:00Z'), '2027-11-25');
  assert.equal(from('Christmas', '2026-12-26T15:00:00Z'), '2027-12-25');
  assert.equal(from("New Year's Eve", '2026-12-31T15:00:00Z'), '2026-12-31');
});

test('a weekday after, following or before a holiday', () => {
  assert.equal(from('the Monday after Thanksgiving'), '2026-11-30');
  assert.equal(from('Thursday following Thanksgiving'), '2026-12-03'); // strictly after: a week later
  assert.equal(from('the Tues after Labor Day', '2026-08-20T15:00:00Z'), '2026-09-08');
  assert.equal(from('the Monday before Labor Day', '2026-08-20T15:00:00Z'), '2026-08-31');
  assert.equal(from('the Thursday before Thanksgiving'), '2026-11-19'); // strictly before: a week earlier
  assert.equal(from('the Fri before Christmas'), '2026-12-18');
  // Sent on the day it points to.
  assert.equal(from('the Monday before Labor Day', '2026-08-31T15:00:00Z'), '2026-08-31');
});

test('the day after or before a holiday', () => {
  assert.equal(from('the day after Thanksgiving'), '2026-11-27');
  assert.equal(from('the day following Christmas'), '2026-12-26');
  assert.equal(from('the day before Thanksgiving'), '2026-11-25');
  assert.equal(from("the day after New Year's Eve"), '2027-01-01');
  assert.equal(from("the day before New Year's Day"), '2026-12-31');
});

test('an offset form returns null when the year is unclear', () => {
  // Labor Day 2026 is Monday Sep 7; the Monday before is Aug 31. Asked on Sep 1, the
  // next Labor Day is still this year's, but the day it points to has passed.
  assert.equal(from('the Monday before Labor Day', '2026-09-01T15:00:00Z'), null);
  assert.equal(from('the day before Thanksgiving', '2026-11-26T15:00:00Z'), null);
  // Sent the Friday after Thanksgiving 2026: this year's reading is today, while "next
  // occurrence" would give 2027. Left to the model rather than guessed.
  assert.equal(from('the Friday after Thanksgiving', '2026-11-27T15:00:00Z'), null);
  assert.equal(from('the day after Christmas', '2026-12-26T15:00:00Z'), null);
  // Once the pointed-to day has passed, next year's holiday is the only reading.
  assert.equal(from('the Friday after Thanksgiving', '2026-11-28T15:00:00Z'), '2027-11-26');
  assert.equal(from('the day after Christmas', '2026-12-27T15:00:00Z'), '2027-12-26');
});

test('an explicit year after the holiday wins', () => {
  assert.equal(from('by Thanksgiving 2027'), '2027-11-25');
  assert.equal(from('the Friday after Thanksgiving 2027'), '2027-11-26');
  assert.equal(from('Thanksgiving Day 2028'), '2028-11-23');
  assert.equal(from('the day before Labor Day 2027'), '2027-09-05');
  assert.equal(from('Thanksgiving 2027', 'not a date', CHI), null); // bad input still wins
  assert.equal(from('Thanksgiving 2027', SENT, 'Mars/Base'), null);
  assert.equal(from('Thanksgiving 2025'), '2025-11-27'); // written, so kept even though past
  assert.equal(from('2027 Thanksgiving'), null); // the year must follow the holiday
  assert.equal(from('Thanksgiving 27'), null);
});

test('connecting words and one clock time do not change the date', () => {
  assert.equal(from('by 11:59 PM on the day before Thanksgiving'), '2026-11-25');
  assert.equal(from('no later than noon on Labor Day', '2026-08-20T15:00:00Z'), '2026-09-07');
  assert.equal(from('EOD the Tuesday following Labor Day', '2026-08-20T15:00:00Z'), '2026-09-08');
  assert.equal(from('end of day on Thanksgiving'), '2026-11-26');
  assert.equal(from('Thanksgiving morning'), '2026-11-26');
  assert.equal(from('due by 5 p.m. the Friday after Thanksgiving'), '2026-11-27');
  assert.equal(from('Thanksgiving at 15:30'), '2026-11-26');
  assert.equal(from('until midnight on Christmas Eve'), '2026-12-24');
  assert.equal(from('Thanksgiving, 3pm.'), '2026-11-26');
  assert.equal(from('by 3pm or 5pm on Thanksgiving'), null); // two clock times
});

test('the sent day is taken in the time zone given', () => {
  // 03:00 UTC on Nov 27 is 9 PM on Thanksgiving (Nov 26) in Chicago.
  assert.equal(from('by Thanksgiving', '2026-11-27T03:00:00Z', CHI), '2026-11-26');
  assert.equal(from('by Thanksgiving', '2026-11-27T03:00:00Z', 'UTC'), '2027-11-25');
  assert.equal(from('the day before Thanksgiving', '2026-11-26T03:00:00Z', CHI), '2026-11-25');
});

test('anything else returns null', () => {
  for (const wording of ['Thanksgiving break', 'the week of Thanksgiving', 'Thanksgiving weekend',
    'two days after Christmas', 'the second Friday after Labor Day', 'Friday', 'next Friday', 'tomorrow',
    'Easter', 'the Friday after Easter', 'spring break', 'fall break', 'finals', 'midterms', 'November 27',
    'Nov 27', '11/27', 'Thanksgiving or Christmas', 'between Thanksgiving and Christmas', 'Thanksgiving Christmas',
    'Monday Friday after Thanksgiving', 'the Friday after the Monday before Thanksgiving', 'last Thanksgiving',
    'this Thanksgiving', 'next Thanksgiving', 'after Thanksgiving', 'the day', 'day after', 'Friday after',
    'Thanksgiving after Friday', 'the morning of Thanksgiving', 'the Wed after Thanksgiving',
    'the Sat before Christmas', 'Christmas tree', 'labor', 'new year', 'thanks giving', '', '   ', '.']) {
    assert.equal(from(wording), null, wording);
  }
});

test('never throws on bad input', () => {
  for (const wording of [null, undefined, 42, {}, ['Thanksgiving'], true]) {
    assert.equal(from(wording), null);
  }
  for (const sentAt of ['not a date', '', null, undefined, 0, {}, new Date(SENT)]) {
    assert.equal(holidayDayFromSent('by Thanksgiving', sentAt, CHI), null, String(sentAt));
  }
  for (const zone of ['Mars/Base', '', null, undefined, 42]) {
    assert.equal(holidayDayFromSent('by Thanksgiving', SENT, zone), null, String(zone));
  }
  assert.equal(holidayDayFromSent('by Thanksgiving', '+275760-09-14T00:00:00Z', CHI), null);
  assert.equal(holidayDayFromSent('by Thanksgiving', '9999-12-31T12:00:00Z', 'UTC'), null);
});
