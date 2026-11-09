// Runtime-independent logic: no env/file access, credentials, database, or SDK.
import schema, { gmailSchema } from '../prompts/extraction.schema.mjs';

export class PipelineError extends Error {
  constructor(code) { super(code); this.name = 'PipelineError'; this.code = code; }
}
const fail = (code) => { throw new PipelineError(code); };
const norm = (value) => value.replace(/\s+/g, ' ').trim();
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v==='object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
const same = (a,b) => JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const bounded = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
export function address(value) {
  if (typeof value !== 'string') fail('INVALID_ADDRESS');
  // Quoted display names and comments never supply the address. Anything naming
  // more than one address grants nothing, because access rules test one sender.
  // An unquoted comma in a display name is common and harmless without a second address.
  const bare = value.replace(/"(?:[^"\\]|\\.)*"/g, ' ').replace(/\((?:[^()\\]|\\.)*\)/g, ' ');
  const angle = bare.match(/<[^<>]*>/g) ?? [];
  const outside = bare.replace(/<[^<>]*>/g, '');
  if (angle.length > 1 || /[<>]/.test(outside) || (angle.length && outside.includes('@'))) fail('INVALID_ADDRESS');
  const email = (angle[0]?.slice(1, -1) ?? bare).trim().toLowerCase();
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
  if (['allow','block'].some(g => ['keywords','labels'].some(f => rules[g][f]?.length) || (g === 'allow' && rules[g].subjectKeywords?.length))) return 'RULE_REVIEW_REQUIRED';
  const sender = address(message.from), domain = sender.split('@')[1];
  // Legacy mailbox tags never grant permission; legacy subject blocks stay subject-only.
  const contains = (values, fields) => (values ?? []).some((value) =>
    fields.some((field) => field.toLowerCase().includes(value.trim().toLowerCase())));
  const matches = (r) => r.senders.some((s) => address(s) === sender)
    || r.domains.some((d) => d.trim().toLowerCase() === domain);
  if (matches(rules.block) || contains(rules.block.subjectKeywords, [message.subject])) return 'EXCLUDED';
  if (![...rules.allow.senders, ...rules.allow.domains].length) return 'NO_ALLOWLIST';
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
export function semanticPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 2 || !Object.hasOwn(value,'include') || !Object.hasOwn(value,'exclude')) fail('INVALID_SEMANTIC_PREFERENCES');
  const result = {};
  for (const group of ['include','exclude']) {
    if (!Array.isArray(value[group]) || value[group].length > 200
      || !value[group].every(s => typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 254 && !/[\x00-\x1f\x7f]/.test(s))) fail('INVALID_SEMANTIC_PREFERENCES');
    result[group] = [...new Set(value[group].map(s=>s.trim().toLowerCase()))];
  }
  return result;
}
export function prepareInput(input, defaults) {
  if (!input?.user || !validTimeZone(input.user.timeZone) || !validTimestamp(input.analysisTime)) fail('INVALID_INPUT');
  const email = address(input.user.email);
  validateRules(input.rules);
  const semantic = input.semanticPreferences === undefined ? null : semanticPreferences(input.semanticPreferences);
  const gmail = input.contract === 'gmail-v1';
  if (input.contract !== undefined && !gmail) fail('INVALID_CONTRACT');
  const existing = gmail ? input.existingTaskContext : null;
  if (gmail && (!Array.isArray(existing) || existing.length>10 || JSON.stringify(existing).length>12000
    || existing.some(t=>!t || !/^[0-9a-f-]{36}$/i.test(t.id) || !Number.isSafeInteger(t.revision) || t.revision<0
      || !t.acceptedFields || !Array.isArray(t.sourceMessageIds)))) fail('INVALID_TASK_CONTEXT');
  const m = input.message;
  validateMessage(m);
  const limits = { ...defaults, ...input.contextLimits };
  if (!bounded(limits.maxMessages, 0, 10) || !bounded(limits.maxAgeDays, 1, 365)
    || !bounded(limits.maxMessageChars, 100, 30000) || !bounded(limits.maxTotalChars, 100, 60000)) fail('INVALID_LIMITS');
  const decision = filterMessage(m, input.rules);
  if (decision !== 'PERMITTED') return { status: 'skipped', messageId: m.id, reason: decision };
  if (Date.parse(m.sentAt) > Date.parse(input.analysisTime)) fail('FUTURE_MESSAGE');
  if (!Array.isArray(input.threadContext) || input.threadContext.length > 100) fail('INVALID_CONTEXT');
  const warnings = [];
  if (gmail && input.retrievalWarnings!==undefined) {
    if(!Array.isArray(input.retrievalWarnings)||input.retrievalWarnings.length>10||!input.retrievalWarnings.every(w=>typeof w==='string'&&w.length<=250))fail('INVALID_CONTEXT_WARNINGS');
    warnings.push(...input.retrievalWarnings);
  }
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
    ...(gmail ? { contract:'gmail-v1',existingTaskContext:existing } : {}),
    ...(semantic ? { semanticPreferences: semantic } : {}),
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
  const gmail=payload.contract==='gmail-v1';
  validateSchema(value,gmail?gmailSchema:schema);
  const sources = new Map([payload.currentMessage, ...payload.threadContext].map((m) => [m.id, m]));
  const verifyEvidence = (e) => {
    if (!sources.has(e.messageId) || !norm(sources.get(e.messageId).body).includes(norm(e.quote))) fail('UNGROUNDED_EVIDENCE');
  };
  verifyEvidence(value.evidence);
  if (value.evidence.messageId !== payload.currentMessage.id) fail('WRONG_CLASSIFICATION_SOURCE');
  // An edit with no identified target may or may not leave the owner an obligation,
  // so it permits either category. A new task or a targeted edit requires Actionable.
  const requiresActionable = value.tasks.length > 0 || (gmail && value.taskChanges.some(c=>c.kind==='edit'&&c.targetTaskId!==null));
  const permitsActionable = requiresActionable || (gmail && value.taskChanges.some(c=>c.kind==='edit'));
  if (value.category === 'Actionable' ? !permitsActionable : requiresActionable) fail('CATEGORY_TASK_MISMATCH');
  if (gmail) {
    const seen=new Set();
    for (const change of value.taskChanges) {
      verifyEvidence(change.evidence);
      if (change.evidence.messageId!==payload.currentMessage.id) fail('WRONG_CHANGE_SOURCE');
      if ((change.targetTaskId===null)!==(change.expectedRevision===null)) fail('INVALID_CHANGE_TARGET');
      if (new Set(change.changedFields).size!==change.changedFields.length) fail('INVALID_CHANGE_FIELDS');
      if (change.kind==='cancel' && (change.fields!==null || change.changedFields.length)) fail('INVALID_CHANGE_FIELDS');
      // Complete proposed values need a target to copy from. Without one, a review item
      // can state what seems to have changed while leaving the values empty.
      if (change.kind==='edit' && !change.changedFields.length) fail('INVALID_CHANGE_FIELDS');
      if (change.kind==='edit' && change.targetTaskId!==null && !change.fields) fail('INVALID_CHANGE_FIELDS');
      if (change.fields) validateDeadline(change.fields.deadline);
      if (change.targetTaskId!==null) {
        const target=payload.existingTaskContext.find(t=>t.id===change.targetTaskId && t.revision===change.expectedRevision);
        if (!target || seen.has(target.id)) fail('INVALID_CHANGE_TARGET');
        seen.add(target.id);
        if (change.fields) for (const key of ['action','requirements','condition','deadline']) {
          if (!change.changedFields.includes(key) && !same(change.fields[key],target.acceptedFields[key])) fail('OVERWRITTEN_USER_EDIT');
        }
      }
    }
    const prefs=payload.semanticPreferences;
    if (prefs && !prefs.include.length && !prefs.exclude.length && (value.topicRelevance.decision!=='relevant'
      || [...value.tasks,...value.waitingFor,...value.suggestedFollowUps,...value.taskChanges].some(i=>i.topicRelevance!=='relevant'))) fail('INVALID_TOPIC_RELEVANCE');
  }
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
// Deterministic checks on validated suggestions, independent of the model. They only
// add review warnings; they never remove or rewrite what the model extracted.
const CONTENT_CHECKS = [
  [/(?:\bhttps?:\/\/|\bwww\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/\S*/i,
    'A suggestion contains a web link. Compare it with the original email before opening it.'],
  [/\b(?:pass(?:word|code|phrase)s?|credentials?|verification codes?|one[- ]time (?:codes?|passwords?)|security codes?|2fa|mfa|two[- ]factor|verify (?:your )?(?:account|identity|login)|social security|ssn)\b/i,
    'A suggestion mentions passwords, codes or account verification. Confirm the request with the sender another way before acting.'],
  [/\b(?:gift ?cards?|wire (?:transfer|the|money|funds|payment)|bank (?:account|details|transfer|information)|routing numbers?|account numbers?|card (?:numbers?|details)|credit cards?|debit cards?|bitcoin|crypto(?:currency)?|zelle|venmo|cash ?app|western union|moneygram|payment details)\b/i,
    'A suggestion mentions payments, gift cards or bank details. Confirm the request with the sender another way before acting.'],
];
export function contentWarnings(result) {
  const strings = [];
  const collect = v => { if (typeof v === 'string') strings.push(v); else if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') Object.values(v).forEach(collect); };
  collect([result.summary, result.tasks, result.waitingFor, result.suggestedFollowUps, result.taskChanges ?? []]);
  return CONTENT_CHECKS.filter(([pattern]) => strings.some(s => pattern.test(s))).map(([, warning]) => warning);
}
export async function extract(input, { settings, systemPrompt, generate }) {
  const prepared = prepareInput(input, settings.contextLimits);
  if (prepared.status !== 'prepared') return { ...prepared, modelCalls: 0 };
  const effectiveSchema=prepared.payload.contract==='gmail-v1'?gmailSchema:schema;
  if (JSON.stringify(prepared.payload).length+systemPrompt.length+JSON.stringify(effectiveSchema).length>60000) fail('MODEL_INPUT_TOO_LARGE');
  const generated = await generate({ payload: prepared.payload, systemPrompt, settings, schema:effectiveSchema });
  let result;
  try { result = validateExtraction(generated.value, prepared.payload); }
  catch (error) { if (error instanceof PipelineError) error.usage = generated.usage; throw error; }
  // Preserve the model's bounded schema; backend warnings live in the envelope
  // so they cannot be omitted by the model or overflow its uncertainties array.
  const warnings = [...prepared.payload.contextWarnings, ...contentWarnings(result)];
  return { status: 'extracted', messageId: prepared.messageId, modelCalls: generated.attempts ?? 1,
    ...(input.contract==='gmail-v1'?{contract:'gmail-v1'}:{}),
    returnedModelVersion: generated.modelVersion ?? null,
    contextWarnings: warnings,
    needsReview: warnings.length > 0 || result.uncertainties.length > 0 || result.tasks.some((t) => t.deadline === null)
      || (result.topicRelevance?.decision==='uncertain') || result.taskChanges?.some(c=>c.targetTaskId===null) === true,
    result, usage: generated.usage, latencyMs: generated.latencyMs };
}
