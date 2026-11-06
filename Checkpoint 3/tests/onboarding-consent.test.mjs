import test from 'node:test';
import assert from 'node:assert/strict';
import { consentDecision, resolveScanConsent } from '../app/web/src/scanConsent.ts';

test('first-time unchecked save keeps the unconsented, paused state', () => {
  const decision = consentDecision(false, false);
  assert.equal(decision, undefined);
  assert.deepEqual(resolveScanConsent({ consent: false, paused: true }, decision),
    { p_consent: false, p_paused: true, p_disclosure: null });
});

test('checking consent saves consent, unpauses and records the disclosure', () => {
  const decision = consentDecision(false, true);
  assert.equal(decision, true);
  assert.deepEqual(resolveScanConsent({ consent: false, paused: true }, decision),
    { p_consent: true, p_paused: false, p_disclosure: 'gmail-scan-v1' });
});

test('run setup again with an untouched checkbox neither revokes nor unpauses', () => {
  const decision = consentDecision(true, true);
  assert.equal(decision, undefined);
  assert.deepEqual(resolveScanConsent({ consent: true, paused: false }, decision),
    { p_consent: true, p_paused: false, p_disclosure: 'gmail-scan-v1' });
  assert.deepEqual(resolveScanConsent({ consent: true, paused: true }, decision),
    { p_consent: true, p_paused: true, p_disclosure: 'gmail-scan-v1' });
});

test('unchecking an already consented account revokes and keeps the pause state', () => {
  const decision = consentDecision(true, false);
  assert.equal(decision, false);
  assert.deepEqual(resolveScanConsent({ consent: true, paused: false }, decision),
    { p_consent: false, p_paused: false, p_disclosure: null });
});
