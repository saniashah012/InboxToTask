// Runtime-independent logic: no env/file access, credentials, database, or SDK.
import schema, { gmailSchema } from '../prompts/extraction.schema.mjs';
import { blockedTerms, containsBlockedWord, defaultTopicWords, defaultWords, MAX_WORDS_PER_TOPIC, requiredTerms, storedWord, textValues, validWord } from './private-topics.mjs';
import { holidayDayFromSent } from './holidays.mjs';

// Generic on purpose: it reaches the model and saved warnings, so it never names a topic or word.
export const PRIVATE_CONTEXT_WARNING = 'Some thread history was excluded by your settings.';
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
// With no permitted sender or domain, `anySender` (set when a topic to check is
// saved) lets any sender that is not blocked through; the topic words then decide.
export function filterMessage(message, rules, anySender = false) {
  if (['allow','block'].some(g => ['keywords','labels'].some(f => rules[g][f]?.length) || (g === 'allow' && rules[g].subjectKeywords?.length))) return 'RULE_REVIEW_REQUIRED';
  const sender = address(message.from), domain = sender.split('@')[1];
  // Legacy mailbox tags never grant permission; legacy subject blocks stay subject-only.
  const contains = (values, fields) => (values ?? []).some((value) =>
    fields.some((field) => field.toLowerCase().includes(value.trim().toLowerCase())));
  const matches = (r) => r.senders.some((s) => address(s) === sender)
    || r.domains.some((d) => d.trim().toLowerCase() === domain);
  if (matches(rules.block) || contains(rules.block.subjectKeywords, [message.subject])) return 'EXCLUDED';
  if (![...rules.allow.senders, ...rules.allow.domains].length) return anySender ? 'PERMITTED' : 'NO_ALLOWLIST';
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
// Topics of interest go to the model. Excluded topics never do: each one is a
// list of literal words checked in backend code before any model call. A saved
// value without blockedWords (older clients and fixtures) gets each topic's
// starter list, or the topic name itself, so it errs toward blocking more.
export function semanticPreferences(value) {
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
  if (!keys.length || !keys.every(k => ['include','exclude','blockedWords','includeWords'].includes(k))
    || !Object.hasOwn(value,'include') || !Object.hasOwn(value,'exclude')) fail('INVALID_SEMANTIC_PREFERENCES');
  const result = {};
  for (const group of ['include','exclude']) {
    if (!Array.isArray(value[group]) || value[group].length > 200
      || !value[group].every(s => typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 254 && !/[\x00-\x1f\x7f]/.test(s))) fail('INVALID_SEMANTIC_PREFERENCES');
    result[group] = [...new Set(value[group].map(s=>s.trim().toLowerCase()))];
  }
  const saved = value.blockedWords ?? {};
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) fail('INVALID_SEMANTIC_PREFERENCES');
  result.blockedWords = {};
  for (const topic of result.exclude) {
    const words = Object.hasOwn(saved, topic) ? saved[topic] : defaultWords(topic);
    if (!Array.isArray(words) || !words.length || words.length > MAX_WORDS_PER_TOPIC || !words.every(validWord)) fail('INVALID_SEMANTIC_PREFERENCES');
    result.blockedWords[topic] = [...new Set(words.map(storedWord))];
  }
  const savedInclude = value.includeWords ?? {};
  if (!savedInclude || typeof savedInclude !== 'object' || Array.isArray(savedInclude)) fail('INVALID_SEMANTIC_PREFERENCES');
  result.includeWords = {};
  for (const topic of result.include) {
    const words = Object.hasOwn(savedInclude, topic) ? savedInclude[topic] : defaultTopicWords(topic);
    if (!Array.isArray(words) || !words.length || words.length > MAX_WORDS_PER_TOPIC || !words.every(validWord)) fail('INVALID_SEMANTIC_PREFERENCES');
    result.includeWords[topic] = [...new Set(words.map(storedWord))];
  }
  try { result.terms = blockedTerms(result); result.requiredTerms = requiredTerms(result); } catch { fail('INVALID_SEMANTIC_PREFERENCES'); }
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
  // Topics to check stand in for a sender allowlist only when none is saved.
  const anySender = !!semantic?.requiredTerms?.length;
  const decision = filterMessage(m, input.rules, anySender);
  if (decision !== 'PERMITTED') return { status: 'skipped', messageId: m.id, reason: decision };
  // Retrieval already checked this; repeating it here keeps every model path behind it.
  const terms = semantic?.terms ?? [];
  if (containsBlockedWord([m.subject, m.body], terms)) return { status: 'skipped', messageId: m.id, reason: 'PRIVATE_TOPIC' };
  // With topics to check saved, the email must use at least one of their words.
  const required = semantic?.requiredTerms ?? [];
  if (required.length && !containsBlockedWord([m.subject, m.body], required)) return { status: 'skipped', messageId: m.id, reason: 'NO_TOPIC_WORD' };
  // Accepted task values can repeat words from their source email.
  const taskContext = existing && existing.filter(t => !containsBlockedWord(textValues(t.acceptedFields), terms));
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
    if (filterMessage(c, input.rules, anySender) !== 'PERMITTED') { warnings.push('Some context excluded by privacy rules.'); continue; }
    if (containsBlockedWord([c.subject, c.body], terms)) { warnings.push(PRIVATE_CONTEXT_WARNING); continue; }
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
    ...(gmail ? { contract:'gmail-v1',existingTaskContext:taskContext } : {}),
    // Only topics of interest reach the model; excluded topics and their words never do.
    ...(semantic ? { semanticPreferences: { include: semantic.include } } : {}),
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
// Details offered for a task the user may create from a Passive email. Whatever the
// current message does not state word for word is dropped, not repaired: a date's
// wording, the location and each link must appear in its body. A dropped entry only
// leaves a field empty for the user to fill, so it never fails the whole extraction.
//
// A relative day is counted from the day the email was SENT, never from the day it was
// analysed. That rule is fixed, so code applies it instead of trusting the model: when a
// date's wording is only a relative day ("Thursday", "next Friday", "tomorrow"), the date
// is recomputed from the sent date in that entry's time zone. A weekday means the first
// such day on or after the sent day, the sent day included; "next <weekday>" skips the
// sent day (on any other day it is simply the coming one). "Tomorrow" is the sent day + 1;
// "today" and "tonight" are the sent day.
//
// The rule applies only to wording that is NOTHING but one relative day, optionally with
// "this"/"next" before a weekday, one clock time, and the connecting words below. This is
// a whitelist on purpose: anything else ("the Friday after Thanksgiving", "two weeks from
// Friday", "last Friday", a month or a day number) returns null and the model's date is
// kept, because a wrong correction is worse than none. (A few fixed holiday phrases are
// counted separately, in holidays.mjs.) Even whitelisted wording is not corrected when
// the email sets another week next to it ("Next week's schedule: quiz Thursday"), or
// when no supplied email, or more than one, contains it (see validateExtraction).
// Whenever code and the model disagree, the user sees a note (see countedFromSent).
// Abbreviations: tue/tues, thu/thur/thurs and fri are accepted; they are not ordinary
// words. mon, wed, sat and sun are NOT: "wed" (married), "sat" (the verb, or the SAT
// exam) and "sun" are ordinary words, and "mon" is left out with them for consistency.
const RELATIVE_WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6 };
const RELATIVE_OFFSETS = { today: 0, tonight: 0, tomorrow: 1 };
// A part of day does not change the date.
const RELATIVE_FILLER = new Set(['by', 'before', 'on', 'at', 'due', 'until', 'the', 'is', 'are', 'starts', 'from',
  'eod', 'morning', 'afternoon', 'evening', 'night']);
// One clock time: 3:30 PM, 3:30PM, 3 pm, 15:30, noon, midnight ("p.m." is normalised first).
const CLOCK_TIME = /(?<![a-z0-9:])(?:(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s?[ap]m|(?:[01]?\d|2[0-3]):[0-5]\d|noon|midnight)(?![a-z0-9:])/g;
export function relativeDayFromSent(wording, sentAt, timeZone) {
  if (typeof wording !== 'string') return null;
  let text = wording.toLowerCase().replace(/(?<![a-z])([ap])\.\s?m\.?(?![a-z])/g, '$1m');
  if ((text.match(CLOCK_TIME) ?? []).length > 1) return null;
  text = text.replace(CLOCK_TIME, ' ').replace(/\bno later than\b|\bend of (?:the )?day\b/g, ' ');
  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
  let found = null, next = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (RELATIVE_FILLER.has(t)) continue;
    // "this"/"next" only directly before a weekday; "this" changes nothing.
    if ((t === 'this' || t === 'next') && Object.hasOwn(RELATIVE_WEEKDAYS, tokens[i + 1] ?? '')) continue;
    if (found === null && (Object.hasOwn(RELATIVE_WEEKDAYS, t) || Object.hasOwn(RELATIVE_OFFSETS, t))) {
      found = t; next = tokens[i - 1] === 'next'; continue;
    }
    return null; // any other word, a number, or a second day
  }
  if (found === null) return null;
  const sent = new Date(sentAt);
  if (!Number.isFinite(sent.valueOf()) || !validTimeZone(timeZone)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(sent).map((p) => [p.type, p.value]));
  const day = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  const plus = (n) => new Date(day.valueOf() + n * 86400000).toISOString().slice(0, 10);
  if (Object.hasOwn(RELATIVE_OFFSETS, found)) return plus(RELATIVE_OFFSETS[found]);
  let ahead = (RELATIVE_WEEKDAYS[found] - day.getUTCDay() + 7) % 7;
  if (ahead === 0 && next) ahead = 7;
  return plus(ahead);
}
// Where a date's wording sits in an email. Bodies and wording are compared with runs of
// whitespace collapsed and letter case ignored, as grounding does; `at` maps each
// character of the flattened text back to its index in the original.
function flatten(text) {
  let s = '', space = false;
  const at = [];
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) { space = s.length > 0; continue; }
    if (space) { s += ' '; at.push(i); space = false; }
    for (const c of text[i].toLowerCase()) { s += c; at.push(i); }
  }
  return { s, at };
}
function occurrences(hay, needle) {
  const found = [];
  if (!needle) return found;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) found.push(i);
  return found;
}
const states = (body, wording) => typeof wording === 'string' && occurrences(flatten(body).s, flatten(wording).s).length > 0;
// Sentences end at . ! or ? followed by a space or the end of a line, and at every line
// break ("3.30" and "example.org/a.b" do not end one). A line ending in a colon heads
// the lines under it until a blank line: "Next week's schedule:" then "Quiz Thursday".
function sentencesOf(text) {
  const out = [];
  let offset = 0, header = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) header = null;
    else {
      const ends = [...line.matchAll(/[.!?](?=\s|$)/g)].map((m) => m.index + 1);
      if (!ends.length || ends.at(-1) < line.length) ends.push(line.length);
      let from = 0;
      for (const end of ends) {
        if (line.slice(from, end).trim()) out.push({ from: offset + from, to: offset + end, header });
        from = end;
      }
      if (/:\s*$/.test(line)) header = line;
    }
    offset += line.length + 1;
  }
  return out;
}
// Wording that moves a plain weekday into another week. "next <weekday>" is not one of
// them; the date's own wording is cut out of the window before these are tested.
const WEEK_CUES = [
  /\bnext\s+(?:week|weekend|month)\b/i,
  /\b(?:the\s+)?following\s+week\b/i,
  /\bthe\s+week\s+(?:after|before)\b/i,
  /\bweek\s+of\b/i,
  /\bupcoming\s+week\b/i,
  /\blater\s+this\s+month\b/i,
  /\b(?:\d+|one|two|three|four|five|six|several|a\s+few|(?:a\s+)?couple(?:\s+of)?)\s+weeks?\b/i,
  /\b(?:in\s+a\s+week|a\s+week\s+(?:from|after|later))\b/i,
  /\bafter\s+(?:the\s+)?(?:break|holidays?|thanksgiving|christmas|easter|halloween|new\s+year'?s?|labor\s+day|memorial\s+day|(?:spring|fall|winter|thanksgiving)\s+break|midterms?|finals?)\b/i,
];
function weekCue(window) {
  const text = window.replace(/\s+/g, ' ');
  if (WEEK_CUES.some((cue) => cue.test(text))) return true;
  // "after Thanksgiving", "after Spring Break", "after November 20": "after" and then a
  // capitalised word that is not a weekday ("after Friday's class" stays in the week).
  return [...text.matchAll(/\b[Aa]fter\s+(?:the\s+)?([A-Z][A-Za-z'’]*)/g)]
    .some((m) => !Object.hasOwn(RELATIVE_WEEKDAYS, m[1].toLowerCase().replace(/['’]s$/, '')) && m[1] !== 'I');
}
// True when the sentence holding the wording, the sentence before it or its colon heading
// sets another week. When the wording appears more than once, the occurrence inside the
// item's evidence quote decides if exactly one is; otherwise any occurrence with a cue
// counts, since keeping the model's date is the safer side. Null if the wording is absent.
function weekCueNear(body, wording, quote) {
  const text = body.replace(/\r\n?/g, '\n');
  const flat = flatten(text), needle = flatten(wording).s;
  let starts = occurrences(flat.s, needle);
  if (!starts.length) return null;
  if (starts.length > 1 && typeof quote === 'string') {
    const q = flatten(quote).s;
    const spans = occurrences(flat.s, q);
    const inside = starts.filter((w) => spans.some((s) => w >= s && w + needle.length <= s + q.length));
    if (inside.length === 1) starts = inside;
  }
  const sentences = sentencesOf(text);
  return starts.some((w) => {
    const from = flat.at[w], to = flat.at[w + needle.length - 1] + 1;
    const first = sentences.findIndex((s) => s.to > from);
    if (first < 0) return weekCue(text);
    let last = first;
    while (last + 1 < sentences.length && sentences[last + 1].from < to) last++;
    const start = sentences[first > 0 ? first - 1 : first].from;
    return weekCue(`${sentences[first].header ?? ''} | ${text.slice(start, from)} | ${text.slice(to, sentences[last].to)}`);
  });
}
// Notes the user sees when code and the model disagree about a date. They quote only the
// date's wording, which the user already sees as the deadline's wording.
const noteDate = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US',
  { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const noteWording = (wording) => { const w = norm(wording); return w.length > 80 ? `${w.slice(0, 77).trimEnd()}...` : w; };
const DATE_NOTES = {
  corrected: (w, was, now) => `The email says "${w}". That was read as ${was}; counted from the day it was sent, it is ${now}. Check the date.`,
  // Both dates are named so the review screen can offer each as a one-click choice.
  context: (w, was, now) => `The email says "${w}" near wording about another week. The date was left as ${was}; counted from the day it was sent, it would be ${now}. Check the date.`,
  twoWeeks: (w, was, now) => `The email says "${w}", which can mean either of two weeks. It was set to ${now}. Check the date.`,
  holiday: (w, was, now) => `The email says "${w}". That was read as ${was}; by the calendar it is ${now}. Check the date.`,
  // The wording is not in one identifiable email (a paraphrase, or several emails say
  // it), so code cannot tell which sent day to count from. Unsure means the user decides.
  unplaced: (w, was, now) => `The date wording "${w}" could not be matched to one email. The date was left as ${was}; counted from the day this email was sent, it would be ${now}. Check the date.`,
};
// What the sent-day or holiday rule alone would give for this wording from this message.
function plainFromSent(d, message) {
  const datePrecision = message.sentAtPrecision === 'date';
  const sentAt = datePrecision ? `${message.sentAt.slice(0, 10)}T12:00:00Z` : message.sentAt;
  const zone = datePrecision ? 'UTC' : d.timeZone;
  return relativeDayFromSent(d.wording, sentAt, zone) ?? holidayDayFromSent(d.wording, sentAt, zone);
}
function addNote(notes, kind, d, now) {
  const text = DATE_NOTES[kind](noteWording(d.wording), noteDate(d.date), now && noteDate(now));
  if (notes && !notes.includes(text)) notes.push(text);
}
const NEXT_WEEKDAY = new RegExp(`\\bnext\\s+(?:${Object.keys(RELATIVE_WEEKDAYS).join('|')})\\b`, 'i');
// The one place a model date is compared with the sent-day rule, for Passive details and
// Gmail deadlines alike. `message` is the email the wording was read from; the caller
// makes sure its body contains the wording. Only `date` ever changes; a null date (time
// only) or null deadline is returned as is. Every change, and every change declined
// because of nearby wording about another week, adds a note to `notes` (when given);
// a date the rule agrees with adds nothing. `quote` is the item's evidence quote in
// `message`, used only when the wording appears there more than once.
function countedFromSent(d, message, { notes = null, quote = null } = {}) {
  if (!d || d.date === null) return d;
  // A date-precision sent time is a midnight placeholder written with an offset
  // ("2026-10-03T00:00:00-05:00"). Converting it into a zone west of that offset would
  // move it to the previous day, so its written calendar date is used as the sent day.
  const datePrecision = message.sentAtPrecision === 'date';
  const sentAt = datePrecision ? `${message.sentAt.slice(0, 10)}T12:00:00Z` : message.sentAt;
  const zone = datePrecision ? 'UTC' : d.timeZone;
  let fromSent = relativeDayFromSent(d.wording, sentAt, zone);
  if (!fromSent) {
    // A few fixed phrases around a holiday ("by Thanksgiving") are counted by the
    // calendar from the sent day; nearby week wording does not apply to them.
    const holiday = holidayDayFromSent(d.wording, sentAt, zone);
    if (typeof holiday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(holiday) || holiday === d.date) return d;
    addNote(notes, 'holiday', d, holiday);
    return { ...d, date: holiday };
  }
  // A weekday named on that same weekday means the sent day only while the stated time
  // is still ahead: "Thursday at noon" in an email sent Thursday at 3 PM is the Thursday
  // after. Needs a known sent time and a stated time; "today"/"tonight" never move, and
  // midnight is left to the two readings handled below.
  if (!datePrecision && d.time && d.time !== '00:00' && !/\b(?:today|tonight|tomorrow)\b/i.test(d.wording)) {
    const at = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: d.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(message.sentAt)).map((p) => [p.type, p.value]));
    if (fromSent === `${at.year}-${at.month}-${at.day}` && d.time < `${at.hour}:${at.minute}`) {
      fromSent = new Date(Date.parse(`${fromSent}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    }
  }
  if (fromSent === d.date) return d;
  // "Thursday at midnight" is often read as the end of Thursday (Friday 00:00). Both
  // readings are kept; only a date that is neither is corrected.
  const dayAfter = new Date(Date.parse(`${fromSent}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (/\bmidnight\b/i.test(d.wording) && d.date === dayAfter) return d;
  // "Next week's schedule: quiz Thursday" means the Thursday of next week. When the email
  // sets another week nearby, the model's date is kept and the user is asked to check it.
  const cue = weekCueNear(message.body, d.wording, quote);
  if (cue === null) return d;
  if (cue) { addNote(notes, 'context', d, fromSent); return d; }
  // "next Friday" is read as either the coming Friday or the one after; the rule picks
  // the coming one, and the user is told the other reading exists.
  addNote(notes, NEXT_WEEKDAY.test(d.wording) ? 'twoWeeks' : 'corrected', d, fromSent);
  return { ...d, date: fromSent };
}
// `notes` (optional) collects the date notes described at countedFromSent.
export function groundDetails(value, payload, notes = null) {
  const empty = { title: null, dates: [], location: null, links: [] };
  if (value.category !== 'Passive') { value.details = empty; return value; }
  const body = norm(payload.currentMessage.body).toLowerCase();
  const stated = (text) => body.includes(norm(text).toLowerCase());
  const realDate = (date) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
  };
  // A link must be a whole link in the body, in the same letter case: the start of a
  // longer address, or one with a path in different case, is a different address.
  const bodyLinks = new Set(payload.currentMessage.body.split(/\s+/)
    .map((word) => word.replace(/^[(<\["']+/, '').replace(/[)>\].,;:!?"']+$/, '')));
  const d = value.details;
  value.details = {
    // A title is a short phrase. A longer one is dropped, and the form suggests its own.
    title: d.title === null || norm(d.title).length > 60 ? null : norm(d.title),
    dates: d.dates.filter((x) => (x.date !== null || x.time !== null) && validTimeZone(x.timeZone)
      && (x.date === null || realDate(x.date)) && stated(x.wording))
      // Details of an email outside the selected topics are emptied before saving, so
      // they add no notes.
      .map((x) => countedFromSent(x, payload.currentMessage, { notes: value.topicRelevance?.decision === 'irrelevant' ? null : notes })),
    location: d.location !== null && stated(d.location) ? norm(d.location) : null,
    links: [...new Set(d.links.map((link) => link.trim()))].filter((link) => /^https?:\/\/\S+$/i.test(link) && bodyLinks.has(link)),
  };
  return value;
}
// Returns the validated value. `notes` (optional) is an array that collects, once each,
// the user-facing date notes of the sent-day rule; extract() adds them to contextWarnings.
export function validateExtraction(value, payload, notes = null) {
  const gmail=payload.contract==='gmail-v1';
  validateSchema(value,gmail?gmailSchema:schema);
  if (gmail) groundDetails(value, payload, notes);
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
    if (prefs && !prefs.include.length && (value.topicRelevance.decision!=='relevant'
      || [...value.tasks,...value.waitingFor,...value.suggestedFollowUps,...value.taskChanges].some(i=>i.topicRelevance!=='relevant'))) fail('INVALID_TOPIC_RELEVANCE');
  }
  for (const t of value.tasks) {
    if (t.owner.toLowerCase() !== payload.user.email) fail('WRONG_TASK_OWNER');
    verifyEvidence(t.evidence); validateDeadline(t.deadline);
  }
  for (const w of value.waitingFor) { verifyEvidence(w.evidence); validateDeadline(w.promisedDeadline); }
  // Gmail deadlines follow the sent-day rule (see relativeDayFromSent); the fixture
  // contract is left exactly as the model returned it. This runs after every evidence,
  // deadline and change check above, so it can neither cause nor hide INVALID_DEADLINE
  // or OVERWRITTEN_USER_EDIT (only a deadline listed in changedFields is touched, and
  // that check compares only fields not listed). It runs BEFORE the follow-up check:
  // a follow-up is allowed only once the promise is past, and that must be judged on
  // the date the sender meant, not on a miscounted one.
  //
  // The date is counted from the email whose body contains its wording: the cited one if
  // it does, otherwise the only other supplied email that does. With none, or several
  // and not the cited one, the wording may be the model's paraphrase and the date is
  // left alone. A task change cites the current email and is counted only from it.
  // Items outside the selected topics are removed before saving, so they add no notes.
  if (gmail) {
    const messages = [payload.currentMessage, ...payload.threadContext];
    const fromSource = (item, d, citedOnly = false) => {
      if (!d || d.date === null) return d;
      const cited = sources.get(item.evidence.messageId);
      let source = states(cited.body, d.wording) ? cited : null;
      if (!source && !citedOnly) {
        const others = messages.filter((m) => m !== cited && states(m.body, d.wording));
        if (others.length === 1) source = others[0];
      }
      if (!source) {
        // Not corrected, but not silent either: when the rule would give another date
        // from the cited email, the user is told both and decides.
        const would = plainFromSent(d, cited);
        if (would && would !== d.date && item.topicRelevance !== 'irrelevant') addNote(notes, 'unplaced', d, would);
        return d;
      }
      return countedFromSent(d, source, { notes: item.topicRelevance === 'irrelevant' ? null : notes,
        quote: source === cited ? item.evidence.quote : null });
    };
    for (const t of value.tasks) t.deadline = fromSource(t, t.deadline);
    for (const w of value.waitingFor) w.promisedDeadline = fromSource(w, w.promisedDeadline);
    for (const c of value.taskChanges) {
      if (c.fields && c.changedFields.includes('deadline')) c.fields.deadline = fromSource(c, c.fields.deadline, true);
    }
  }
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
  const dateNotes = [];
  try { result = validateExtraction(generated.value, prepared.payload, dateNotes); }
  catch (error) { if (error instanceof PipelineError) error.usage = generated.usage; throw error; }
  // Preserve the model's bounded schema; backend warnings live in the envelope
  // so they cannot be omitted by the model or overflow its uncertainties array.
  // Date notes from the sent-day rule make the result need review, like any warning.
  const warnings = [...new Set([...prepared.payload.contextWarnings, ...dateNotes, ...contentWarnings(result)])];
  return { status: 'extracted', messageId: prepared.messageId, modelCalls: generated.attempts ?? 1,
    ...(input.contract==='gmail-v1'?{contract:'gmail-v1'}:{}),
    returnedModelVersion: generated.modelVersion ?? null,
    contextWarnings: warnings,
    needsReview: warnings.length > 0 || result.uncertainties.length > 0 || result.tasks.some((t) => t.deadline === null)
      || (result.topicRelevance?.decision==='uncertain') || result.taskChanges?.some(c=>c.targetTaskId===null) === true,
    result, usage: generated.usage, latencyMs: generated.latencyMs };
}
