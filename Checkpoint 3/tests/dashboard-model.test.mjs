// Offline checks for how saved records map onto the designed dashboard.
// Fictional rows only; no network, no model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_CHECK_INTERVAL_MS, MAX_RETRY_MS, quietStop, skippedByCategories, TRANSIENT_RETRY_MS, transientRetryDelay, autoContinueDelay, autoNextCheck, batchMadeProgress, buildDashboardModel, checkedAgo, checkedNoNewEmail, canScan, deadlineDisplay, deadlineSortKey, emptySnapshot, fieldText, sameTaskFields, scanPanelState, sourceDeleteCheck,
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
    { id: 'src-info', namespace: 'gmail', message_id: 'm3', sender: 'library@example.edu', subject: 'Library hours' },
    { id: 'src-became-task', namespace: 'gmail', message_id: 'm4', sender: 'lab@example.edu', subject: 'Room change' },
  ];
  s.extractions = [
    { id: 'ex-1', source_id: 'src-1', category: 'Actionable', created_at: '2026-11-08T10:01:00Z', summary: 'Actionable summary', topic_relevance: 'relevant', digest_expires_at: future },
    { id: 'ex-1b', source_id: 'src-1', category: 'Actionable', created_at: '2026-11-09T10:01:00Z', summary: 'Newer actionable summary', topic_relevance: 'relevant', digest_expires_at: future, needs_review: true },
    { id: 'ex-info', source_id: 'src-info', category: 'Passive', created_at: '2026-11-08T09:00:00Z', summary: 'Older summary', topic_relevance: 'relevant', digest_expires_at: future },
    { id: 'ex-info-b', source_id: 'src-info', category: 'Passive', created_at: '2026-11-09T09:00:00Z', summary: 'Newer summary', topic_relevance: 'relevant', digest_expires_at: future },
    { id: 'ex-task-a', source_id: 'src-became-task', category: 'Passive', created_at: '2026-11-08T09:00:00Z', summary: 'Was informational', digest_expires_at: future },
    { id: 'ex-task-b', source_id: 'src-became-task', category: 'Actionable', created_at: '2026-11-09T09:00:00Z', summary: 'Now has a task', digest_expires_at: future },
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

test('a suggestion is edited only when its review values differ from the scan', () => {
  const scan = { action: 'Submit lab', requirements: ['Report', 'Data'], condition: null, deadline: due('2026-11-20', '17:00') };
  const reordered = { deadline: { boundary: 'by', wording: 'by 2026-11-20', timeZone: 'America/Chicago', time: '17:00', date: '2026-11-20' }, condition: null, requirements: ['Report', 'Data'], action: 'Submit lab' };
  const edited = (review) => {
    const s = snapshot();
    s.suggestions = [{ id: 's-x', extraction_id: 'ex-1', state: 'pending', revision: 2, evidence_id: 'ev-1', fields: scan, ...(review === undefined ? {} : { review_fields: review }), expires_at: future }];
    return buildDashboardModel(s, links, NOW).suggestions[0].edited;
  };
  assert.equal(edited(undefined), false, 'no review values');
  assert.equal(edited(null), false, 'review values cleared');
  assert.equal(edited(structuredClone(scan)), false, 'approved or moved back untouched');
  assert.equal(edited(reordered), false, 'saved JSON in a different key order');
  assert.equal(edited({ ...scan, deadline: { ...scan.deadline, date: '2026-11-21', wording: 'Entered by you after reading the source email.' } }), true, 'changed deadline');
  assert.equal(edited({ ...scan, deadline: null }), true, 'removed deadline');
  assert.equal(edited({ ...scan, action: 'Submit lab report' }), true, 'changed action');
  assert.equal(edited({ ...scan, requirements: ['Report'] }), true, 'removed requirement');
  assert.equal(edited({ ...scan, requirements: ['Data', 'Report'] }), true, 'reordered requirements');
  assert.equal(edited({ ...scan, condition: 'If the lab runs' }), true, 'added condition');
});

test('sameTaskFields treats a missing key as null and compares nested values', () => {
  assert.equal(sameTaskFields({ action: 'A', requirements: [], deadline: null }, { action: 'A', requirements: [], condition: null, deadline: null }), true);
  assert.equal(sameTaskFields({ action: 'A', condition: undefined }, { action: 'A', condition: null }), true);
  assert.equal(sameTaskFields({ action: 'A', requirements: [] }, { action: 'A', requirements: null }), false, 'an empty list is not null');
  assert.equal(sameTaskFields(fields('A', due('2026-11-20')), fields('A', due('2026-11-20', '09:00'))), false);
  assert.equal(sameTaskFields(fields('A', due('2026-11-20')), fields('A', { ...due('2026-11-20'), timeZone: 'America/New_York' })), false);
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

test('passive communication shows only informational emails, newest analysis once', () => {
  const m = buildDashboardModel(snapshot(), links, NOW);
  // Actionable emails stay out even though they have summaries; so does an email whose
  // newest analysis turned Actionable.
  assert.deepEqual(m.information.map(e => e.summary), ['Newer summary']);
});

// "Turn into task": a Passive email with a live task created from it.
function withPassiveTask(task) {
  const s = snapshot();
  s.evidence.push({ id: 'ev-info', extraction_id: 'ex-info-b', quote: 'The library closes early on Friday.', message_id: 'm3' });
  s.tasks.push({ id: 't-passive', status: 'approved', revision: 0, accepted_fields: fields('Return books', due('2026-11-14')), origin_extraction_id: 'ex-info-b', created_at: '2026-11-09T12:00:00Z', ...task });
  return s;
}

test('a Passive email with a live task created from it leaves Passive communication', () => {
  assert.deepEqual(buildDashboardModel(withPassiveTask(), links, NOW).information, []);
  assert.deepEqual(buildDashboardModel(withPassiveTask({ status: 'completed', completed_at: '2026-11-09T13:00:00Z' }), links, NOW).information, [], 'completed tasks keep it out too');
});

test('the task hides the email even when it points at an older analysis of the same email', () => {
  // A rescan made ex-info-b after the task was created from ex-info.
  assert.deepEqual(buildDashboardModel(withPassiveTask({ origin_extraction_id: 'ex-info' }), links, NOW).information, []);
});

test('the email comes back to Passive when its task is deleted or gone', () => {
  assert.deepEqual(buildDashboardModel(withPassiveTask({ deleted_at: '2026-11-09T14:00:00Z' }), links, NOW).information.map(e => e.summary), ['Newer summary']);
  const gone = withPassiveTask();
  gone.tasks = gone.tasks.filter(t => t.id !== 't-passive');
  assert.deepEqual(buildDashboardModel(gone, links, NOW).information.map(e => e.summary), ['Newer summary']);
});

test('only tasks created from a Passive email carry fromPassive, with their source view', () => {
  const m = buildDashboardModel(withPassiveTask(), links, NOW);
  const task = m.active.find(t => t.row.id === 't-passive');
  assert.equal(task.primary, undefined, 'no suggestion-based source link');
  assert.equal(task.fromPassive.extraction.id, 'ex-info-b');
  assert.equal(task.fromPassive.source.subject, 'Library hours');
  assert.equal(task.fromPassive.quote, 'The library closes early on Friday.');
  assert.equal(task.fromPassive.messageId, 'm3');
  assert.equal(task.fromPassive.summary, 'Newer summary');
  assert.equal(task.fromPassive.canReturn, true);
  // Ordinary tasks are unchanged.
  for (const t of [...m.active, ...m.closed].filter(t => t.row.id !== 't-passive')) assert.equal('fromPassive' in t, false, t.row.id);
  assert.deepEqual(m.active.map(t => t.row.id), ['t-open', 't-passive', 't-nodate']);
});

test('a task whose Passive summary is gone or expired cannot move back', () => {
  const cleared = withPassiveTask();
  cleared.extractions.find(e => e.id === 'ex-info-b').summary = null;
  assert.equal(buildDashboardModel(cleared, links, NOW).active.find(t => t.row.id === 't-passive').fromPassive.canReturn, false);
  const expired = withPassiveTask();
  expired.extractions.find(e => e.id === 'ex-info-b').digest_expires_at = past;
  assert.equal(buildDashboardModel(expired, links, NOW).active.find(t => t.row.id === 't-passive').fromPassive.canReturn, false);
  const missing = withPassiveTask({ origin_extraction_id: 'ex-gone' });
  assert.equal(buildDashboardModel(missing, links, NOW).active.find(t => t.row.id === 't-passive').fromPassive, undefined);
});

test('a failed source-link lookup still shows tasks', () => {
  const m = buildDashboardModel(snapshot(), null, NOW);
  assert.equal(m.active.length, 2);
  assert.equal(m.active[0].primary, undefined);
});

// "Delete from InboxToTask" in the Source email dialog.
const allowed = { allowed: true };
const blocked = (reason) => ({ allowed: false, reason });

test('delete from InboxToTask is offered for an email no task comes from', () => {
  assert.deepEqual(sourceDeleteCheck(snapshot(), links, 'src-info'), allowed);
  // A pending proposal from the email does not block: deleting it only drops the proposal.
  const proposing = snapshot();
  proposing.changes.push({ id: 'c-info', extraction_id: 'ex-info-b', state: 'pending', kind: 'edit', target_task_id: 't-open', expires_at: future });
  assert.deepEqual(sourceDeleteCheck(proposing, links, 'src-info'), allowed);
  // No tasks at all: nothing to check, even when source links did not load.
  const noTasks = snapshot();
  noTasks.tasks = [];
  assert.deepEqual(sourceDeleteCheck(noTasks, null, 'src-1'), allowed);
});

test('delete from InboxToTask is not offered for an email that is gone or not from Gmail', () => {
  for (const id of ['src-2', 'src-fx', 'src-unknown', null, undefined]) assert.deepEqual(sourceDeleteCheck(snapshot(), links, id), blocked('unavailable'), String(id));
});

test('delete from InboxToTask is not offered while a task was added from the email', () => {
  // Suggestion task, found through its source link.
  assert.deepEqual(sourceDeleteCheck(snapshot(), links, 'src-1'), blocked('task'));
  // "Turn into task" from a Passive email, active or completed, and from an older analysis.
  assert.deepEqual(sourceDeleteCheck(withPassiveTask(), [], 'src-info'), blocked('task'));
  assert.deepEqual(sourceDeleteCheck(withPassiveTask({ status: 'completed' }), [], 'src-info'), blocked('task'));
  assert.deepEqual(sourceDeleteCheck(withPassiveTask({ origin_extraction_id: 'ex-info' }), [], 'src-info'), blocked('task'));
  // Once that task is deleted (moved back), the email can be deleted.
  assert.deepEqual(sourceDeleteCheck(withPassiveTask({ deleted_at: '2026-11-09T14:00:00Z' }), [], 'src-info'), allowed);
});

test('a task counts through its suggestion, an approved change, or a link to an earlier message', () => {
  const base = () => {
    const s = snapshot();
    s.sources.push({ id: 'src-x', namespace: 'gmail', message_id: 'm-x', thread_id: 'th-x', sender: 'club@example.edu', subject: 'Signup' });
    s.extractions.push({ id: 'ex-x', source_id: 'src-x', category: 'Actionable', created_at: '2026-11-09T11:00:00Z', digest_expires_at: future });
    return s;
  };
  assert.deepEqual(sourceDeleteCheck(base(), [], 'src-x'), allowed);
  const approved = base();
  approved.suggestions.push({ id: 's-x', extraction_id: 'ex-x', state: 'approved', approved_task_id: 't-nodate', revision: 1, fields: fields('Sign up'), expires_at: future });
  assert.deepEqual(sourceDeleteCheck(approved, [], 'src-x'), blocked('task'));
  const origin = base();
  origin.suggestions.push({ id: 's-x', extraction_id: 'ex-x', state: 'approved', revision: 1, fields: fields('Sign up'), expires_at: future });
  origin.tasks.push({ id: 't-x', status: 'completed', revision: 0, origin_suggestion_id: 's-x', accepted_fields: fields('Sign up') });
  assert.deepEqual(sourceDeleteCheck(origin, [], 'src-x'), blocked('task'));
  const changed = base();
  changed.changes.push({ id: 'c-x', extraction_id: 'ex-x', state: 'approved', kind: 'edit', target_task_id: 't-open', expires_at: future });
  assert.deepEqual(sourceDeleteCheck(changed, [], 'src-x'), blocked('task'));
  // A cancelled task still exists, so it blocks too.
  const cancelled = base();
  cancelled.changes.push({ id: 'c-x', extraction_id: 'ex-x', state: 'approved', kind: 'cancel', target_task_id: 't-cancelled', expires_at: future });
  assert.deepEqual(sourceDeleteCheck(cancelled, [], 'src-x'), blocked('task'));
  // The suggestion expired and is no longer loaded: the source link still shows it.
  const link = (over) => [{ taskId: 't-nodate', role: 'created', threadId: 'th-other', messageId: 'm-other', earlierMessage: false, ...over }];
  assert.deepEqual(sourceDeleteCheck(base(), link({ messageId: 'm-x' }), 'src-x'), blocked('task'));
  assert.deepEqual(sourceDeleteCheck(base(), link({ threadId: 'th-x', messageId: 'm-older', earlierMessage: true }), 'src-x'), blocked('task'));
  assert.deepEqual(sourceDeleteCheck(base(), link({ threadId: 'th-x', messageId: 'm-later' }), 'src-x'), allowed, 'another message in the thread with its own link');
  assert.deepEqual(sourceDeleteCheck(base(), link({ taskId: 't-deleted', messageId: 'm-x' }), 'src-x'), allowed, 'links of deleted tasks do not count');
});

test('delete from InboxToTask waits for source links when tasks exist', () => {
  assert.deepEqual(sourceDeleteCheck(snapshot(), null, 'src-info'), blocked('links-unavailable'));
  // A task found from the saved records is reported as such even without links.
  assert.deepEqual(sourceDeleteCheck(withPassiveTask(), null, 'src-info'), blocked('task'));
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
  assert.equal(panel({ status: { ...ready, result: { error: 'GMAIL_UNAVAILABLE' } } }), 'failed');
  for (const error of ['SCAN_INFERENCE_LIMIT', 'SCAN_TIME_LIMIT', 'SCAN_RETRIEVAL_LIMIT', 'STORAGE_PROVIDER_LIMIT']) {
    assert.equal(panel({ status: { ...ready, backlog: true, result: { error } } }), 'partial', error);
    // A limit hit after the last email was handled leaves nothing waiting.
    assert.equal(panel({ status: { ...ready, backlog: false, result: { error } } }), 'ready', error);
  }
  assert.equal(panel({ status: { ...ready, backlog: true, result: { error: null } } }), 'partial');
  assert.equal(panel({ status: { ...ready, backlog: true, result: { error: 'STORAGE_BUDGET' } } }), 'daily-limit');
  assert.equal(panel({ status: { ...ready, lastSuccessful: null } }), 'empty');
  assert.equal(panel({}), 'ready');
});

test('a manual scan is offered only when nothing blocks it', () => {
  for (const state of ['loading', 'processing', 'cooldown', 'missing-sources', 'paused', 'disconnected']) assert.equal(canScan(state), false, state);
  for (const state of ['ready', 'empty', 'failed', 'partial', 'daily-limit']) assert.equal(canScan(state), true, state);
});

test('automatic scanning continues only while a backlog is saved, after the cooldown', () => {
  const at = Date.parse('2026-11-09T15:00:10Z');
  const waiting = { ...ready, backlog: true, cooldownUntil: '2026-11-09T15:00:30Z', lastFinished: '2026-11-09T15:00:05Z', result: { error: 'SCAN_INFERENCE_LIMIT' } };
  assert.equal(autoContinueDelay(waiting, at), 20_000);
  assert.equal(autoContinueDelay({ ...waiting, cooldownUntil: '2026-11-09T14:59:00Z' }, at), 0);
  assert.equal(autoContinueDelay({ ...waiting, backlog: false }, at), null, 'caught up');
  assert.equal(autoContinueDelay({ ...waiting, running: true }, at), null);
  assert.equal(autoContinueDelay(null, at), null);
  for (const error of ['STORAGE_BUDGET', 'GMAIL_RECONNECT_REQUIRED', 'STORAGE_PAUSED']) assert.equal(autoContinueDelay({ ...waiting, result: { error } }, at), null, error);
  // The shared per-minute limit waits for the next calendar minute.
  assert.equal(autoContinueDelay({ ...waiting, result: { error: 'STORAGE_PROVIDER_LIMIT' } }, at), 52_000);
});

test('a batch that moved nothing forward counts as a stall', () => {
  assert.equal(batchMadeProgress({ counts: { prepared: 3, modelCalls: 3 } }), true);
  assert.equal(batchMadeProgress({ counts: { blocked: 4 } }), true);
  assert.equal(batchMadeProgress({ counts: { noTopicWord: 2 } }), true, 'skipped for no topic word');
  assert.equal(batchMadeProgress({ counts: { candidates: 0, modelCalls: 0 } }), false);
  assert.equal(batchMadeProgress(null), false);
});

test('automatic checks: on opening right away, then every minute after the last finished', () => {
  assert.equal(AUTO_CHECK_INTERVAL_MS, 60_000);
  const at = Date.parse('2026-11-09T15:00:10Z');
  const done = { ...ready, lastFinished: '2026-11-09T15:00:05Z', cooldownUntil: '2026-11-09T15:00:20Z', result: { error: null, counts: { prepared: 0 } } };
  // Opening the app: start now, or as soon as the cooldown ends.
  assert.deepEqual(autoNextCheck({ ...done, cooldownUntil: '2026-11-09T14:59:00Z', lastFinished: '2026-11-09T14:58:50Z' }, at, true), { mode: 'initial', delay: 0 });
  assert.deepEqual(autoNextCheck(done, at, true), { mode: 'initial', delay: 10_000 }, 'opening waits only for the cooldown');
  assert.deepEqual(autoNextCheck({ ...ready, lastSuccessful: null }, at, true), { mode: 'initial', delay: 0 }, 'first check ever');
  // Later checks: one minute after the previous one finished.
  assert.deepEqual(autoNextCheck(done, at, false), { mode: 'initial', delay: 55_000 });
  assert.deepEqual(autoNextCheck(done, Date.parse('2026-11-09T15:02:00Z'), false), { mode: 'initial', delay: 0 }, 'overdue');
  // A planned per-batch stop that left nothing waiting is still caught up.
  assert.equal(autoNextCheck({ ...done, result: { error: 'SCAN_TIME_LIMIT' } }, at, false).mode, 'initial');
  // Nothing new starts while running, after a daily limit, reconnect or other stop.
  assert.equal(autoNextCheck({ ...done, running: true }, at, false), null);
  assert.equal(autoNextCheck(null, at, true), null);
  for (const error of ['STORAGE_BUDGET', 'GMAIL_RECONNECT_REQUIRED', 'GMAIL_REQUEST_REJECTED', 'SCAN_UNEXPECTED_ERROR', 'SCAN_FAILURE_LIMIT']) {
    assert.equal(autoNextCheck({ ...done, result: { error } }, at, false), null, error);
    assert.equal(autoNextCheck({ ...done, result: { error } }, at, true), null, `${error} on opening`);
  }
});

test('automatic checks continue a saved backlog before starting a new check', () => {
  const at = Date.parse('2026-11-09T15:00:10Z');
  const waiting = { ...ready, backlog: true, cooldownUntil: '2026-11-09T15:00:30Z', lastFinished: '2026-11-09T15:00:05Z', result: { error: 'SCAN_INFERENCE_LIMIT' } };
  // On opening and later: always 'more', after the cooldown, never the 1-minute wait.
  assert.deepEqual(autoNextCheck(waiting, at, true), { mode: 'more', delay: 20_000 });
  assert.deepEqual(autoNextCheck(waiting, at, false), { mode: 'more', delay: 20_000 });
  assert.deepEqual(autoNextCheck({ ...waiting, result: { error: 'STORAGE_PROVIDER_LIMIT' } }, at, false), { mode: 'more', delay: 52_000 });
  // A backlog that stopped for another reason is not replaced by a new check.
  for (const error of ['STORAGE_BUDGET', 'GMAIL_RECONNECT_REQUIRED', 'SCAN_UNEXPECTED_ERROR']) assert.equal(autoNextCheck({ ...waiting, result: { error } }, at, false), null, error);
});

test('status line: a check that found nothing says so, with relative time', () => {
  const at = Date.parse('2026-11-09T15:00:10Z');
  const nothing = { ...ready, lastFinished: '2026-11-09T15:00:05Z', result: { error: null, counts: { candidates: 2, blocked: 1, prepared: 1, reused: 1, failed: 0 } } };
  assert.equal(checkedNoNewEmail(nothing), true, 'overlap reuse is not new email');
  assert.equal(checkedNoNewEmail({ ...nothing, result: { error: null, counts: { prepared: 2, reused: 1 } } }), false);
  assert.equal(checkedNoNewEmail({ ...nothing, result: { error: null, counts: { failed: 1 } } }), false);
  assert.equal(checkedNoNewEmail({ ...nothing, backlog: true }), false);
  assert.equal(checkedNoNewEmail({ ...nothing, running: true }), false);
  assert.equal(checkedNoNewEmail({ ...nothing, result: { error: 'SCAN_TIME_LIMIT', counts: {} } }), false);
  assert.equal(checkedNoNewEmail({ ...nothing, lastFinished: null }), false);
  assert.equal(checkedNoNewEmail(null), false);
  assert.equal(checkedAgo('2026-11-09T15:00:05Z', at), 'just now');
  assert.equal(checkedAgo('2026-11-09T14:57:05Z', at), '3 min ago');
  assert.equal(checkedAgo('2026-11-09T12:00:00Z', at), '3 hr ago');
  assert.equal(checkedAgo('2026-11-07T12:00:00Z', at), null);
  assert.equal(checkedAgo('not a date', at), null);
});

test('the skipped count is only category-word skips from the latest finished check', () => {
  const finished = { ...ready, lastFinished: '2026-11-12T21:27:20Z', result: { error: null, counts: { candidates: 9, blocked: 6, noTopicWord: 1, privateTopic: 1, prepared: 1 } } };
  assert.equal(skippedByCategories(finished), 2, 'blocked senders and notices are not counted');
  assert.equal(skippedByCategories({ ...finished, running: true }), 0, 'hidden while a check runs');
  assert.equal(skippedByCategories({ ...finished, result: { error: null, counts: { candidates: 1, prepared: 1 } } }), 0);
  assert.equal(skippedByCategories(null), 0);
});

test('automatic checks keep retrying a passing Gmail or AI-service problem, waiting longer each time', () => {
  const at = Date.parse('2026-11-09T15:00:10Z');
  const blip = { ...ready, backlog: true, lastFinished: '2026-11-09T15:00:00Z', cooldownUntil: '2026-11-09T15:00:20Z', result: { error: 'GMAIL_UNAVAILABLE' } };
  // Retried 30 seconds after it stopped, continuing what was left.
  assert.deepEqual(autoNextCheck(blip, at, false, 0), { mode: 'more', delay: TRANSIENT_RETRY_MS - 10_000 });
  assert.deepEqual(autoNextCheck({ ...blip, backlog: false }, at, true, 1), { mode: 'initial', delay: 50_000 }, 'second failure waits a minute');
  for (const error of ['GMAIL_TIMEOUT', 'GMAIL_SERVER_ERROR', 'GMAIL_RATE_LIMITED', 'PROVIDER_HTTP_429'])
    assert.ok(autoNextCheck({ ...blip, result: { error } }, at, false, 0), error);
  // It never gives up: the wait doubles, up to 5 minutes.
  assert.deepEqual([0, 1, 2, 3, 10].map(transientRetryDelay), [30_000, 60_000, 120_000, 240_000, MAX_RETRY_MS]);
  assert.deepEqual(autoNextCheck(blip, at, false, 10), { mode: 'more', delay: MAX_RETRY_MS - 10_000 });
  assert.equal(quietStop(blip, true), true);
  assert.equal(quietStop(blip, false), false, 'manual scanning shows it straight away');
  assert.equal(quietStop({ ...blip, result: { error: 'GMAIL_RECONNECT_REQUIRED' } }, true), false, 'problems you must act on are never hidden');
});
