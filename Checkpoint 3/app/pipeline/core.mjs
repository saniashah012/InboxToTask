// Runtime-independent logic: no env/file access, credentials, database, or SDK.
import schema from '../prompts/extraction.schema.mjs';

export class PipelineError extends Error {
  constructor(code) { super(code); this.name = 'PipelineError'; this.code = code; }
}
const fail = (code) => { throw new PipelineError(code); };
const norm = (value) => value.replace(/\s+/g, ' ').trim();
const bounded = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
export function address(value) {
  if (typeof value !== 'string') fail('INVALID_ADDRESS');
  const email = (value.match(/<([^<>]+)>/)?.[1] ?? value).trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) fail('INVALID_ADDRESS');
  return email;
}
function validTimeZone(zone) {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
}
function validTimestamp(s) {
  return typeof s === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s));
}
function validateMessage(m) {
  if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !/^[\w.-]{1,100}$/.test(m.id)
    || typeof m.subject !== 'string' || m.subject.length > 1000 || typeof m.body !== 'string'
    || !validTimestamp(m.sentAt) || !Array.isArray(m.labels)
    || !m.labels.every((l) => typeof l === 'string' && l.length <= 100)) fail('INVALID_MESSAGE');
  address(m.from);
}
function validateRules(rules) {
  for (const group of ['allow', 'block']) {
    const r = rules?.[group];
    if (!r || typeof r !== 'object') fail('INVALID_RULES');
    for (const field of ['senders', 'domains', 'labels', 'keywords', 'subjectKeywords']) {
      if (!Object.hasOwn(r, field) && ['labels', 'keywords', 'subjectKeywords'].includes(field)) continue;
      if (!Array.isArray(r[field]) || r[field].length > 200 || !r[field].every((s) => typeof s === 'string' && s.trim() && s.length <= 254 && !/[\x00-\x1f\x7f]/.test(s))) fail('INVALID_RULES');
    }
    r.senders.forEach(address);
    if (!r.domains.every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d.trim()))) fail('INVALID_RULES');
  }
}
export function filterMessage(message, rules) {
  const sender = address(message.from), domain = sender.split('@')[1];
  // Legacy mailbox tags never grant permission; legacy subject blocks stay subject-only.
  const contains = (values, fields) => (values ?? []).some((value) =>
    fields.some((field) => field.toLowerCase().includes(value.trim().toLowerCase())));
  const matches = (r) => r.senders.some((s) => address(s) === sender)
    || r.domains.some((d) => d.trim().toLowerCase() === domain)
    || contains(r.keywords, [message.subject, sender, domain]);
  if (matches(rules.block) || contains(rules.block.subjectKeywords, [message.subject])) return 'EXCLUDED';
  if (![...rules.allow.senders, ...rules.allow.domains, ...(rules.allow.keywords ?? [])].length) return 'NO_ALLOWLIST';
  return matches(rules.allow) ? 'PERMITTED' : 'NOT_ALLOWED';
}
export function cleanBody(body) {
  // Conservative plain-text cleanup, NOT a sensitive-content classifier or HTML parser.
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const kept = [];
  let removed = false;
  for (const line of lines) {
    if (/^\s*(On .+wrote:|-----Original Message-----|Begin forwarded message:|--\s*)$/i.test(line)) { removed = true; break; }
    if (/^\s*>/.test(line)) { removed = true; continue; }
    kept.push(line);
  }
  return { body: kept.join('\n').trim(), removed };
}
export function prepareInput(input, defaults) {
  if (!input?.user || !validTimeZone(input.user.timeZone) || !validTimestamp(input.analysisTime)) fail('INVALID_INPUT');
  const email = address(input.user.email);
  validateRules(input.rules);
  const m = input.message;
  validateMessage(m);
  const limits = { ...defaults, ...input.contextLimits };
  if (!bounded(limits.maxMessages, 0, 10) || !bounded(limits.maxAgeDays, 1, 90)
    || !bounded(limits.maxMessageChars, 100, 30000) || !bounded(limits.maxTotalChars, 100, 60000)) fail('INVALID_LIMITS');
  const decision = filterMessage(m, input.rules);
  if (decision !== 'PERMITTED') return { status: 'skipped', messageId: m.id, reason: decision };
  if (Date.parse(m.sentAt) > Date.parse(input.analysisTime)) fail('FUTURE_MESSAGE');
  if (!Array.isArray(input.threadContext) || input.threadContext.length > 100) fail('INVALID_CONTEXT');
  const warnings = [];
  const current = cleanBody(m.body);
  if (current.removed) warnings.push('Quoted history/signature removed; permitted originals must supply context.');
  if (!current.body || current.body.length > limits.maxMessageChars || current.body.length > limits.maxTotalChars) {
    return { status: 'needs_review', messageId: m.id, reason: 'CURRENT_BODY_EMPTY_OR_TOO_LARGE' };
  }
  const view = (x, body) => ({ id: x.id, from: x.from, sentAt: x.sentAt,
    sentAtPrecision: x.sentAtPrecision ?? 'minute', subject: x.subject, body });
  const ids = new Set([m.id]);
  const candidates = [];
  for (const c of input.threadContext) {
    validateMessage(c);
    if (ids.has(c.id) || !m.threadId || c.threadId !== m.threadId) fail('INVALID_CONTEXT_ID_OR_THREAD');
    ids.add(c.id);
    if (filterMessage(c, input.rules) !== 'PERMITTED') { warnings.push('Some context excluded by privacy rules.'); continue; }
    const age = Date.parse(m.sentAt) - Date.parse(c.sentAt);
    if (age < 0 || age > limits.maxAgeDays * 86400000) { warnings.push('Some context outside permitted time range.'); continue; }
    candidates.push(c);
  }
  let used = current.body.length;
  const context = [];
  for (const c of candidates.sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))) {
    const cleaned = cleanBody(c.body);
    if (context.length >= limits.maxMessages || !cleaned.body || cleaned.body.length > limits.maxMessageChars || used + cleaned.body.length > limits.maxTotalChars) {
      warnings.push('Some context omitted by size/message limits.'); continue;
    }
    if (cleaned.removed) warnings.push('Quoted history/signature removed from earlier context.');
    if (c.sentAtPrecision === 'date') warnings.push('An earlier message has date-only timing; midnight is a fixture placeholder, not a known sent time.');
    context.push(view(c, cleaned.body)); used += cleaned.body.length;
  }
  context.reverse();
  return { status: 'prepared', messageId: m.id, payload: {
    user: { email, timeZone: input.user.timeZone }, analysisTime: input.analysisTime,
    currentMessage: view(m, current.body), threadContext: context,
    contextWarnings: [...new Set(warnings)],
  }, inputChars: used };
}

// Validator for exactly the JSON Schema subset used by extraction.schema.mjs.
export function validateSchema(value, spec = schema) {
  function check(v, s) {
    const kind = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.includes(kind) && !(kind === 'number' && types.includes('integer') && Number.isInteger(v))) fail('INVALID_OUTPUT_SCHEMA');
    if (v === null) return;
    if (s.enum && !s.enum.includes(v)) fail('INVALID_OUTPUT_SCHEMA');
    if (kind === 'string' && ((s.minLength && v.trim().length < s.minLength) || v.length > (s.maxLength ?? Infinity) || (s.pattern && !new RegExp(s.pattern).test(v)))) fail('INVALID_OUTPUT_SCHEMA');
    if (kind === 'number' && (!Number.isFinite(v) || v < (s.minimum ?? -Infinity) || v > (s.maximum ?? Infinity))) fail('INVALID_OUTPUT_SCHEMA');
    if (kind === 'array') { if (v.length > s.maxItems) fail('INVALID_OUTPUT_SCHEMA'); v.forEach((x) => check(x, s.items)); }
    if (kind === 'object') {
      if (s.required.some((key) => !Object.hasOwn(v, key)) || Object.keys(v).some((key) => !Object.hasOwn(s.properties, key))) fail('INVALID_OUTPUT_SCHEMA');
      for (const [key, property] of Object.entries(s.properties)) check(v[key], property);
    }
  }
  check(value, spec); return value;
}
function validateDeadline(d) {
  if (!d) return;
  if (!validTimeZone(d.timeZone) || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) fail('INVALID_DEADLINE');
  const parsed = new Date(`${d.date}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== d.date) fail('INVALID_DEADLINE');
}
function pastDeadline(d, analysisTime) {
  if (!d) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: d.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(analysisTime)).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return date > d.date || (date === d.date && d.time !== null && `${parts.hour}:${parts.minute}` > d.time);
}
export function validateExtraction(value, payload) {
  validateSchema(value);
  const sources = new Map([payload.currentMessage, ...payload.threadContext].map((m) => [m.id, m]));
  const verifyEvidence = (e) => {
    if (!sources.has(e.messageId) || !norm(sources.get(e.messageId).body).includes(norm(e.quote))) fail('UNGROUNDED_EVIDENCE');
  };
  verifyEvidence(value.evidence);
  if (value.evidence.messageId !== payload.currentMessage.id) fail('WRONG_CLASSIFICATION_SOURCE');
  if ((value.category === 'Actionable') !== (value.tasks.length > 0)) fail('CATEGORY_TASK_MISMATCH');
  for (const t of value.tasks) {
    if (t.owner.toLowerCase() !== payload.user.email) fail('WRONG_TASK_OWNER');
    verifyEvidence(t.evidence); validateDeadline(t.deadline);
  }
  for (const w of value.waitingFor) { verifyEvidence(w.evidence); validateDeadline(w.promisedDeadline); }
  for (const f of value.suggestedFollowUps) {
    verifyEvidence(f.evidence);
    const w = value.waitingFor[f.waitingForIndex];
    if (value.category !== 'Passive' || !w || f.recipient !== w.owner || !pastDeadline(w.promisedDeadline, payload.analysisTime)) fail('UNSUPPORTED_FOLLOW_UP');
  }
  return value;
}
export async function extract(input, { settings, systemPrompt, generate }) {
  const prepared = prepareInput(input, settings.contextLimits);
  if (prepared.status !== 'prepared') return { ...prepared, modelCalls: 0 };
  const generated = await generate({ payload: prepared.payload, systemPrompt, settings, schema });
  let result;
  try { result = validateExtraction(generated.value, prepared.payload); }
  catch (error) { if (error instanceof PipelineError) error.usage = generated.usage; throw error; }
  // Preserve the model's bounded schema; backend warnings live in the envelope
  // so they cannot be omitted by the model or overflow its uncertainties array.
  return { status: 'extracted', messageId: prepared.messageId, modelCalls: generated.attempts ?? 1,
    returnedModelVersion: generated.modelVersion ?? null,
    contextWarnings: prepared.payload.contextWarnings,
    needsReview: prepared.payload.contextWarnings.length > 0 || result.uncertainties.length > 0 || result.tasks.some((t) => t.deadline === null),
    result, usage: generated.usage, latencyMs: generated.latencyMs };
}
