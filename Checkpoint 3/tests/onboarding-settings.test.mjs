// Offline checks for how the designed onboarding and settings screens turn chip
// edits into the saved scan_settings_save payload. No network, no model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { consentDecision, resolveScanConsent } from '../app/web/src/scanConsent.ts';
import {
  accessScopeSummary, blockedWordsFor, contextLimitError, hasScanSource, hasSourcePermission, parseBlockedWord,
  preferencesFromSettings, parseRuleInput, sameSavedFields, scanBlockers, settingsWithPreferences,
  signedInRoute, topicInputError, totalBlockedWords, withConsentDecision,
} from '../app/web/src/scanSetup.ts';
import { excludedTopicSuggestions, includedTopicSuggestions, starterBlockedWords, starterTopicWords } from '../app/web/src/filterPresets.ts';
import { STARTER_BLOCKED_WORDS, STARTER_TOPIC_WORDS } from '../app/pipeline/private-topics.mjs';

const emptyRules = () => ({
  allow: { labels: [], senders: [], domains: [], subjectKeywords: [], keywords: [] },
  block: { labels: [], senders: [], domains: [], subjectKeywords: [], keywords: [] },
});
// Matches scan_settings_get for an account that has never saved.
const fresh = () => ({
  revision: 0, consent: false, paused: true, consent_at: null,
  semantic_preferences: { include: [], exclude: [] },
  requires_review: false, legacy_phrase_rules: null, rules: emptyRules(),
  context_limits: { maxMessages: 5, maxAgeDays: 90, maxMessageChars: 12000, maxTotalChars: 24000 },
});

test('first-time unchecked save keeps the unconsented, paused state', () => {
  const decision = consentDecision(false, false);
  assert.equal(decision, undefined);
  assert.deepEqual(resolveScanConsent({ consent: false, paused: true }, decision),
    { p_consent: false, p_paused: true, p_disclosure: null });
});

test('checking consent saves consent, unpauses and records the disclosure', () => {
  assert.deepEqual(resolveScanConsent({ consent: false, paused: true }, consentDecision(false, true)),
    { p_consent: true, p_paused: false, p_disclosure: 'gmail-scan-v1' });
});

test('rerunning setup with an untouched box neither revokes nor unpauses', () => {
  const decision = consentDecision(true, true);
  assert.equal(decision, undefined);
  const saved = { ...fresh(), revision: 3, consent: true, paused: true };
  const next = withConsentDecision(saved, decision);
  assert.equal(next.consent, true);
  assert.equal(next.paused, true);
});

test('unchecking saved consent revokes it and keeps the pause state', () => {
  const next = withConsentDecision({ ...fresh(), consent: true, paused: false }, consentDecision(true, false));
  assert.equal(next.consent, false);
  assert.equal(next.paused, false);
});

test('routing: a never-saved account onboards, saved accounts use the workspace, legacy rules need review', () => {
  assert.equal(signedInRoute(fresh()), 'onboarding');
  assert.equal(signedInRoute({ ...fresh(), revision: 1 }), 'workspace');
  assert.equal(signedInRoute({ ...fresh(), revision: 0, requires_review: true }), 'review-legacy');
  assert.equal(signedInRoute({ ...fresh(), revision: 4, requires_review: true }), 'review-legacy');
});

test('topics are saved only as semantic preferences, never as access keywords', () => {
  const next = settingsWithPreferences(fresh(), {
    includedTypes: ['School', 'Research'], excludedTypes: ['Health'],
    selectedSenders: [], selectedDomains: [], excludedSenders: [], excludedDomains: [], excludedSubjects: [],
  });
  assert.deepEqual(next.semantic_preferences, { include: ['School', 'Research'], exclude: ['Health'],
    blockedWords: { health: STARTER_BLOCKED_WORDS.health },
    includeWords: { school: STARTER_TOPIC_WORDS.school, research: STARTER_TOPIC_WORDS.research } });
  assert.deepEqual(next.rules, emptyRules());
  assert.equal(hasSourcePermission(preferencesFromSettings(next)), false);
});

test('sources and exclusions are normalized like the backend expects', () => {
  const next = settingsWithPreferences(fresh(), {
    includedTypes: [' School ', 'school', ''],
    selectedSenders: [' Prof@Example.edu ', 'prof@example.edu'],
    selectedDomains: ['@Example.edu', 'example.edu'],
    excludedTypes: [], excludedSenders: ['Payroll@Example.edu'], excludedDomains: [' @Spam.example '],
    excludedSubjects: ['  Pay Stub ', 'pay stub', ''],
  });
  assert.deepEqual(next.rules.allow.senders, ['prof@example.edu']);
  assert.deepEqual(next.rules.allow.domains, ['example.edu']);
  assert.deepEqual(next.rules.block.senders, ['payroll@example.edu']);
  assert.deepEqual(next.rules.block.domains, ['spam.example']);
  // Subjects are literal phrases: trimmed and deduplicated, but case is kept.
  assert.deepEqual(next.rules.block.subjectKeywords, ['Pay Stub']);
  assert.deepEqual(next.semantic_preferences.include, ['School']);
  assert.deepEqual(next.rules.allow.keywords, []);
});

test('fields the screens do not edit keep their saved values', () => {
  const saved = { ...fresh(), revision: 2, consent: true, paused: false };
  saved.rules.allow.labels = ['kept-label'];
  const next = settingsWithPreferences(saved, preferencesFromSettings(saved));
  assert.deepEqual(next.rules.allow.labels, ['kept-label']);
  assert.equal(next.revision, 2);
  assert.equal(next.consent, true);
  assert.equal(next.paused, false);
  assert.ok(sameSavedFields(next, saved), 'an untouched form has no unsaved changes');
});

test('unsaved-change detection ignores the key order jsonb returns', () => {
  const saved = { ...fresh(), revision: 2, semantic_preferences: { includeWords: { school: [...STARTER_TOPIC_WORDS.school] }, exclude: [], include: ['school'] },
    context_limits: { maxAgeDays: 90, maxMessages: 5, maxTotalChars: 24000, maxMessageChars: 12000 } };
  saved.rules.allow = { labels: [], domains: ['example.edu'], senders: [], keywords: [], subjectKeywords: [] };
  const next = settingsWithPreferences(saved, preferencesFromSettings(saved));
  assert.ok(sameSavedFields(next, saved));
});

test('the revision sent is the one that was loaded, so a stale tab gets PT409', () => {
  const loaded = { ...fresh(), revision: 7 };
  const next = settingsWithPreferences(loaded, { ...preferencesFromSettings(loaded), selectedDomains: ['example.edu'] });
  assert.equal(next.revision, 7);
  assert.equal(sameSavedFields(next, loaded), false);
});

test('an empty allowlist processes nothing, even with consent and a connection', () => {
  const blockers = scanBlockers({ ...fresh(), consent: true, paused: false }, 'connected');
  assert.deepEqual(blockers, ['No permitted senders, domains or categories to check, so nothing will be processed.']);
  assert.match(accessScopeSummary(preferencesFromSettings(fresh())), /nothing is processed/);
});

test('connecting Google is not consent: a connected account without consent stays blocked', () => {
  const settings = settingsWithPreferences(fresh(), { ...preferencesFromSettings(fresh()), selectedDomains: ['example.edu'] });
  const blockers = scanBlockers(settings, 'connected');
  assert.ok(blockers.includes('Scanning consent has not been given.'));
  assert.ok(blockers.includes('Scanning is paused.'));
  assert.deepEqual(scanBlockers({ ...settings, consent: true, paused: false }, 'connected'), []);
  assert.ok(scanBlockers({ ...settings, consent: true, paused: false }, 'disconnected').includes('Gmail is not connected.'));
});

test('context limits use the backend ranges', () => {
  const ok = fresh().context_limits;
  assert.equal(contextLimitError(ok), null);
  assert.equal(contextLimitError({ ...ok, maxMessages: 0 }), null);
  assert.match(contextLimitError({ ...ok, maxMessages: 11 }), /Earlier messages/);
  assert.match(contextLimitError({ ...ok, maxAgeDays: 0 }), /Maximum age/);
  assert.match(contextLimitError({ ...ok, maxMessageChars: 1.5 }), /whole number/);
  assert.match(contextLimitError({ ...ok, maxMessageChars: Number.NaN }), /Characters per message/);
  assert.match(contextLimitError({ ...ok, maxMessageChars: 20000, maxTotalChars: 10000 }), /at least/);
});

test('typed sender and domain rules are normalized to exact lowercase values', () => {
  assert.equal(parseRuleInput('selectedSenders', '   ', []), null);
  assert.deepEqual(parseRuleInput('selectedSenders', '  Teacher@Example.EDU ', []), { value: 'teacher@example.edu' });
  assert.deepEqual(parseRuleInput('excludedDomains', '@Mail.Example.edu', []), { value: 'mail.example.edu' });
  assert.deepEqual(parseRuleInput('selectedSenders', 'teacher', []), { error: 'Enter a complete sender email address.' });
  assert.deepEqual(parseRuleInput('selectedSenders', 'a b@example.edu', []), { error: 'Enter a complete sender email address.' });
  for (const bad of ['example', '-example.edu', 'example.edu.', 'exa mple.edu', 'teacher@example.edu']) {
    assert.deepEqual(parseRuleInput('selectedDomains', bad, []), { error: 'Enter a valid domain, such as example.edu.' }, bad);
  }
});

test('typed subject exclusions stay literal and reject control characters', () => {
  assert.deepEqual(parseRuleInput('excludedSubjects', '  Payroll Notice ', []), { value: 'Payroll Notice' });
  const error = { error: 'Subject phrases must be 1-254 characters without control characters.' };
  assert.deepEqual(parseRuleInput('excludedSubjects', 'pay\u0000roll', []), error);
  assert.deepEqual(parseRuleInput('excludedSubjects', 'x'.repeat(255), []), error);
  assert.deepEqual(parseRuleInput('excludedSubjects', 'x'.repeat(254), []), { value: 'x'.repeat(254) });
});

test('typed rules already present are rejected regardless of case', () => {
  const duplicate = { error: 'That rule is already included.' };
  assert.deepEqual(parseRuleInput('selectedDomains', 'EXAMPLE.edu', ['example.edu']), duplicate);
  assert.deepEqual(parseRuleInput('excludedSubjects', 'payroll', ['Payroll']), duplicate);
  assert.deepEqual(parseRuleInput('excludedSenders', 'b@example.edu', ['a@example.edu']), { value: 'b@example.edu' });
});

test('topic terms are bounded in length, characters and count', () => {
  const error = 'Use up to 200 terms, each 1-254 characters without control characters.';
  assert.equal(topicInputError('exam schedule', 0), null);
  assert.equal(topicInputError('x'.repeat(254), 199), null);
  assert.equal(topicInputError('x'.repeat(255), 0), error);
  assert.equal(topicInputError('tab\there', 0), error);
  assert.equal(topicInputError('exam', 200), error);
});

test('every suggested skipped category has a word list matching the backend starter list', () => {
  assert.deepEqual(starterBlockedWords, STARTER_BLOCKED_WORDS);
  for (const suggestion of excludedTopicSuggestions) {
    assert.ok(STARTER_BLOCKED_WORDS[suggestion.toLowerCase()]?.length, `${suggestion} has a starter list`);
  }
  assert.deepEqual(Object.keys(STARTER_BLOCKED_WORDS).sort(),
    excludedTopicSuggestions.map(s => s.toLowerCase()).sort(), 'no starter list lacks a suggestion chip');
});

test('skipped categories save their edited, starter or name word lists', () => {
  const base = { ...preferencesFromSettings(fresh()), excludedTypes: ['Health', 'Financial', 'Rowing Team'],
    blockedWords: { health: ['diagnosis', '  Lab   Results ', 'DIAGNOSIS'], promotions: ['coupon'] } };
  const next = settingsWithPreferences(fresh(), base);
  assert.deepEqual(next.semantic_preferences.blockedWords, {
    health: ['diagnosis', 'lab results'],
    financial: STARTER_BLOCKED_WORDS.financial,
    'rowing team': ['rowing team'],
  }, 'lists of categories no longer skipped are dropped');
  assert.deepEqual(blockedWordsFor(base, 'Promotions'), ['coupon'], 'a removed edit comes back if re-added');
  assert.equal(totalBlockedWords(base), 3 + STARTER_BLOCKED_WORDS.financial.length + 1);
});

test('saved word lists round-trip without reporting unsaved changes', () => {
  const saved = { ...fresh(), revision: 3, semantic_preferences: { include: [], exclude: ['health', 'my club'],
    blockedWords: { health: ['diagnosis'], 'my club': ['chess club', 'rowing'] } } };
  const prefs = preferencesFromSettings(saved);
  assert.ok(sameSavedFields(settingsWithPreferences(saved, prefs), saved));
  const edited = { ...prefs, blockedWords: { ...prefs.blockedWords, health: ['diagnosis', 'pharmacy'] } };
  assert.equal(sameSavedFields(settingsWithPreferences(saved, edited), saved), false);
  assert.deepEqual(saved.semantic_preferences.blockedWords.health, ['diagnosis'], 'loaded settings are not mutated');
});

test('an account with no skipped topics does not report unsaved changes after loading', () => {
  // scan_settings_get returns blockedWords: {} even when nothing is skipped.
  const saved = { ...fresh(), revision: 3, semantic_preferences: { include: ['school'], exclude: [], blockedWords: {},
    includeWords: { school: [...STARTER_TOPIC_WORDS.school] } } };
  assert.ok(sameSavedFields(settingsWithPreferences(saved, preferencesFromSettings(saved)), saved));
});

test('every suggested category to check has a word list matching the backend starter list', () => {
  assert.deepEqual(starterTopicWords, STARTER_TOPIC_WORDS);
  assert.deepEqual(Object.keys(STARTER_TOPIC_WORDS).sort(),
    includedTopicSuggestions.map(s => s.toLowerCase()).sort(), 'every suggestion chip has a starter list');
});

test('categories to check save their edited, starter or name word lists, and round-trip', () => {
  const prefs = { ...preferencesFromSettings(fresh()), includedTypes: ['School', 'Band'],
    includeWords: { band: ['rehearsal', 'Concert  Hall'] } };
  const next = settingsWithPreferences(fresh(), prefs);
  assert.deepEqual(next.semantic_preferences.includeWords,
    { school: STARTER_TOPIC_WORDS.school, band: ['rehearsal', 'concert hall'] });
  const saved = { ...next, revision: 1, semantic_preferences: { ...next.semantic_preferences, include: ['school', 'band'] } };
  assert.ok(sameSavedFields(settingsWithPreferences(saved, preferencesFromSettings(saved)), saved));
  const edited = preferencesFromSettings(saved);
  edited.includeWords = { ...edited.includeWords, school: ['syllabus'] };
  assert.equal(sameSavedFields(settingsWithPreferences(saved, edited), saved), false);
  // Removing every category to check removes every list, so nothing is required.
  const cleared = settingsWithPreferences(saved, { ...preferencesFromSettings(saved), includedTypes: [] });
  assert.deepEqual(cleared.semantic_preferences.includeWords, {});
});

test('typed skipped-category words follow the backend word rules', () => {
  assert.equal(parseBlockedWord('   ', [], 0), null);
  assert.deepEqual(parseBlockedWord('  Lab   Results ', [], 0), { value: 'lab results' });
  assert.match(parseBlockedWord('LOAN', ['loan'], 1).error, /already/);
  assert.match(parseBlockedWord('!!!', [], 0).error, /letter or number/);
  assert.match(parseBlockedWord('x'.repeat(101), [], 0).error, /1-100/);
  assert.match(parseBlockedWord('ab', [], 0).error, /1-100/);
  assert.match(parseBlockedWord('new', Array.from({ length: 100 }, (_, i) => `w${i}`), 100).error, /up to 100/);
  assert.match(parseBlockedWord('new', ['a'], 1000).error, /1000 words in total/);
});

test('a category to check stands in for a sender or domain, and the summary says so', () => {
  const prefs = { ...preferencesFromSettings(fresh()), selectedSenders: [], selectedDomains: [], includedTypes: [] };
  assert.equal(hasScanSource(prefs), false);
  assert.match(accessScopeSummary(prefs), /nothing is processed/);
  const topicsOnly = { ...prefs, includedTypes: ['School'] };
  assert.equal(hasScanSource(topicsOnly), true);
  assert.equal(hasSourcePermission(topicsOnly), false);
  assert.match(accessScopeSummary(topicsOnly), /^Permit any sender whose email uses a word from School/);
  const settings = settingsWithPreferences(fresh(), topicsOnly);
  assert.deepEqual(scanBlockers({ ...settings, consent: true, paused: false }, 'connected'), []);
  assert.ok(scanBlockers({ ...settingsWithPreferences(fresh(), prefs), consent: true, paused: false }, 'connected')
    .some(b => b.startsWith('No permitted senders, domains or categories')));
});
