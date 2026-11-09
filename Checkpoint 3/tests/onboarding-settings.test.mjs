// Offline checks for how the designed onboarding and settings screens turn chip
// edits into the saved scan_settings_save payload. No network, no model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { consentDecision, resolveScanConsent } from '../app/web/src/scanConsent.ts';
import {
  accessScopeSummary, contextLimitError, hasSourcePermission, preferencesFromSettings,
  parseRuleInput, sameSavedFields, scanBlockers, settingsWithPreferences, signedInRoute, topicInputError,
  withConsentDecision,
} from '../app/web/src/scanSetup.ts';

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
  assert.deepEqual(next.semantic_preferences, { include: ['School', 'Research'], exclude: ['Health'] });
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
  const saved = { ...fresh(), revision: 2, semantic_preferences: { exclude: [], include: ['school'] },
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
  assert.deepEqual(blockers, ['No permitted senders or domains, so nothing will be processed.']);
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
