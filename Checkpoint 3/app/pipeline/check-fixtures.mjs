import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v) => typeof v === 'string' && v.trim().length > 0;
const own = (v, k) => Object.hasOwn(v, k);
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const stringList = (v) => Array.isArray(v) && v.every(nonempty);
const date = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const timestamp = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && date(v.slice(0, 10)) && Number.isFinite(Date.parse(v));

// JSON.parse silently discards repeated object keys. Check the raw answer-key
// map for duplicates before using it, including escaped spellings of IDs.
function duplicateTopKeys(raw) {
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]/g;
  const seen = new Set(), duplicates = new Set();
  let depth = 0, expectKey = false;
  for (const [token] of raw.matchAll(tokens)) {
    if (token === '{' || token === '[') { depth++; if (depth === 1 && token === '{') expectKey = true; }
    else if (token === '}' || token === ']') depth--;
    else if (depth === 1 && token === ',') expectKey = true;
    else if (depth === 1 && expectKey && token.startsWith('"')) {
      const key = JSON.parse(token);
      if (seen.has(key)) duplicates.add(key);
      seen.add(key); expectKey = false;
    }
  }
  return [...duplicates];
}

export function validateFixtures(inbox, expected, { legacy = false } = {}) {
  const errors = [];
  const err = (path, reason) => errors.push(`${path}: ${reason}`);
  function requireStrings(value, fields, path) {
    for (const field of fields) if (!nonempty(value[field])) err(`${path}.${field}`, 'required non-empty string');
  }
  function message(value, path) {
    if (!object(value)) { err(path, 'required message object'); return; }
    requireStrings(value, ['id', 'threadId', 'from', 'sentAtPrecision'], path);
    for (const field of ['subject', 'body']) if (typeof value[field] !== 'string') err(`${path}.${field}`, 'required string');
    if (!timestamp(value.sentAt)) err(`${path}.sentAt`, 'expected ISO timestamp with time zone');
    if (!stringList(value.labels)) err(`${path}.labels`, 'expected array of strings');
  }
  const ids = new Set();
  if (!object(inbox)) err('inbox', 'expected object');
  else {
    if (!object(inbox.user)) err('inbox.user', 'required object');
    else requireStrings(inbox.user, ['email', 'timeZone'], 'inbox.user');
    if (!timestamp(inbox.analysisTime)) err('inbox.analysisTime', 'expected ISO timestamp with time zone');
    if (!object(inbox.rules)) err('inbox.rules', 'required object');
    else for (const group of ['allow', 'block']) {
      const r = inbox.rules[group];
      if (!object(r)) { err(`inbox.rules.${group}`, 'required object'); continue; }
      for (const field of ['labels', 'senders', 'domains', ...(group === 'block' ? ['subjectKeywords'] : [])])
        if (!stringList(r[field])) err(`inbox.rules.${group}.${field}`, 'expected array of strings');
    }
    if (!Array.isArray(inbox.cases) || !inbox.cases.length) err('inbox.cases', 'expected non-empty array');
    else inbox.cases.forEach((c, i) => {
      const p = `inbox.cases[${i}]`;
      if (!object(c)) { err(p, 'expected object'); return; }
      message(c.message, `${p}.message`);
      const id = c.message?.id;
      if (nonempty(id)) {
        if (ids.has(id)) err(`${p}.message.id`, `duplicate case ID ${JSON.stringify(id)}`);
        ids.add(id);
      }
      if (!Array.isArray(c.threadContext)) err(`${p}.threadContext`, 'required array');
      else c.threadContext.forEach((m, j) => message(m, `${p}.threadContext[${j}]`));
    });
  }
  if (!object(expected)) err('expected', 'expected object keyed by case ID');
  else {
    for (const id of ids) if (!own(expected, id)) err(`expected.${id}`, 'missing answer for inbox case');
    for (const [id, entry] of Object.entries(expected)) {
      const p = `expected.${id}`;
      if (!ids.has(id)) err(p, 'answer has no matching inbox case');
      if (!object(entry)) { err(p, 'expected answer object'); continue; }
      if (!['Actionable', 'Passive'].includes(entry.category)) err(`${p}.category`, 'expected Actionable or Passive');
      if (!own(entry, 'taskCount') && !own(entry, 'minTasks')) err(p, 'taskCount or minTasks is required');
      for (const field of ['taskCount', 'minTasks']) if (own(entry, field) && !count(entry[field])) err(`${p}.${field}`, 'expected non-negative integer');
      if (own(entry, 'taskCount') && own(entry, 'minTasks') && entry.taskCount < entry.minTasks) err(p, 'taskCount is smaller than minTasks');
      if (entry.category === 'Passive' && (entry.taskCount > 0 || entry.minTasks > 0)) err(p, 'Passive cases cannot contain tasks');
      if (entry.category === 'Actionable' && (entry.taskCount === 0 || (!own(entry, 'taskCount') && entry.minTasks === 0))) err(p, 'Actionable cases require at least one task');
      if (own(entry, 'deadlineDates')) {
        if (!Array.isArray(entry.deadlineDates)) err(`${p}.deadlineDates`, 'expected array');
        else entry.deadlineDates.forEach((d, i) => { if (!date(d)) err(`${p}.deadlineDates[${i}]`, 'expected valid YYYY-MM-DD date'); });
      }
      for (const field of ['nullDeadline','conditional','before','waiting','followUp','noFollowUp']) if (own(entry, field) && typeof entry[field] !== 'boolean') err(`${p}.${field}`, 'expected boolean');
      if (own(entry, 'conditionTerms') && !stringList(entry.conditionTerms)) err(`${p}.conditionTerms`, 'expected array of strings');
      if (own(entry, 'humanReview') && !nonempty(entry.humanReview)) err(`${p}.humanReview`, 'expected non-empty string');
      if (!legacy || own(entry, 'expectedTasks')) {
        if (!Array.isArray(entry.expectedTasks)) { err(`${p}.expectedTasks`, 'required array; each task needs title, owner and deadlineDate'); continue; }
        const tasks = entry.expectedTasks;
        if (count(entry.taskCount) && tasks.length !== entry.taskCount) err(`${p}.expectedTasks`, 'length must match taskCount');
        if (count(entry.minTasks) && tasks.length < entry.minTasks) err(`${p}.expectedTasks`, 'length must be at least minTasks');
        if (entry.category === 'Passive' && tasks.length) err(`${p}.expectedTasks`, 'Passive cases cannot contain tasks');
        tasks.forEach((task, i) => {
          const t = `${p}.expectedTasks[${i}]`;
          if (!object(task)) { err(t, 'expected task object'); return; }
          requireStrings(task, ['title','owner'], t);
          if (!own(task, 'deadlineDate') || (task.deadlineDate !== null && !date(task.deadlineDate))) err(`${t}.deadlineDate`, 'required; use valid YYYY-MM-DD or null for an unknown/absent deadline');
          if (entry.nullDeadline === true && task.deadlineDate !== null) err(`${t}.deadlineDate`, 'must be null when nullDeadline is true');
        });
        if (Array.isArray(entry.deadlineDates)) {
          const actual = tasks.filter(object).map(t => t.deadlineDate);
          for (const d of entry.deadlineDates) {
            const i = actual.indexOf(d);
            if (i < 0) err(`${p}.deadlineDates`, `date ${JSON.stringify(d)} not matched by expectedTasks`);
            else actual.splice(i, 1);
          }
        }
      }
    }
  }
  return errors;
}

export async function checkFiles(inboxPath, expectedPath, options = {}) {
  const errors = [];
  async function load(path, isExpected) {
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
      if (isExpected && object(parsed)) for (const id of duplicateTopKeys(raw)) errors.push(`expected.${id}: duplicate case ID in JSON object`);
      return { parsed, ok: true };
    } catch (e) {
      errors.push(`${path}: ${e instanceof SyntaxError ? 'invalid JSON' : `cannot read file (${e.code ?? 'unknown error'})`}`);
      return { ok: false };
    }
  }
  const inbox = await load(inboxPath, false), expected = await load(expectedPath, true);
  if (inbox.ok && expected.ok) errors.push(...validateFixtures(inbox.parsed, expected.parsed, options));
  return { errors, caseCount: Array.isArray(inbox.parsed?.cases) ? inbox.parsed.cases.length : 0 };
}

async function main() {
  const args = process.argv.slice(2);
  const legacy = args[0] === '--legacy';
  if (legacy) args.shift();
  if (args.length !== 0 && args.length !== 2 || (legacy && args.length !== 2) || args.some(a => a.startsWith('--'))) {
    console.error('Usage: npm run fixtures:check -- [--legacy] <inbox.json> <expected.json> (no arguments checks bundled sets)');
    process.exitCode = 1; return;
  }
  const base = new URL('../../tests/fixtures/', import.meta.url);
  const pairs = args.length ? [{ inbox: resolve(args[0]), expected: resolve(args[1]), legacy, name: args[0] }]
    : [ { inbox: new URL('cp2-inbox.json', base), expected: new URL('cp2-expected.json', base), legacy: true, name: 'CP2 (legacy)' },
        { inbox: new URL('issue-73-set1/cp4-heldout-set1-inbox.json', base), expected: new URL('issue-73-set1/cp4-heldout-set1-expected.json', base), legacy: false, name: 'Issue #73 (strict)' } ];
  for (const pair of pairs) {
    const result = await checkFiles(pair.inbox, pair.expected, { legacy: pair.legacy });
    if (result.errors.length) {
      console.error(`FAIL ${pair.name}: ${result.errors.length} error(s)`);
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else console.log(`PASS ${pair.name}: ${result.caseCount} cases${pair.legacy ? ' (legacy: per-task owners not required)' : ''}`);
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
