import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkFiles, validateFixtures } from '../app/pipeline/check-fixtures.mjs';

const base = new URL('./fixtures/', import.meta.url);
const examples = new URL('format-checker/', base);
const example = name => new URL(name, examples);
const validInbox = example('valid-inbox.json'), validExpected = example('valid-expected.json');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const cli = fileURLToPath(new URL('../app/pipeline/check-fixtures.mjs', import.meta.url));

test('valid example pair passes strict validation', async () => {
  assert.deepEqual(await checkFiles(validInbox, validExpected), { errors: [], caseCount: 1 });
});
for (const [name, inbox, expected, pattern] of [
  ['missing required message field', 'invalid-missing-field-inbox.json', 'valid-expected.json', /message\.body: required/],
  ['duplicate case ID', 'invalid-duplicate-id-inbox.json', 'valid-expected.json', /duplicate case ID/],
  ['missing owner', 'valid-inbox.json', 'invalid-owner-expected.json', /owner: required/],
  ['impossible deadline', 'valid-inbox.json', 'invalid-deadline-expected.json', /deadlineDate: required; use valid YYYY-MM-DD/],
]) test(name, async () => {
  const { errors } = await checkFiles(example(inbox), example(expected));
  assert.ok(errors.some(e => pattern.test(e)), errors.join('\n'));
});

test('unknown deadlines may be explicit null, never omitted', async () => {
  const inbox = await read(validInbox), expected = await read(validExpected);
  const entry = expected.H01; delete entry.deadlineDates; entry.nullDeadline = true;
  entry.expectedTasks[0].deadlineDate = null;
  assert.deepEqual(validateFixtures(inbox, expected), []);
  delete entry.expectedTasks[0].deadlineDate;
  assert.ok(validateFixtures(inbox, expected).some(e => e.includes('deadlineDate:')));
});
test('blank owner, invalid date syntax, missing answer and extra answer are rejected', async () => {
  const inbox = await read(validInbox), expected = await read(validExpected);
  expected.H01.expectedTasks[0].owner = ' ';
  expected.H01.expectedTasks[0].deadlineDate = '11/23/2026';
  assert.ok(validateFixtures(inbox, expected).some(e => e.includes('owner:')));
  assert.ok(validateFixtures(inbox, expected).some(e => e.includes('deadlineDate:')));
  expected.EXTRA = expected.H01; delete expected.H01;
  const errors = validateFixtures(inbox, expected);
  assert.ok(errors.some(e => e.includes('missing answer')));
  assert.ok(errors.some(e => e.includes('no matching inbox case')));
});
test('task count mismatch and invalid category are rejected', async () => {
  const inbox = await read(validInbox), expected = await read(validExpected);
  expected.H01.category = 'Other'; expected.H01.taskCount = 2;
  const errors = validateFixtures(inbox, expected);
  assert.ok(errors.some(e => e.includes('category:')));
  assert.ok(errors.some(e => e.includes('length must match')));
});
test('malformed JSON and duplicate answer IDs are rejected from actual files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fixture-check-'));
  try {
    const path = join(dir, 'bad.json'); await writeFile(path, '{oops');
    assert.ok((await checkFiles(validInbox, path)).errors.some(e => e.includes('invalid JSON')));
    const value = JSON.stringify((await read(validExpected)).H01);
    await writeFile(path, `{"H01":${value},"H\\u00301":${value}}`);
    assert.ok((await checkFiles(validInbox, path)).errors.some(e => e.includes('duplicate case ID')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('existing CP2 passes only in legacy mode; Issue #73 passes strict mode', async () => {
  const cp2Inbox = new URL('cp2-inbox.json', base), cp2Expected = new URL('cp2-expected.json', base);
  assert.deepEqual(await checkFiles(cp2Inbox, cp2Expected, { legacy: true }), { errors: [], caseCount: 20 });
  assert.ok((await checkFiles(cp2Inbox, cp2Expected)).errors.some(e => e.includes('expectedTasks')));
  assert.deepEqual(await checkFiles(new URL('issue-73-set1/cp4-heldout-set1-inbox.json', base), new URL('issue-73-set1/cp4-heldout-set1-expected.json', base)), { errors: [], caseCount: 15 });
});
test('CLI returns success for valid input and failure for invalid input with actionable diagnostic', () => {
  const run = (i,e) => spawnSync(process.execPath, [cli, fileURLToPath(i), fileURLToPath(e)], { encoding: 'utf8' });
  const valid = run(validInbox, validExpected); assert.equal(valid.status, 0); assert.match(valid.stdout, /PASS/);
  const invalid = run(validInbox, example('invalid-owner-expected.json')); assert.equal(invalid.status, 1); assert.match(invalid.stderr, /owner: required/);
});
