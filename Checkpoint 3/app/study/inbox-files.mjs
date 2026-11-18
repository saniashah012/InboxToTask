import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Study inbox email files: Markdown with a small front-matter block.
//
//   ---
//   id: 03
//   sender: test-sender          (or a role label such as "Sender 1")
//   subject: Lab report due Friday
//   send_order: 3                (optional; defaults to the id)
//   reply_to_id: 01              (optional; an earlier email in the same inbox)
//   ---
//   Plain-text body...
//
// The parser is deliberately strict and has no YAML dependency: one `key: value`
// per line, values may be wrapped in matching single or double quotes (no escape
// sequences), blank lines and `#` comment lines are ignored inside the block.

export const TEST_SENDER = 'test-sender';
const KEYS = new Set(['id', 'sender', 'subject', 'send_order', 'reply_to_id']);
const ID = /^\d{2}$/;
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/;

export class StudyError extends Error {
  constructor(message) { super(message); this.name = 'StudyError'; }
}

function unquote(value) {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) return value.slice(1, -1);
  return value;
}

export function hasReplyPrefix(subject) { return /^re:/i.test(subject.trim()); }
export function replySubject(subject) { return hasReplyPrefix(subject) ? subject : `Re: ${subject}`; }

// Returns { id, sender, subject, sendOrder, replyToId, body, file } or throws StudyError.
export function parseEmailFile(text, file = 'email') {
  const fail = (why) => { throw new StudyError(`${file}: ${why}`); };
  const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  if (lines[0].trimEnd() !== '---') fail('must start with a "---" front-matter line');
  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === '---');
  if (end < 0) fail('front matter is not closed with a "---" line');
  const fields = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!m) fail(`line ${i + 1} is not "key: value"`);
    const key = m[1];
    if (!KEYS.has(key)) fail(`unknown key "${key}" on line ${i + 1}`);
    if (Object.hasOwn(fields, key)) fail(`duplicate key "${key}" on line ${i + 1}`);
    const value = unquote(m[2].trim());
    if (CONTROL.test(value)) fail(`"${key}" contains a control character`);
    fields[key] = value;
  }
  const id = fields.id ?? fail('missing "id"');
  if (!ID.test(id)) fail(`id "${id}" must be a two-digit string such as 03`);
  const sender = (fields.sender ?? '').trim();
  if (!sender) fail('missing or empty "sender"');
  const subject = (fields.subject ?? '').trim();
  if (!subject) fail('missing or empty "subject"');
  let sendOrder = Number(id);
  if (fields.send_order !== undefined) {
    if (!/^-?\d+(?:\.\d+)?$/.test(fields.send_order)) fail(`send_order "${fields.send_order}" must be a number`);
    sendOrder = Number(fields.send_order);
  }
  let replyToId = null;
  if (fields.reply_to_id !== undefined) {
    replyToId = fields.reply_to_id;
    if (!ID.test(replyToId)) fail(`reply_to_id "${replyToId}" must be a two-digit id`);
    if (replyToId === id) fail('reply_to_id cannot point at the email itself');
  }
  const body = lines.slice(end + 1).join('\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
  if (!body) fail('body is empty');
  return { id, sender, subject, sendOrder, replyToId, body, file };
}

// Sort by send_order, then id. Checks ids are unique and every reply_to_id points
// at an email earlier in that order. Collects all problems before throwing.
export function orderEmails(emails) {
  const problems = [];
  const seen = new Map();
  for (const e of emails) {
    if (seen.has(e.id)) problems.push(`${e.file}: duplicate id ${e.id} (also in ${seen.get(e.id).file})`);
    else seen.set(e.id, e);
  }
  const ordered = [...emails].sort((a, b) => a.sendOrder - b.sendOrder || a.id.localeCompare(b.id));
  const position = new Map(ordered.map((e, i) => [e.id, i]));
  ordered.forEach((e, i) => {
    if (e.replyToId === null) return;
    if (!seen.has(e.replyToId)) problems.push(`${e.file}: reply_to_id ${e.replyToId} is not an email in this inbox`);
    else if (position.get(e.replyToId) >= i) problems.push(`${e.file}: reply_to_id ${e.replyToId} is not sent before email ${e.id}`);
  });
  if (problems.length) throw new StudyError(problems.join('\n'));
  return ordered;
}

export async function loadInbox(dir) {
  let names;
  try { names = await readdir(dir); }
  catch (e) {
    if (e.code === 'ENOENT') throw new StudyError('the inbox email folder does not exist yet');
    throw new StudyError(`cannot read the inbox email folder (${e.code ?? 'error'})`);
  }
  const files = names.filter((n) => n.toLowerCase().endsWith('.md')).sort();
  if (!files.length) throw new StudyError('the inbox email folder has no .md email files');
  const emails = [];
  const problems = [];
  for (const name of files) {
    try { emails.push(parseEmailFile(await readFile(join(dir, name), 'utf8'), name)); }
    catch (e) { if (e instanceof StudyError) problems.push(e.message); else throw e; }
  }
  if (problems.length) throw new StudyError(problems.join('\n'));
  return orderEmails(emails);
}

// Builds the ordered plan for this run. `only` is null or a list of ids.
// Each step: { email, action: 'send'|'by-hand', subject, reply }
// reply: null or { id, threaded, note }.
export function buildPlan(ordered, only = null) {
  const byId = new Map(ordered.map((e) => [e.id, e]));
  if (only) {
    const unknown = only.filter((id) => !byId.has(id));
    if (unknown.length) throw new StudyError(`--only lists ids that are not in this inbox: ${unknown.join(', ')}`);
  }
  const selected = new Set(only ?? ordered.map((e) => e.id));
  const steps = [];
  for (const email of ordered) {
    if (!selected.has(email.id)) continue;
    const action = email.sender === TEST_SENDER ? 'send' : 'by-hand';
    let reply = null;
    if (email.replyToId) {
      const parent = byId.get(email.replyToId);
      if (action === 'by-hand') reply = { id: parent.id, threaded: false, note: `reply to ${parent.id} in its Gmail thread` };
      else if (parent.sender !== TEST_SENDER) reply = { id: parent.id, threaded: false, note: `new message; ${parent.id} is sent by hand` };
      else if (!selected.has(parent.id)) reply = { id: parent.id, threaded: false, note: `new message; ${parent.id} is not in this run` };
      else reply = { id: parent.id, threaded: true, note: `threaded reply to ${parent.id}` };
    }
    steps.push({ email, action, subject: email.replyToId ? replySubject(email.subject) : email.subject, reply });
  }
  return steps;
}
