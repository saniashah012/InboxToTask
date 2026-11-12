// "New" and "unread" dashboard marks: pure rules and browser storage. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeKey, countAdded, endVisit, initialState, isNew, latest, loadNewItems, markSeen,
  MAX_SEEN, saveNewItems, scanSummary, suggestionKey,
} from '../app/web/src/newItems.ts';

const store = new Map();
globalThis.window = { localStorage: {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
} };

const t1 = '2026-11-12T17:00:00.000Z', t2 = '2026-11-12T17:05:00.000Z', t3 = '2026-11-12T17:10:00.000Z';

test('first load counts everything already there as seen and not new', () => {
  const s = initialState([suggestionKey('a'), changeKey('b')], [t1, t2], [t3]);
  assert.deepEqual(s, { seen: ['s:a', 'c:b'], review: t2, passive: t3 });
  assert.equal(isNew(t2, s.review), false);
  assert.equal(isNew(t3, s.review), true);
  assert.equal(initialState([], [], []).review, null);
});

test('a card is new only if it was saved after the last visit', () => {
  assert.equal(isNew(t2, t1), true);
  assert.equal(isNew(t1, t1), false);
  assert.equal(isNew(t1, t2), false);
  assert.equal(isNew(t2, null), true, 'a tab that was empty on first load treats later arrivals as new');
  assert.equal(isNew('not a date', t1), false);
  assert.equal(isNew(undefined, t1), false);
});

test('ending a visit moves the mark to the newest card shown and never back', () => {
  const s = { seen: [], review: t1, passive: null };
  const after = endVisit(s, 'review', [t3, t2]);
  assert.equal(after.review, t3);
  assert.equal(endVisit(after, 'review', [t2]).review, t3, 'an older card cannot move the mark back');
  assert.equal(endVisit(s, 'review', []), s, 'nothing shown leaves it unchanged');
  assert.equal(endVisit(s, 'passive', [t2]).passive, t2);
  assert.equal(latest([null, 'x', t2, t1]), t2);
});

test('opening or acting on a card marks it seen once, with a bounded list', () => {
  let s = { seen: [], review: null, passive: null };
  s = markSeen(s, 's:a');
  assert.equal(markSeen(s, 's:a'), s);
  for (let i = 0; i < MAX_SEEN + 5; i++) s = markSeen(s, `s:${i}`);
  assert.equal(s.seen.length, MAX_SEEN);
  assert.ok(!s.seen.includes('s:a'), 'the oldest marks are dropped first');
});

test('marks are stored per account and survive a reload; bad storage is ignored', () => {
  store.clear();
  assert.equal(loadNewItems('user-a'), null);
  saveNewItems('user-a', { seen: ['s:a'], review: t1, passive: t2 });
  assert.deepEqual(loadNewItems('user-a'), { seen: ['s:a'], review: t1, passive: t2 });
  assert.equal(loadNewItems('user-b'), null, 'another account on this browser starts fresh');
  store.set('inboxtotask:new-items:user-c', '{not json');
  assert.equal(loadNewItems('user-c'), null);
  store.set('inboxtotask:new-items:user-d', JSON.stringify({ seen: ['s:a', 7, 'x'.repeat(200)], review: 'nope', passive: t1 }));
  assert.deepEqual(loadNewItems('user-d'), { seen: ['s:a'], review: null, passive: t1 });
  const raw = store.get('inboxtotask:new-items:user-a');
  assert.ok(!/subject|body|@/.test(raw), 'only IDs and timestamps are stored');
});

test('the finished-check message counts what was added, with plurals and zero cases', () => {
  assert.equal(countAdded(new Set(['a', 'b']), ['a', 'b', 'c', 'd']), 2);
  assert.equal(scanSummary({ suggestions: 3, changes: 1, passive: 2 }),
    'Found 3 new suggestions, 1 task update and 2 Passive communication summaries.');
  assert.equal(scanSummary({ suggestions: 1, changes: 0, passive: 0 }), 'Found 1 new suggestion.');
  assert.equal(scanSummary({ suggestions: 0, changes: 2, passive: 1 }), 'Found 2 task updates and 1 Passive communication summary.');
  assert.equal(scanSummary({ suggestions: 0, changes: 0, passive: 0 }), 'No new items found.');
});
