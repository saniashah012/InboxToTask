import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarStart, createCalendarExport } from '../app/web/src/calendarExport.ts';

const draft = { taskId: 'abc-123', title: 'Review assignment', date: '2026-12-31', allDay: true,
  time: '', timeZone: 'America/Chicago', durationMinutes: 0 };
const now = new Date('2026-11-04T12:00:00Z');

test('all-day export preserves date-only values with exclusive next-day end', () => {
  const output = createCalendarExport(draft, now);
  assert.match(output, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.match(output, /DTSTAMP:20261104T120000Z/);
  assert.match(output, /UID:task-abc-123@inboxtotask.invalid/);
  assert.ok(output.endsWith('END:VCALENDAR\r\n'));
  assert.equal(output.replace(/\r\n/g, '').includes('\n'), false);
  assert.equal(output.includes('ATTENDEE'), false);
  assert.equal(output.includes('DESCRIPTION'), false);
  assert.match(createCalendarExport({ ...draft, date: '2028-02-29' }, now), /DTEND;VALUE=DATE:20280301/);
});

test('timed export uses selected zone and explicit elapsed duration, including DST crossings', () => {
  const output = createCalendarExport({ ...draft, allDay: false, date: '2026-03-08', time: '01:30', durationMinutes: 120 }, now);
  assert.match(output, /DTSTART:20260308T073000Z\r\nDTEND:20260308T093000Z/);
  assert.equal(calendarStart('2026-07-01', '09:00', 'Asia/Kathmandu').toISOString(), '2026-07-01T03:15:00.000Z');
});

test('nonexistent and ambiguous local times require another explicit choice', () => {
  for (const [date, time] of [['2026-03-08', '02:30'], ['2026-11-01', '01:30']]) {
    assert.throws(() => calendarStart(date, time, 'America/Chicago'), /skipped or repeated/);
  }
});

test('invalid dates, times, zones, durations and identities cannot produce a file', () => {
  for (const date of ['', '2026-02-29', '2026-04-31', '2026-13-01']) {
    assert.throws(() => createCalendarExport({ ...draft, date }, now), /date/);
  }
  assert.throws(() => calendarStart(draft.date, '24:00', draft.timeZone), /start time/);
  assert.throws(() => calendarStart(draft.date, '09:00', 'unknown-zone'), /time zone/);
  for (const durationMinutes of [0, -1, 1.5, 1441, NaN]) {
    assert.throws(() => createCalendarExport({ ...draft, allDay: false, time: '09:00', durationMinutes }, now), /duration/);
  }
  assert.throws(() => createCalendarExport({ ...draft, taskId: 'id\r\nATTENDEE:someone' }, now), /identity/);
  assert.throws(() => createCalendarExport({ ...draft, title: ' ' }, now), /title/);
});

test('text injection is escaped and UTF-8 lines fold at 75 octets without splitting characters', () => {
  const title = 'Plan, review; path\\file\r\nATTENDEE:someone ' + '📅é'.repeat(60);
  const output = createCalendarExport({ ...draft, title }, now);
  for (const line of output.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  assert.ok(!output.includes('\ufffd'));
  const unfolded = output.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:Plan\\, review\\; path\\\\file\\nATTENDEE:someone '));
  assert.ok(!output.includes('\r\nATTENDEE:'));
  assert.equal(createCalendarExport(draft, now).match(/UID:.*/)[0], createCalendarExport({ ...draft, title: 'Edited' }, now).match(/UID:.*/)[0]);
});
