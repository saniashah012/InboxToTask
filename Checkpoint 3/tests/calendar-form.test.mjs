// Offline checks for the Google Calendar event form rules. Fictional tasks only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEdit, eventSummary, initialDraft, missingFields, oneClickMove, payloadOf, reviewAfterDeadline, timeRange,
} from '../app/web/src/calendarForm.ts';

const ZONE = 'America/Chicago';
const deadline = (date, time = null, extra = {}) => ({ date, time, timeZone: ZONE, wording: 'fictional', boundary: 'by', ...extra });
const fields = (d) => ({ action: 'Submit lab report', requirements: [], condition: null, deadline: d });
const timed = (over = {}) => ({ title: 'Team sync', date: '2026-12-01', allDay: false, startTime: '15:00', endDate: '2026-12-01', endTime: '15:30', timeZone: ZONE, ...over });
const FOLLOW = { endFollowsStart: true, endDateFollowsDate: true };
const STILL = { endFollowsStart: false, endDateFollowsDate: true };

test('All day starts unticked for date-only and timed tasks', () => {
  assert.equal(initialDraft(fields(deadline('2026-12-01')), ZONE).allDay, false);
  assert.equal(initialDraft(fields(deadline('2026-12-01', '14:00:00')), ZONE).allDay, false);
});

test('the 30-minute default end is filled only when the task has a start', () => {
  const withStart = initialDraft(fields(deadline('2026-12-01', '14:00:00')), ZONE);
  assert.equal(withStart.startTime, '14:00');
  assert.equal(withStart.endTime, '14:30');
  assert.equal(withStart.endDate, '2026-12-01');
  const dateOnly = initialDraft(fields(deadline('2026-12-01')), ZONE);
  assert.equal(dateOnly.date, '2026-12-01');
  assert.equal(dateOnly.startTime, '');
  assert.equal(dateOnly.endTime, '');
});

test('a 30-minute end late in the evening rolls to the next day', () => {
  const late = initialDraft(fields(deadline('2026-12-01', '23:45')), ZONE);
  assert.equal(late.endTime, '00:15');
  assert.equal(late.endDate, '2026-12-02');
});

test('a stated end time is used when it is later than the start', () => {
  assert.equal(initialDraft(fields(deadline('2026-12-01', '14:00', { endTime: '15:15' })), ZONE).endTime, '15:15');
  assert.equal(initialDraft(fields(deadline('2026-12-01', '14:00', { endTime: '13:00' })), ZONE).endTime, '14:30');
});

test('nothing is filled when the task has no deadline', () => {
  const blank = initialDraft(fields(null), ZONE);
  assert.deepEqual([blank.date, blank.startTime, blank.endTime, blank.endDate], ['', '', '', '']);
  assert.equal(blank.title, 'Submit lab report');
  assert.equal(blank.timeZone, ZONE);
});

test('the task zone wins over the browser zone', () => {
  assert.equal(initialDraft(fields(deadline('2026-12-01', '14:00', { timeZone: 'America/New_York' })), ZONE).timeZone, 'America/New_York');
});

test('the end follows a moved start, keeping the length, and stops when told not to follow', () => {
  const moved = applyEdit(timed({ endTime: '16:00' }), { startTime: '17:15' }, FOLLOW);
  assert.equal(moved.endTime, '18:15');
  const still = applyEdit(timed(), { startTime: '15:10' }, STILL);
  assert.equal(still.startTime, '15:10');
  assert.equal(still.endTime, '15:30');
});

test('typing a start into a blank form fills no end', () => {
  const blank = initialDraft(fields(deadline('2026-12-01')), ZONE);
  const next = applyEdit(blank, { startTime: '09:00' }, FOLLOW);
  assert.equal(next.endTime, '');
});

test('the end date follows a changed date', () => {
  const allDay = { ...timed(), allDay: true };
  assert.equal(applyEdit(allDay, { date: '2026-12-04' }, STILL).endDate, '2026-12-04');
  const overnight = timed({ startTime: '23:00', endDate: '2026-12-02', endTime: '01:00' });
  assert.equal(applyEdit(overnight, { date: '2026-12-10' }, STILL).endDate, '2026-12-11');
  assert.equal(applyEdit(timed(), { date: '2026-12-04' }, { endFollowsStart: false, endDateFollowsDate: false }).endDate, '2026-12-01');
});

test('missingFields lists blank required fields', () => {
  assert.deepEqual(missingFields(timed()), []);
  assert.deepEqual(missingFields(timed({ title: '  ', startTime: '', endTime: '' })), ['title', 'startTime', 'endTime']);
  assert.deepEqual(missingFields(timed({ date: '', allDay: true, startTime: '', endTime: '' })), ['date']);
  assert.deepEqual(missingFields(timed({ endDate: '' })), ['endDate']);
});

test('payloadOf sends no times for an all-day event and every field for a timed one', () => {
  assert.deepEqual(payloadOf(timed({ allDay: true, title: ' Team sync ' })), { title: 'Team sync', date: '2026-12-01', allDay: true, timeZone: ZONE });
  assert.deepEqual(payloadOf(timed()), { title: 'Team sync', date: '2026-12-01', allDay: false, startTime: '15:00', endDate: '2026-12-01', endTime: '15:30', timeZone: ZONE });
});

test('eventSummary and timeRange read naturally across a.m. and p.m.', () => {
  assert.equal(timeRange('15:00', '15:30'), '3:00–3:30 p.m.');
  assert.equal(timeRange('11:30', '12:30'), '11:30 a.m.–12:30 p.m.');
  assert.equal(timeRange('00:15', ''), '12:15 a.m.');
  assert.equal(timeRange('', '10:00'), '');
  assert.equal(eventSummary(timed()), 'Dec 1 · 3:00–3:30 p.m.');
  assert.equal(eventSummary(timed({ allDay: true })), 'Dec 1 · All day');
  assert.equal(eventSummary(null), '');
});

test('oneClickMove is offered only for an "on" deadline with a time and a timed event', () => {
  const moved = oneClickMove(timed({ endTime: '16:00' }), deadline('2026-12-03', '10:00', { boundary: 'on' }));
  assert.deepEqual([moved.date, moved.startTime, moved.endDate, moved.endTime], ['2026-12-03', '10:00', '2026-12-03', '11:00']);
  const stated = oneClickMove(timed(), deadline('2026-12-03', '10:00', { boundary: 'on', endTime: '10:45' }));
  assert.equal(stated.endTime, '10:45');
  assert.equal(oneClickMove(timed(), deadline('2026-12-03', '10:00', { boundary: 'by' })), null);
  assert.equal(oneClickMove(timed(), deadline('2026-12-03', '10:00', { boundary: 'before' })), null);
  assert.equal(oneClickMove(timed(), deadline('2026-12-03', null, { boundary: 'on' })), null);
  assert.equal(oneClickMove(timed({ allDay: true }), deadline('2026-12-03', '10:00', { boundary: 'on' })), null);
  assert.equal(oneClickMove(timed(), deadline('2026-12-01', '15:00', { boundary: 'on' })), null);
});

test('reviewAfterDeadline keeps the event times on the new date', () => {
  const reviewed = reviewAfterDeadline(timed({ endTime: '16:15' }), deadline('2026-12-05'));
  assert.deepEqual([reviewed.date, reviewed.startTime, reviewed.endDate, reviewed.endTime], ['2026-12-05', '15:00', '2026-12-05', '16:15']);
  const byTime = reviewAfterDeadline(timed(), deadline('2026-12-05', '09:00', { boundary: 'by' }));
  assert.equal(byTime.startTime, '15:00');
  const allDay = reviewAfterDeadline(timed({ allDay: true }), deadline('2026-12-05'));
  assert.deepEqual([allDay.date, allDay.endDate, allDay.allDay], ['2026-12-05', '2026-12-05', true]);
  const meeting = reviewAfterDeadline(timed(), deadline('2026-12-05', '09:00', { boundary: 'on' }));
  assert.deepEqual([meeting.startTime, meeting.endTime], ['09:00', '09:30']);
});
