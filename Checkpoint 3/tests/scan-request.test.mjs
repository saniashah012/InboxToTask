// Which scan request the dashboard sends when a saved backlog cannot be continued. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestScan, SCAN_REFUSED_CODE, shouldStartFresh } from '../app/web/src/scanRequest.ts';

const refusal = code => Object.assign(new Error('refused'), { code });

// A fake backend: answers each mode from a queue and records what was asked.
function backend(answers) {
  const calls = [];
  const send = async mode => {
    calls.push(mode);
    const answer = answers[mode].shift();
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { calls, send };
}

test('an up-to-date backlog is continued with one request', async () => {
  const b = backend({ more: [{ backlog: false }], initial: [] });
  assert.deepEqual(await requestScan('more', b.send), { result: { backlog: false }, mode: 'more', restarted: false });
  assert.deepEqual(b.calls, ['more']);
});

test('a refused continuation (stale after a reconnect) starts one new check', async () => {
  const b = backend({ more: [refusal(SCAN_REFUSED_CODE)], initial: [{ backlog: true }] });
  assert.deepEqual(await requestScan('more', b.send), { result: { backlog: true }, mode: 'initial', restarted: true });
  assert.deepEqual(b.calls, ['more', 'initial']);
});

test('when the new check is refused too, its error is shown and nothing loops', async () => {
  const real = refusal(SCAN_REFUSED_CODE);
  const b = backend({ more: [refusal(SCAN_REFUSED_CODE)], initial: [real] });
  await assert.rejects(requestScan('more', b.send), e => e === real);
  assert.deepEqual(b.calls, ['more', 'initial']);
});

test('a refused new check is never retried', async () => {
  const real = refusal(SCAN_REFUSED_CODE);
  const b = backend({ more: [], initial: [real] });
  await assert.rejects(requestScan('initial', b.send), e => e === real);
  assert.deepEqual(b.calls, ['initial']);
});

test('busy, disabled and unavailable answers are not replaced by a new check', async () => {
  for (const code of ['SCAN_BUSY', 'GMAIL_SCAN_DISABLED', 'GMAIL_SCAN_UNAVAILABLE', '']) {
    const error = refusal(code);
    const b = backend({ more: [error], initial: [{ backlog: false }] });
    await assert.rejects(requestScan('more', b.send), e => e === error);
    assert.deepEqual(b.calls, ['more'], code);
  }
  const plain = new Error('network');
  const b = backend({ more: [plain], initial: [{}] });
  await assert.rejects(requestScan('more', b.send), e => e === plain);
  assert.deepEqual(b.calls, ['more']);
});

test('a new check that runs but stops with a batch error still counts as the restart', async () => {
  const b = backend({ more: [refusal(SCAN_REFUSED_CODE)], initial: [{ error: 'SCAN_INFERENCE_LIMIT', backlog: true }] });
  const attempt = await requestScan('more', b.send);
  assert.equal(attempt.restarted, true);
  assert.equal(attempt.result.error, 'SCAN_INFERENCE_LIMIT');
});

test('shouldStartFresh only applies to a refused continuation', () => {
  assert.equal(shouldStartFresh('more', refusal(SCAN_REFUSED_CODE)), true);
  assert.equal(shouldStartFresh('initial', refusal(SCAN_REFUSED_CODE)), false);
  assert.equal(shouldStartFresh('more', refusal('SCAN_BUSY')), false);
  assert.equal(shouldStartFresh('more', null), false);
  assert.equal(shouldStartFresh('more', 'SCAN_PERMISSION_OR_REVISION_CHANGED'), false);
});
