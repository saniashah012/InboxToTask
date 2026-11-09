// Offline checks for how saved records map onto the designed dashboard.
// Fictional rows only; no network, no model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDashboardModel, canScan, deadlineDisplay, deadlineSortKey, emptySnapshot, fieldText, scanPanelState,
} from '../app/web/src/dashboardModel.ts';

const NOW = new Date('2026-11-09T15:00:00Z');
const future = '2026-12-01T00:00:00Z', past = '2026-11-01T00:00:00Z';
const fields = (action, deadline = null) => ({ action, requirements: [], condition: null, deadline });
const due = (date, time = null) => ({ date, time, timeZone: 'America/Chicago', wording: `by ${date}`, boundary: 'by' });

function snapshot() {
  const s = emptySnapshot();
  s.sources = [
    { id: 'src-1', namespace: 'gmail', message_id: 'm1', sender: 'prof@example.edu', subject: 'Week 6', sent_at: '2026-11-08T10:00:00Z' },
    { id: 'src-2', namespace: 'gmail', message_id: 'm2', sender: 'lab@example.edu', subject: 'Deleted', deleted_at: '2026-11-08T11:00:00Z' },
    { id: 'src-fx', namespace: 'fixture', message_id: 'E01' },
  ];
  s.extractions = [
    { id: 'ex-1', source_id: 'src-1', created_at: '2026-11-08T10:01:00Z', summary: 'Older summary', topic_relevance: 'relevant', digest_expires_at: future },
    { id: 'ex-1b', source_id: 'src-1', created_at: '2026-11-09T10:01:00Z', summary: 'Newer summary', topic_relevance: 'relevant', digest_expires_at: future, needs_review: true },
    { id: 'ex-2', source_id: 'src-2', created_at: '2026-11-08T11:01:00Z', summary: 'Hidden', digest_expires_at: future },
    { id: 'ex-fx', source_id: 'src-fx', created_at: '2026-11-08T11:01:00Z', summary: 'Fixture', digest_expires_at: future },
  ];
  s.evidence = [{ id: 'ev-1', quote: 'Submit by Friday.', message_id: 'm1' }];
  s.suggestions = [
    { id: 's-late', extraction_id: 'ex-1', state: 'pending', revision: 0, evidence_id: 'ev-1', fields: fields('Later', due('2026-11-20')), expires_at: future, created_at: '2026-11-08T10:02:00Z' },
    { id: 's-soon', extraction_id: 'ex-1', state: 'pending', revision: 1, evidence_id: 'ev-missing', fields: fields('Original'), review_fields: fields('Edited', due('2026-11-10')), expires_at: future, created_at: '2026-11-08T10:02:00Z' },
    { id: 's-dismissed', extraction_id: 'ex-1', state: 'dismissed', revision: 2, evidence_id: 'ev-1', fields: fields('Dismissed'), expires_at: future, created_at: '2026-11-08T10:03:00Z' },
    { id: 's-expired', extraction_id: 'ex-1', state: 'pending', revision: 0, evidence_id: 'ev-1', fields: fields('Expired'), expires_at: past },
    { id: 's-deleted-source', extraction_id: 'ex-2', state: 'pending', revision: 0, fields: fields('From deleted source'), expires_at: future },
    { id: 's-fixture', extraction_id: 'ex-fx', state: 'pending', revision: 0, fields: fields('Fixture'), expires_at: future },
  ];
  s.tasks = [
    { id: 't-open', status: 'approved', revision: 3, accepted_fields: fields('Open task', due('2026-11-12', '17:00')), created_at: '2026-11-08T12:00:00Z' },
    { id: 't-nodate', status: 'approved', revision: 0, accepted_fields: fields('No date'), created_at: '2026-11-08T12:00:00Z' },
    { id: 't-done', status: 'completed', revision: 1, accepted_fields: fields('Done'), completed_at: '2026-11-09T09:00:00Z' },
    { id: 't-cancelled', status: 'approved', revision: 2, cancelled_at: '2026-11-09T08:00:00Z', accepted_fields: fields('Cancelled') },
    { id: 't-deleted', status: 'approved', revision: 0, deleted_at: '2026-11-09T08:00:00Z', accepted_fields: fields('Deleted') },
    { id: 't-legacy', status: 'pending', revision: 0, accepted_fields: null },
  ];
  s.changes = [
    { id: 'c-current', extraction_id: 'ex-1', state: 'pending', kind: 'edit', target_task_id: 't-open', expected_revision: 3, evidence_id: 'ev-1', expires_at: future },
    { id: 'c-stale', extraction_id: 'ex-1', state: 'pending', kind: 'edit', target_task_id: 't-open', expected_revision: 2, evidence_id: 'ev-1', expires_at: future },
    { id: 'c-closed', extraction_id: 'ex-1', state: 'pending', kind: 'cancel', target_task_id: 't-done', expected_revision: 1, evidence_id: 'ev-1', expires_at: future },
    { id: 'c-unresolved', extraction_id: 'ex-1', state: 'pending', kind: 'edit', target_task_id: null, evidence_id: 'ev-1', expires_at: future },
    { id: 'c-dismissed', extraction_id: 'ex-1', state: 'dismissed', kind: 'edit', target_task_id: 't-open', expires_at: future },
  ];
  s.waiting = [
    { id: 'w-resolved', extraction_id: 'ex-1', resolved: true, action: 'Resolved', expires_at: future },
    { id: 'w-open', extraction_id: 'ex-1', resolved: false, action: 'Maya sends feedback', evidence_id: 'ev-1', expires_at: future },
    { id: 'w-fixture', extraction_id: 'ex-fx', resolved: false, action: 'Fixture', expires_at: future },
  ];
  s.followups = [{ id: 'f-1', waiting_for_id: 'w-open', action: 'Ask Maya' }];
  return s;
}

const links = [
  { taskId: 't-open', role: 'updated', threadId: 'th', messageId: 'm9', sender: 'b@example.edu', subject: 'Re', sentAt: null },
  { taskId: 't-open', role: 'created', threadId: 'th', messageId: 'm1', sender: 'prof@example.edu', subject: 'Week 6', sentAt: null },
];

test('only Gmail sources that are not deleted reach the dashboard', () => {
  const m = buildDashboardModel(snapshot(), links, NOW);
  const ids = m.suggestions.map(s => s.row.id);
  assert.deepEqual(ids, ['s-soon', 's-late']);
  assert.deepEqual(m.waiting.map(w => w.row.id), ['w-open', 'w-resolved']);
});

test('suggestions show the user edit, keep evidence state and sort by deadline', () => {
  const [soon, late] = buildDashboardModel(snapshot(), links, NOW).suggestions;
  assert.equal(soon.fields.action, 'Edited');
  assert.equal(soon.edited, true);
  assert.equal(soon.quote, null, 'missing evidence is reported as expired, not invented');
  assert.equal(soon.messageId, 'm1', 'falls back to the source message for the Gmail link');
  assert.equal(late.quote, 'Submit by Friday.');
  assert.deepEqual(late.sibling, { index: 1, of: 2 });
});

test('dismissed suggestions are restorable until they expire', () => {
  const m = buildDashboardModel(snapshot(), links, NOW);
  assert.deepEqual(m.dismissed.map(s => s.row.id), ['s-dismissed']);
});

test('tasks split into open and closed; deleted and unreviewed tasks are hidden', () => {
  const m = buildDashboardModel(snapshot(), links, NOW);
  assert.deepEqual(m.active.map(t => t.row.id), ['t-open', 't-nodate'], 'dated first, undated last');
  assert.deepEqual(m.closed.map(t => t.row.id).sort(), ['t-cancelled', 't-done']);
  assert.equal(m.closed.find(t => t.row.id === 't-cancelled').cancelled, true);
  assert.equal(m.active[0].primary.role, 'created', 'primary source is the creating email');
  assert.equal(m.active[0].pendingChanges, 2);
});

test('change proposals flag stale and closed targets; untargeted ones need the user to choose', () => {
  const m = buildDashboardModel(snapshot(), links, NOW);
  const byId = Object.fromEntries(m.changes.map(c => [c.row.id, c]));
  assert.deepEqual(Object.keys(byId).sort(), ['c-closed', 'c-current', 'c-stale']);
  assert.equal(byId['c-current'].open && !byId['c-current'].stale, true);
  assert.equal(byId['c-stale'].stale, true);
  assert.equal(byId['c-closed'].open, false);
  assert.deepEqual(m.unresolvedChanges.map(c => c.row.id), ['c-unresolved']);
});

test('waiting items carry their follow-ups, open first', () => {
  const [open] = buildDashboardModel(snapshot(), links, NOW).waiting;
  assert.equal(open.row.id, 'w-open');
  assert.deepEqual(open.followups.map(f => f.id), ['f-1']);
});

test('informational summaries show the newest extraction of each source once', () => {
  const m = buildDashboardModel(snapshot(), links, NOW);
  assert.deepEqual(m.information.map(e => e.summary), ['Newer summary']);
});

test('a failed source-link lookup still shows tasks', () => {
  const m = buildDashboardModel(snapshot(), null, NOW);
  assert.equal(m.active.length, 2);
  assert.equal(m.active[0].primary, undefined);
});

test('date-only deadlines never get an invented time', () => {
  const d = deadlineDisplay(due('2026-11-10'), '2026-11-09', 'America/Chicago');
  assert.equal(d.timeLabel, 'Date only');
  assert.equal(d.status, 'Due tomorrow');
  assert.equal(d.dateLabel, 'Nov 10');
  assert.equal(deadlineSortKey(due('2026-11-10')) > deadlineSortKey(due('2026-11-10', '23:00')), true);
  assert.match(fieldText('deadline', due('2026-11-10')), /date only/);
});

test('deadline labels: overdue, today, other zone, none', () => {
  assert.equal(deadlineDisplay(due('2026-11-08'), '2026-11-09').tone, 'red');
  assert.equal(deadlineDisplay(due('2026-11-09', '17:00'), '2026-11-09', 'America/Chicago').timeLabel, '5:00 p.m.');
  assert.equal(deadlineDisplay(due('2026-11-09', '09:30'), '2026-11-09', 'Europe/Paris').timeLabel, '9:30 a.m. (America/Chicago)');
  assert.equal(deadlineDisplay({ ...due('2026-11-09'), boundary: 'on' }, '2026-11-09').status, 'Today');
  assert.equal(deadlineDisplay(null, '2026-11-09').status, 'No deadline stated');
  assert.equal(deadlineDisplay(due('2027-01-05'), '2026-11-09').dateLabel, 'Jan 5, 2027');
});

const ready = { running: false, backlog: false, lastSuccessful: '2026-11-09T10:00:00Z', cooldownUntil: null, result: null };
const clear = { sources: false, consent: false, paused: false, gmail: false };
const panel = (over) => scanPanelState({ status: ready, loadError: false, scanning: false, cooldownLeft: 0, blockers: clear, ...over });

test('scan status: running wins, then load failure, then saved-settings blockers, then cooldown', () => {
  assert.equal(panel({ scanning: true, blockers: { ...clear, paused: true } }), 'processing');
  assert.equal(panel({ status: { ...ready, running: true } }), 'processing');
  assert.equal(panel({ loadError: true }), 'failed');
  assert.equal(panel({ status: null }), 'loading');
  assert.equal(panel({ blockers: { ...clear, sources: true, paused: true } }), 'missing-sources');
  assert.equal(panel({ blockers: { ...clear, consent: true } }), 'paused');
  assert.equal(panel({ blockers: { ...clear, gmail: true } }), 'disconnected');
  assert.equal(panel({ cooldownLeft: 30 }), 'cooldown');
  assert.equal(panel({ status: { ...ready, result: { error: 'STORAGE_BUDGET' } } }), 'failed');
  assert.equal(panel({ status: { ...ready, lastSuccessful: null } }), 'empty');
  assert.equal(panel({}), 'ready');
});

test('a manual scan is offered only when nothing blocks it', () => {
  for (const state of ['loading', 'processing', 'cooldown', 'missing-sources', 'paused', 'disconnected']) assert.equal(canScan(state), false, state);
  for (const state of ['ready', 'empty', 'failed']) assert.equal(canScan(state), true, state);
});
