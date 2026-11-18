// Review before adding: dates named in the scan's notes, the sent time with its weekday,
// and the sent-day hint for a relative day. Pure rules; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dateChoicesFromNotes, sentDayHint, sentLabel, shortDateLabel } from '../app/web/src/reviewNotes.ts';

const NY = 'America/New_York';
// Thursday, Nov 12, 2026 at 3:23 PM in New York.
const THU = '2026-11-12T20:23:00Z';

test('finds both dates in a "counted from the day it was sent" note', () => {
  const note = 'The email says "by Friday". That was read as Fri, Nov 20, 2026; counted from the day it was sent, it is Fri, Nov 13, 2026. Check the date.';
  assert.deepEqual(dateChoicesFromNotes([note]), [
    { date: '2026-11-20', label: 'Fri, Nov 20, 2026' },
    { date: '2026-11-13', label: 'Fri, Nov 13, 2026' },
  ]);
});

test('finds the date in the "near wording about another week" note', () => {
  const note = 'The email says "Thursday" near wording about another week. The date was left as Thu, Nov 19, 2026. Check the date.';
  assert.deepEqual(dateChoicesFromNotes([note]), [{ date: '2026-11-19', label: 'Thu, Nov 19, 2026' }]);
});

test('finds the date in the "either of two weeks" note', () => {
  const note = 'The email says "next Tuesday", which can mean either of two weeks. It was set to Tue, Nov 24, 2026. Check the date.';
  assert.deepEqual(dateChoicesFromNotes([note]), [{ date: '2026-11-24', label: 'Tue, Nov 24, 2026' }]);
});

test('finds both dates in the "by the calendar" note', () => {
  const note = 'The email says "Monday, Nov 17". That was read as Mon, Nov 16, 2026; by the calendar it is Tue, Nov 17, 2026. Check the date.';
  assert.deepEqual(dateChoicesFromNotes([note]).map((c) => c.date), ['2026-11-16', '2026-11-17']);
});

test('removes duplicates and keeps the order of first appearance', () => {
  const notes = [
    'Read as Fri, Nov 20, 2026; it is Fri, Nov 13, 2026.',
    'Left as Fri, Nov 13, 2026. Also Thu, Nov 19, 2026 and Fri, Nov 20, 2026.',
  ];
  assert.deepEqual(dateChoicesFromNotes(notes).map((c) => c.date), ['2026-11-20', '2026-11-13', '2026-11-19']);
});

test('returns at most four dates', () => {
  const note = 'Mon, Nov 16, 2026 Tue, Nov 17, 2026 Wed, Nov 18, 2026 Thu, Nov 19, 2026 Fri, Nov 20, 2026';
  assert.deepEqual(dateChoicesFromNotes([note]).map((c) => c.date), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
});

test('drops a date whose weekday does not match', () => {
  assert.deepEqual(dateChoicesFromNotes(['It was set to Fri, Nov 19, 2026.']), []);
});

test('drops a date that does not exist', () => {
  assert.deepEqual(dateChoicesFromNotes(['It was set to Mon, Feb 30, 2026.', 'Or Tue, Nov 31, 2026.']), []);
});

test('ignores ordinary sentences and other date formats', () => {
  assert.deepEqual(dateChoicesFromNotes([
    'The deadline was not stated clearly.',
    'Due Friday, November 20, 2026 or 2026-11-20 or 11/20/2026.',
    'Thursday, Nov 19, 2026 is spelled out.',
    'Thu Nov 19 2026 has no commas.',
  ]), []);
  assert.deepEqual(dateChoicesFromNotes([]), []);
  assert.deepEqual(dateChoicesFromNotes([null, 3, undefined]), []);
});

test('shortDateLabel drops only the year', () => {
  assert.equal(shortDateLabel('Thu, Nov 19, 2026'), 'Thu, Nov 19');
});

test('sentLabel gives the weekday, date and time in the time zone', () => {
  assert.equal(sentLabel(THU, NY), 'Thursday, Nov 12, 2026 at 3:23 PM');
  assert.equal(sentLabel(null, NY), null);
  assert.equal(sentLabel('not a date', NY), null);
  assert.equal(sentLabel(THU, 'Not/AZone'), null);
});

test('a weekday is the first such day on or after the sent day', () => {
  assert.equal(sentDayHint('by Friday', THU, NY), 'Sent Thursday, Nov 12. “by Friday” counted from that day is Fri, Nov 13.');
  assert.equal(sentDayHint('Friday', THU, NY), 'Sent Thursday, Nov 12. “Friday” counted from that day is Fri, Nov 13.');
  assert.equal(sentDayHint('before Monday', THU, NY)?.endsWith('is Mon, Nov 16.'), true);
  assert.equal(sentDayHint('on this Friday', THU, NY)?.endsWith('is Fri, Nov 13.'), true);
  assert.equal(sentDayHint('due Wednesday', THU, NY)?.endsWith('is Wed, Nov 18.'), true);
});

test('the sent weekday itself counts as that day', () => {
  assert.equal(sentDayHint('by Thursday', THU, NY)?.endsWith('is Thu, Nov 12.'), true);
});

test('"next" skips the sent day only', () => {
  assert.equal(sentDayHint('next Thursday', THU, NY)?.endsWith('is Thu, Nov 19.'), true);
  assert.equal(sentDayHint('by next Friday', THU, NY)?.endsWith('is Fri, Nov 13.'), true);
});

test('today, tonight and tomorrow', () => {
  assert.equal(sentDayHint('today', THU, NY)?.endsWith('is Thu, Nov 12.'), true);
  assert.equal(sentDayHint('by tonight', THU, NY)?.endsWith('is Thu, Nov 12.'), true);
  assert.equal(sentDayHint('tomorrow', THU, NY)?.endsWith('is Fri, Nov 13.'), true);
});

test('an optional clock time is allowed', () => {
  assert.equal(sentDayHint('by Friday at 5 PM', THU, NY)?.endsWith('is Fri, Nov 13.'), true);
  assert.equal(sentDayHint('Friday 11:59 p.m.', THU, NY)?.endsWith('is Fri, Nov 13.'), true);
  assert.equal(sentDayHint('tomorrow at noon', THU, NY)?.endsWith('is Fri, Nov 13.'), true);
  assert.equal(sentDayHint('BY FRIDAY, 17:00', THU, NY)?.endsWith('is Fri, Nov 13.'), true);
});

test('the sent day is taken in the viewer time zone, not UTC', () => {
  // 10:30 PM Thursday in New York is already Friday in UTC.
  const late = '2026-11-13T03:30:00Z';
  assert.equal(sentDayHint('tomorrow', late, NY), 'Sent Thursday, Nov 12. “tomorrow” counted from that day is Fri, Nov 13.');
  assert.equal(sentDayHint('by Friday', late, NY)?.endsWith('is Fri, Nov 13.'), true);
  assert.equal(sentDayHint('tomorrow', late, 'UTC')?.endsWith('is Sat, Nov 14.'), true);
});

test('a year is shown when the day falls in the next year', () => {
  assert.equal(sentDayHint('tomorrow', '2026-12-31T17:00:00Z', NY), 'Sent Thursday, Dec 31. “tomorrow” counted from that day is Fri, Jan 1, 2027.');
});

test('anything else gets no hint and never throws', () => {
  for (const wording of [
    'the Friday after Thanksgiving', 'Friday, November 20', 'two weeks from Friday', 'end of day Friday',
    'next tomorrow', 'this today', 'Friday 5', 'by Friday or Monday', '', '   ', null, undefined, 42,
  ]) assert.equal(sentDayHint(wording, THU, NY), null, String(wording));
  assert.equal(sentDayHint('by Friday', null, NY), null);
  assert.equal(sentDayHint('by Friday', undefined, NY), null);
  assert.equal(sentDayHint('by Friday', 'yesterday', NY), null);
  assert.equal(sentDayHint('by Friday', THU, 'Not/AZone'), null);
  assert.equal(sentDayHint('by Friday', THU, ''), null);
});
