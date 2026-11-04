// Convert ONLY Section 7's fictional inbox, never the protocol/scenarios/answer key.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const source = new URL('../../../Checkpoint 2/validation/PROMPTING_PROTOCOL.md', import.meta.url);
const protocol = await readFile(source, 'utf8');
const inbox = protocol.split('## 7. Complete email input')[1]?.split('## 8.')[0];
if (!inbox) throw new Error('CP2_INBOX_SECTION_NOT_FOUND');
function timestamp(raw) {
  const match = raw.match(/October (\d{1,2}), 2026(?:, (\d{2}):(\d{2}))?/);
  if (!match) throw new Error('CP2_TIMESTAMP_UNSUPPORTED');
  return { sentAt: `2026-10-${match[1].padStart(2, '0')}T${match[2] ?? '00'}:${match[3] ?? '00'}:00-05:00`, sentAtPrecision: match[2] ? 'minute' : 'date' };
}
function message(text, id, threadId, fallbackSubject, date) {
  const lines = text.trim().split(/\r?\n/);
  const from = lines.find((l) => l.startsWith('From: '))?.slice(6);
  const sent = lines.find((l) => l.startsWith('Sent: '))?.slice(6) ?? date;
  const subject = lines.find((l) => l.startsWith('Subject: '))?.slice(9) ?? fallbackSubject;
  const body = lines.filter((l) => !/^(From:|To:|Sent:|Subject:)/.test(l)).join('\n').trim();
  if (!from || !sent || !subject || !body) throw new Error('CP2_MESSAGE_PARSE_FAILED');
  return { id, threadId, from, ...timestamp(sent), labels: ['CP2-fixture'], subject, body };
}
const cases = [];
for (const match of inbox.matchAll(/^#### Email (E\d{2})[^\n]*\r?\n([\s\S]*?)(?=^#### Email E\d{2}|$(?![\s\S]))/gm)) {
  const [, id, block] = match;
  const text = block.replace(/\*End of conversation E\d{2}\.\*/g, '').trim();
  const threadId = `thread-${id}`;
  if (!text.includes('##### Latest message')) {
    cases.push({ message: message(text, id, threadId), threadContext: [] });
    continue;
  }
  const [header, content] = text.split('##### Latest message');
  const chunks = content.split(/##### Earlier message — /);
  const current = message(`${header}\n${chunks[0]}`, id, threadId);
  const threadContext = chunks.slice(1).map((chunk, index) => {
    const [date, ...rest] = chunk.trim().split(/\r?\n/);
    return message(rest.join('\n'), `${id}-history-${index + 1}`, threadId, current.subject, date);
  });
  cases.push({ message: current, threadContext });
}
if (cases.length !== 20 || new Set(cases.map((c) => c.message.id)).size !== 20) throw new Error('CP2_COVERAGE_NOT_20');
const output = new URL('../../tests/fixtures/cp2-inbox.json', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  provenance: 'Fictional inbox copied from CP2 PROMPTING_PROTOCOL.md Section 7 only; earlier date-only timestamps use midnight as a placeholder and preserve sentAtPrecision=date.',
  user: { email: 'student@example.org', timeZone: 'America/Chicago' },
  analysisTime: '2026-10-05T09:00:00-05:00',
  rules: {
    allow: { labels: [], senders: [], domains: ['example.org'] },
    block: { labels: [], senders: [], domains: [], subjectKeywords: [] },
  }, cases,
}, null, 2)}\n`);
console.log('Imported 20 fictional CP2 targets. No model calls; no environment files read.');
