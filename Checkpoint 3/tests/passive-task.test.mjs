// "Turn into task" for Passive emails: prefill and save rules. Pure functions, no network.
// All content is fictional.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStatedDate, draftFromPrefill, fieldsFromCreateDraft, isMeaningfulSubject, prefillFromPassive,
  USER_ENTERED_WORDING,
} from '../app/web/src/passiveTask.ts';

const tz = 'America/Chicago';
const monday = '2026-11-16T15:00:00Z'; // Monday 16 November 2026, 9:00 in Chicago
const input = (over = {}) => ({ subject: null, summary: null, quote: null, sentAt: monday, details: null, timeZone: tz, ...over });
const parsed = (summary, over = {}) => prefillFromPassive(input({ summary, ...over })).dates;
const pick = (dates) => dates.map(({ date, time, boundary }) => ({ date, time, boundary }));

test('acceptance: weekday with a time in the same sentence', () => {
  const dates = parsed('The exam is Thursday at 3:30 PM.');
  assert.deepEqual(pick(dates), [{ date: '2026-11-19', time: '15:30', boundary: 'on' }]);
  assert.equal(dates[0].label, 'Date');
  assert.equal(dates[0].source, 'parsed');
  assert.equal(dates[0].timeZone, tz);
  assert.equal(dates[0].wording, 'Thursday at 3:30 PM');
});

test('acceptance: "by" gives a deadline with no time', () => {
  const dates = parsed('RSVP by Friday.');
  assert.deepEqual(pick(dates), [{ date: '2026-11-20', time: null, boundary: 'by' }]);
  assert.equal(dates[0].label, 'Deadline');
  assert.equal(dates[0].wording, 'by Friday');
});

test('acceptance: a time with no date stays a time only', () => {
  const p = prefillFromPassive(input({ summary: 'Starts at 3:30 PM.' }));
  assert.deepEqual(pick(p.dates), [{ date: null, time: '15:30', boundary: 'on' }]);
  const draft = draftFromPrefill(p);
  assert.equal(draft.date, '');
  assert.equal(draft.time, '15:30');
  assert.deepEqual(fieldsFromCreateDraft(draft, p.dates[0], tz), { ok: false, error: 'Add a date to keep this time.' });
});

test('acceptance: no date or time stated gives nothing', () => {
  assert.deepEqual(parsed('Details coming soon.'), []);
});

test('weekday rules: same day, "this", "next", past and recurring', () => {
  assert.equal(parsed('Office hours Monday.')[0].date, '2026-11-16'); // sent on a Monday: that day
  assert.equal(parsed('Office hours this Thursday.')[0].date, '2026-11-19');
  assert.equal(parsed('Office hours next Thursday.')[0].date, '2026-11-19'); // no week added
  assert.equal(parsed('Office hours next Monday.')[0].date, '2026-11-23'); // never the sent day itself
  assert.deepEqual(parsed('The talk last Friday was recorded.'), []);
  assert.deepEqual(parsed('The club meets every Friday.'), []);
});

test('today, tomorrow, tonight', () => {
  assert.deepEqual(pick(parsed('Bring a jacket tomorrow at noon.')), [{ date: '2026-11-17', time: '12:00', boundary: 'on' }]);
  assert.equal(parsed('Movie night tonight.')[0].date, '2026-11-16');
  assert.equal(parsed('Forms are due today.')[0].boundary, 'by');
  assert.deepEqual(parsed('The day after tomorrow is free.'), []);
});

test('month-name and ISO dates', () => {
  assert.equal(parsed('Fair on November 20.')[0].date, '2026-11-20');
  assert.equal(parsed('Fair on Nov. 20th.')[0].date, '2026-11-20');
  assert.equal(parsed('Fair on 20 November 2026.')[0].date, '2026-11-20');
  assert.equal(parsed('Fair on 2026-11-20.')[0].date, '2026-11-20');
  assert.equal(parsed('Reunion on March 3.')[0].date, '2027-03-03'); // no year: next occurrence
  assert.equal(parsed('Reunion on November 16.')[0].date, '2026-11-16'); // on the sent date counts
  assert.equal(parsed('Reunion on November 2, 2025.')[0].date, '2025-11-02'); // year stated: kept
  assert.deepEqual(parsed('Fair on February 30.'), []);
  assert.deepEqual(pick(parsed('Fair on Friday, November 20 at 3 pm.')), [{ date: '2026-11-20', time: '15:00', boundary: 'on' }]);
  assert.deepEqual(parsed('Fair on Thursday, November 20.'), []); // weekday disagrees: keep neither
});

test('time formats, and 12-hour times without am/pm are skipped', () => {
  const times = (s) => parsed(s).map((d) => d.time);
  assert.deepEqual(times('Doors open at 3 pm.'), ['15:00']);
  assert.deepEqual(times('Doors open at 3pm.'), ['15:00']);
  assert.deepEqual(times('Doors open at 3:30 p.m. sharp.'), ['15:30']);
  assert.deepEqual(times('Doors open at 15:30.'), ['15:30']);
  assert.deepEqual(times('Doors open at 12 am.'), ['00:00']);
  assert.deepEqual(times('Doors close at midnight.'), ['00:00']);
  assert.deepEqual(times('Doors open at 3:30.'), []);
});

test('no numeric slash dates', () => {
  assert.deepEqual(parsed('Payment due 10/11.'), []);
  assert.deepEqual(parsed('Payment due 10/11/2026.'), []);
});

test('several dates are all offered, de-duplicated, and none is preselected', () => {
  const p = prefillFromPassive(input({
    summary: 'Lab on Wednesday at 2 pm. Report due Friday.',
    quote: 'The lab is Wednesday at 2 pm.',
    subject: 'Lab moved to Wednesday',
  }));
  assert.deepEqual(pick(p.dates), [
    { date: '2026-11-18', time: '14:00', boundary: 'on' },
    { date: '2026-11-20', time: null, boundary: 'by' },
  ]);
  const draft = draftFromPrefill(p);
  assert.equal(draft.date, '');
  assert.equal(draft.time, '');
  const chosen = applyStatedDate(draft, p.dates[0]);
  assert.deepEqual([chosen.date, chosen.time], ['2026-11-18', '14:00']);
  const other = applyStatedDate(chosen, p.dates[1]);
  assert.deepEqual([other.date, other.time], ['2026-11-20', '']);
  const timeOnly = applyStatedDate(other, { label: 'Date', date: null, time: '09:00', timeZone: tz, wording: '9 am', boundary: 'on', source: 'parsed' });
  assert.deepEqual([timeOnly.date, timeOnly.time], ['2026-11-20', '09:00']);
});

test('dates are capped at six', () => {
  const summary = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => `Session ${d}.`).join(' ');
  assert.equal(parsed(summary).length, 6);
});

test('time zone decides the sent day near midnight', () => {
  const late = '2026-11-17T04:30:00Z'; // Monday 22:30 in Chicago, Tuesday 04:30 in UTC
  assert.equal(parsed('Pick up tomorrow.', { sentAt: late })[0].date, '2026-11-17');
  assert.equal(parsed('Pick up tomorrow.', { sentAt: late, timeZone: 'UTC' })[0].date, '2026-11-18');
  assert.equal(parsed('Pick up Tuesday.', { sentAt: late })[0].date, '2026-11-17');
  assert.equal(parsed('Pick up Tuesday.', { sentAt: late, timeZone: 'UTC' })[0].date, '2026-11-17');
  assert.equal(parsed('Pick up Monday.', { sentAt: late, timeZone: 'UTC' })[0].date, '2026-11-23');
});

test('without a sent time, relative dates are not guessed', () => {
  assert.deepEqual(parsed('RSVP by Friday or November 20.', { sentAt: null }), []);
  assert.equal(parsed('Fair on 20 November 2026.', { sentAt: null })[0].date, '2026-11-20');
});

const details = {
  title: 'Career fair registration',
  dates: [{ label: 'Registration closes', date: '2026-11-24', time: '17:00', timeZone: 'America/New_York', wording: 'by 5 PM ET on November 24', boundary: 'by' }],
  location: 'Student Union, Room 210',
  links: ['https://careers.example.edu/fair', 'javascript:alert(1)', 'https://careers.example.edu/fair'],
};

test('details from the email win over parsing', () => {
  const p = prefillFromPassive(input({ details, summary: 'The fair is Thursday at 3:30 PM.', subject: 'Career fair next week' }));
  assert.equal(p.title, 'Career fair registration');
  assert.deepEqual(p.dates, [{ ...details.dates[0], source: 'email' }]);
  assert.equal(p.description, 'Location: Student Union, Room 210\nhttps://careers.example.edu/fair');
  const draft = draftFromPrefill(p);
  assert.deepEqual(draft, { title: 'Career fair registration', date: '2026-11-24', time: '17:00', description: p.description });
});

test('details with no usable dates still give title and description, and dates are parsed', () => {
  const p = prefillFromPassive(input({ details: { ...details, dates: [{ date: '2026-02-30', time: null }] }, summary: 'RSVP by Friday.' }));
  assert.equal(p.title, 'Career fair registration');
  assert.deepEqual(pick(p.dates), [{ date: '2026-11-20', time: null, boundary: 'by' }]);
  assert.equal(p.dates[0].source, 'parsed');
  assert.match(p.description, /^Location: Student Union/);
});

test('malformed details are ignored and the summary is parsed', () => {
  for (const bad of ['oops', 42, [], { dates: 'Friday', title: 7, links: 'https://x.example.edu' }]) {
    const p = prefillFromPassive(input({ details: bad, summary: 'RSVP by Friday.' }));
    assert.deepEqual(pick(p.dates), [{ date: '2026-11-20', time: null, boundary: 'by' }]);
    assert.equal(p.description, '');
  }
  const p = prefillFromPassive(input({ details: { dates: [{ label: 'Talk', date: null, time: '25:00' }, { date: '2026-11-21', time: 'soon', timeZone: 'Mars/Base', boundary: 'eventually' }] } }));
  assert.deepEqual(p.dates, [{ label: 'Date', date: '2026-11-21', time: null, timeZone: tz, wording: 'Date', boundary: 'unspecified', source: 'email' }]);
});

test('title rules', () => {
  const title = (over) => prefillFromPassive(input(over)).title;
  assert.equal(title({ details: { title: 'Pick up lab kit' }, subject: 'Lab kits ready' }), 'Pick up lab kit');
  assert.equal(title({ subject: 'Re: Fwd: Lab kits ready', summary: 'Kits are in room 4.' }), 'Lab kits ready');
  for (const subject of ['School', 'Update', 'RE: Reminder', 'Hello!', 'FYI', '(no subject)', 'Kits']) {
    assert.equal(title({ subject, summary: 'Lab kits are ready in room 4. Bring your ID.' }), 'Lab kits are ready in room 4', subject);
  }
  // A summary reduces to what it is about: no reporter, no date or time.
  for (const [summary, want] of [
    ['The sender informed you that the exam is scheduled for Thursday at 3:30 PM.', 'Exam'],
    ['Omar Reyes notified you that the lab safety quiz is cancelled.', 'Lab safety quiz is cancelled'],
    ['Class is cancelled tomorrow.', 'Class is cancelled'],
    ['Campus bake sale on Thursday, November 19 at 3:30 PM in the Union lobby.', 'Campus bake sale'],
    ['Review session starts at 3:30 PM.', 'Review session'],
    ['Tomorrow the office is closed.', 'Tomorrow the office is closed'],
  ]) assert.equal(title({ subject: 'School', summary }), want, summary);
  const long = 'Our department will hold an open house for prospective students and their families in the main hall.';
  const t = title({ summary: long });
  assert.ok(t.length <= 81 && t.endsWith('…') && long.startsWith(t.slice(0, -1)));
  assert.equal(title({ subject: 'Update' }), '');
  assert.equal(title({}), '');
  assert.equal(isMeaningfulSubject('Fwd: Room change for Thursday'), true);
});

test('fieldsFromCreateDraft errors', () => {
  const base = { title: 'Pick up lab kit', date: '2026-11-20', time: '', description: '' };
  const err = (over) => fieldsFromCreateDraft({ ...base, ...over }, null, tz);
  assert.deepEqual(err({ title: '   ' }), { ok: false, error: 'Enter a task title.' });
  assert.deepEqual(err({ title: 'x'.repeat(351) }), { ok: false, error: 'Keep the title to 350 characters or fewer.' });
  assert.deepEqual(err({ date: '', time: '15:00' }), { ok: false, error: 'Add a date to keep this time.' });
  assert.deepEqual(err({ date: '' }), { ok: false, error: 'Add a due date to save this task.' });
  assert.deepEqual(err({ date: '2026-02-30' }), { ok: false, error: 'Enter a real date.' });
  assert.deepEqual(err({ date: '11/20/2026' }), { ok: false, error: 'Enter a real date.' });
  assert.deepEqual(err({ time: '25:00' }), { ok: false, error: 'Enter a real time.' });
  assert.deepEqual(err({ description: Array.from({ length: 13 }, (_, i) => `Line ${i}`).join('\n') }), { ok: false, error: 'Keep the description to 12 lines or fewer.' });
  assert.deepEqual(err({ description: 'y'.repeat(251) }), { ok: false, error: 'Keep each description line to 250 characters or fewer.' });
  assert.equal(err({ title: 'x'.repeat(350), description: Array(12).fill('y'.repeat(250)).join('\n') }).ok, true);
});

test('fieldsFromCreateDraft keeps the email wording only while the chosen date is unchanged', () => {
  const chosen = { label: 'Deadline', date: '2026-11-20', time: null, timeZone: tz, wording: 'by Friday', boundary: 'by', source: 'parsed' };
  const draft = { title: '  RSVP for the fair ', date: '2026-11-20', time: '', description: 'Location: Hall B\n\n  https://fair.example.edu  \n' };
  assert.deepEqual(fieldsFromCreateDraft(draft, chosen, 'UTC'), { ok: true, fields: {
    action: 'RSVP for the fair', requirements: ['Location: Hall B', 'https://fair.example.edu'], condition: null,
    deadline: { date: '2026-11-20', time: null, timeZone: tz, wording: 'by Friday', boundary: 'by' },
  } });
  const changed = fieldsFromCreateDraft({ ...draft, time: '10:00' }, chosen, 'UTC');
  assert.deepEqual(changed.fields.deadline, { date: '2026-11-20', time: '10:00', timeZone: 'UTC', wording: USER_ENTERED_WORDING, boundary: 'by' });
  const typed = fieldsFromCreateDraft({ ...draft, date: '2026-12-01' }, null, tz);
  assert.deepEqual(typed.fields.deadline, { date: '2026-12-01', time: null, timeZone: tz, wording: USER_ENTERED_WORDING, boundary: 'by' });
  assert.deepEqual(fieldsFromCreateDraft({ ...draft, date: '' }, chosen, tz), { ok: false, error: 'Add a due date to save this task.' });
});
