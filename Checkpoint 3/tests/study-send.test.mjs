// Study inbox sender (study:send). Fictional example.edu addresses, temporary
// fixture folders and a fake transport or an in-process loopback SMTP fake only;
// no real mail is sent and no mail host is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEmailFile, orderEmails, buildPlan, StudyError } from '../app/study/inbox-files.mjs';
import { buildMessage, createSmtpTransport, dotStuff, encodeHeaderValue, maskAddress } from '../app/study/smtp.mjs';
import { run, parseArgs, defaultInboxDir, readConfig, assertAllowedDestination } from '../app/study/send.mjs';

const SENDER = 'study.sender@example.edu';
const PASSWORD = 'abcd efgh ijkl mnop';
const env = {
  STUDY_SENDER_ADDRESS: SENDER,
  STUDY_SENDER_APP_PASSWORD: PASSWORD,
  STUDY_INBOX_A_ADDRESS: 'inbox.alpha@example.edu',
  STUDY_INBOX_B_ADDRESS: 'inbox.beta@example.edu',
  STUDY_INBOX_C_ADDRESS: 'inbox.spare@example.edu',
};

const email = ({ id, sender = 'test-sender', subject = `Subject ${id}`, extra = '', body = `Body of email ${id}.` }) =>
  `---\nid: ${id}\nsender: ${sender}\nsubject: ${subject}\n${extra}---\n${body}\n`;

const inbox = {
  '01.md': email({ id: '01', subject: 'Lab report due Friday' }),
  '02.md': email({ id: '02', sender: 'Sender 1', subject: 'Club meeting notes' }),
  '03.md': email({ id: '03', subject: 'Lab report due Friday', extra: 'reply_to_id: 01\n', body: 'The deadline moved to Monday.' }),
  '04.md': email({ id: '04', subject: 'Re: Club meeting notes', extra: 'reply_to_id: 02\n' }),
  '05.md': email({ id: '05', subject: 'Résumé workshop ✓', extra: 'send_order: 0.5\n', body: 'Café at 3 pm.\n.hidden line' }),
};

async function fixture(files = inbox) {
  const dir = await mkdtemp(join(tmpdir(), 'study-send-'));
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text, 'utf8');
  return dir;
}

function fakeTransport({ failOn = null } = {}) {
  const calls = { created: 0, sent: [] };
  const createTransport = (opts) => {
    calls.created++;
    calls.options = opts;
    return {
      async send(msg) {
        if (failOn && msg.raw.includes(failOn)) throw new Error('SMTP RCPT TO failed (550): rejected inbox.alpha@example.edu');
        calls.sent.push(msg);
      },
    };
  };
  return { calls, createTransport };
}

async function runWith(args, { files, transport = fakeTransport(), environment = env } = {}) {
  const dir = await fixture(files);
  const lines = [];
  const sleeps = [];
  try {
    const code = await run({ argv: [...args, '--dir', dir], env: environment, createTransport: transport.createTransport,
      log: (l) => lines.push(l), sleep: async (ms) => { sleeps.push(ms); }, now: () => new Date('2026-11-16T12:00:00Z') });
    return { code, out: lines.join('\n'), sleeps, calls: transport.calls };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('parser reads front matter, defaults send_order to id and strips quotes', () => {
  const e = parseEmailFile('---\r\nid: "07"\r\nsender: Sender 2\r\nsubject: \'Re: Project: phase 2\'\r\n# comment\r\n\r\n---\r\n\r\nHello\r\n\r\nBye\r\n', '07.md');
  assert.deepEqual({ ...e }, { id: '07', sender: 'Sender 2', subject: 'Re: Project: phase 2', sendOrder: 7, replyToId: null, body: 'Hello\n\nBye', file: '07.md' });
});

test('parser rejects malformed files', () => {
  const bad = {
    'no front matter': 'id: 01\n',
    'unclosed': '---\nid: 01\nsender: test-sender\nsubject: x\nbody',
    'unknown key': email({ id: '01', extra: 'cc: someone@example.edu\n' }),
    'duplicate key': email({ id: '01', extra: 'subject: again\n' }),
    'one-digit id': email({ id: '1' }),
    'empty subject': email({ id: '01', subject: '' }),
    'empty body': email({ id: '01', body: '   \n' }),
    'bad send_order': email({ id: '01', extra: 'send_order: soon\n' }),
    'self reply': email({ id: '01', extra: 'reply_to_id: 01\n' }),
    'not key value': '---\nid: 01\njust text\n---\nbody\n',
  };
  for (const [name, text] of Object.entries(bad)) assert.throws(() => parseEmailFile(text, 'x.md'), StudyError, name);
});

test('ordering uses send_order then id; duplicate ids and bad reply targets are rejected', () => {
  const p = (t, f) => parseEmailFile(t, f);
  const ordered = orderEmails([p(email({ id: '01' }), 'a'), p(email({ id: '02', extra: 'send_order: 0\n' }), 'b'), p(email({ id: '03', extra: 'send_order: 1\n' }), 'c')]);
  assert.deepEqual(ordered.map((e) => e.id), ['02', '01', '03']);
  assert.throws(() => orderEmails([p(email({ id: '01' }), 'a'), p(email({ id: '01' }), 'b')]), /duplicate id 01/);
  assert.throws(() => orderEmails([p(email({ id: '01', extra: 'reply_to_id: 09\n' }), 'a')]), /not an email in this inbox/);
  assert.throws(() => orderEmails([p(email({ id: '01', extra: 'reply_to_id: 02\n' }), 'a'), p(email({ id: '02' }), 'b')]), /not sent before/);
});

test('plan skips by-hand senders and explains reply handling', () => {
  const parsed = Object.entries(inbox).map(([f, t]) => parseEmailFile(t, f));
  const steps = buildPlan(orderEmails(parsed));
  assert.deepEqual(steps.map((s) => [s.email.id, s.action]), [['05', 'send'], ['01', 'send'], ['02', 'by-hand'], ['03', 'send'], ['04', 'send']]);
  assert.equal(steps[3].subject, 'Re: Lab report due Friday');
  assert.equal(steps[3].reply.threaded, true);
  assert.equal(steps[4].subject, 'Re: Club meeting notes');
  assert.match(steps[4].reply.note, /new message; 02 is sent by hand/);
  const partial = buildPlan(orderEmails(parsed), ['03']);
  assert.match(partial[0].reply.note, /01 is not in this run/);
  assert.throws(() => buildPlan(orderEmails(parsed), ['42']), /not in this inbox: 42/);
});

test('arguments: --to defaults to --inbox, --send is opt-in, bad values are rejected', () => {
  assert.deepEqual(parseArgs(['--inbox', 'a']), { inbox: 'A', to: 'A', send: false, only: null, delayMs: 4000, dir: null });
  assert.equal(parseArgs(['--inbox', 'B', '--to', 'c', '--only', '03,07', '--delay-ms', '0']).to, 'C');
  for (const argv of [[], ['--inbox', 'C'], ['--inbox', 'A', '--to', 'D'], ['--inbox', 'A', '--only', '3'], ['--inbox', 'A', '--delay-ms', '-1'], ['--inbox', 'A', '--cc', 'x']])
    assert.throws(() => parseArgs(argv), StudyError, argv.join(' '));
  assert.match(defaultInboxDir('A'), /Checkpoint 4[\\/]docs[\\/]study_materials[\\/]inbox_a[\\/]emails$/);
});

test('dry run validates and prints the plan without creating a transport', async () => {
  const r = await runWith(['--inbox', 'A', '--to', 'C']);
  assert.equal(r.code, 0);
  assert.equal(r.calls.created, 0);
  assert.match(r.out, /DRY RUN/);
  assert.match(r.out, /02 {2}send by hand from Sender 1/);
  assert.match(r.out, /4 to send from test-sender, 1 to send by hand/);
  assert.match(r.out, /destination: inbox C i\*\*\*@example\.edu/);
  // Dry run works without any configuration.
  const bare = await runWith(['--inbox', 'A'], { environment: {} });
  assert.equal(bare.code, 0);
  assert.match(bare.out, /STUDY_INBOX_A_ADDRESS is not set/);
});

test('invalid inbox files fail the dry run with exit code 2', async () => {
  const r = await runWith(['--inbox', 'A'], { files: { ...inbox, '06.md': email({ id: '03' }) } });
  assert.equal(r.code, 2);
  assert.match(r.out, /duplicate id 03/);
  assert.equal(r.calls.created, 0);
});

test('send refuses destinations outside the allow-list and unsafe configurations', async () => {
  const cases = [
    [{ ...env, STUDY_INBOX_C_ADDRESS: 'inbox.spare@example.edu, other@example.edu' }, ['--inbox', 'A', '--to', 'C'], /not one of the configured|missing or invalid|destination/],
    [{ ...env, STUDY_INBOX_A_ADDRESS: SENDER }, ['--inbox', 'A'], /sender address must not be/],
    [{ ...env, STUDY_SENDER_APP_PASSWORD: '' }, ['--inbox', 'A'], /APP_PASSWORD is missing/],
    [{ ...env, STUDY_SENDER_ADDRESS: '' }, ['--inbox', 'A'], /SENDER_ADDRESS is missing/],
    [{ ...env, STUDY_INBOX_B_ADDRESS: '' }, ['--inbox', 'A', '--to', 'B'], /STUDY_INBOX_B_ADDRESS is missing/],
  ];
  for (const [environment, args, pattern] of cases) {
    const r = await runWith([...args, '--send'], { environment });
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.out, /refused: /);
    assert.match(r.out, pattern);
    assert.equal(r.calls.created, 0);
  }
});

test('destination allow-list accepts only configured study inboxes', () => {
  const config = readConfig(env);
  assert.doesNotThrow(() => assertAllowedDestination('INBOX.SPARE@example.edu', config));
  for (const to of ['someone@example.edu', SENDER, 'inbox.alpha@example.edu,x@example.edu', ''])
    assert.throws(() => assertAllowedDestination(to, { ...config, inboxes: { ...config.inboxes, C: to === SENDER ? SENDER : config.inboxes.C } }), StudyError, to);
});

test('send delivers test-sender emails in order to one recipient, with reply headers', async () => {
  const r = await runWith(['--inbox', 'A', '--to', 'C', '--send', '--delay-ms', '2500']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.calls.options, { user: SENDER, pass: PASSWORD });
  assert.equal(r.calls.sent.length, 4);
  assert.deepEqual(r.sleeps, [2500, 2500, 2500]);
  for (const m of r.calls.sent) {
    assert.equal(m.from, SENDER);
    assert.equal(m.to, 'inbox.spare@example.edu');
    assert.match(m.raw, /^From: study\.sender@example\.edu\r$/m);
    assert.match(m.raw, /^To: inbox\.spare@example\.edu\r$/m);
    assert.doesNotMatch(m.raw, /^(Cc|Bcc|Reply-To|Sender):/im);
    assert.doesNotMatch(m.raw, /[^\r]\n/);
  }
  const [first, lab, labReply, clubReply] = r.calls.sent.map((m) => m.raw);
  assert.match(first, /^Subject: =\?UTF-8\?B\?/m);
  const labId = /^Message-ID: (<[^>]+>)/m.exec(lab)[1];
  assert.match(labReply, /^Subject: Re: Lab report due Friday\r$/m);
  assert.ok(labReply.includes(`In-Reply-To: ${labId}\r\n`));
  assert.ok(labReply.includes(`References: ${labId}\r\n`));
  assert.match(clubReply, /^Subject: Re: Club meeting notes\r$/m);
  assert.doesNotMatch(clubReply, /In-Reply-To/);
  assert.match(r.out, /01 {2}accepted {2}"Lab report due Friday"/);
  assert.match(r.out, /Still to send by hand: 02 \(Sender 1\)/);
});

test('logs mask addresses and never print the app password', async () => {
  const r = await runWith(['--inbox', 'A', '--send']);
  assert.equal(r.code, 0);
  for (const secret of [PASSWORD, PASSWORD.replace(/ /g, ''), SENDER, env.STUDY_INBOX_A_ADDRESS]) assert.ok(!r.out.includes(secret), secret);
  assert.match(r.out, /s\*\*\*@example\.edu to i\*\*\*@example\.edu/);
  assert.equal(maskAddress('ivy@gmail.example'), 'i***@gmail.example');
});

test('send stops at the first failure and prints a resume command', async () => {
  const transport = fakeTransport({ failOn: 'Subject: Lab report due Friday' });
  const r = await runWith(['--inbox', 'A', '--send'], { transport });
  assert.equal(r.code, 1);
  assert.equal(r.calls.sent.length, 1);
  assert.match(r.out, /01 {2}failed/);
  assert.match(r.out, /Not sent: 01, 03, 04/);
  assert.match(r.out, /--send --only 01,03,04/);
  assert.ok(!r.out.includes('inbox.alpha@example.edu'));
  assert.doesNotMatch(r.out, /accepted {2}"Re:/);
});

test('message builder encodes non-ASCII safely and dot-stuffs DATA', () => {
  const raw = buildMessage({ from: SENDER, to: env.STUDY_INBOX_A_ADDRESS, subject: 'Résumé '.repeat(12), body: 'Café\n.line', messageId: '<m@example.edu>', date: new Date('2026-11-16T12:00:00Z') });
  assert.match(raw, /^Date: Mon, 16 Nov 2026 12:00:00 \+0000\r$/m);
  assert.match(raw, /Content-Transfer-Encoding: base64/);
  const subjectLines = /Subject: ([\s\S]*?)\r\nMessage-ID/.exec(raw)[1].split('\r\n ');
  assert.ok(subjectLines.length > 1 && subjectLines.every((w) => w.length <= 75));
  const decoded = subjectLines.map((w) => Buffer.from(/=\?UTF-8\?B\?(.*)\?=/.exec(w)[1], 'base64').toString()).join('');
  assert.equal(decoded, 'Résumé '.repeat(12));
  assert.equal(encodeHeaderValue('Plain subject'), 'Plain subject');
  assert.equal(dotStuff('a\r\n.b\r\n..c'), 'a\r\n..b\r\n...c');
  assert.throws(() => buildMessage({ from: SENDER, to: 'a@example.edu, b@example.edu', subject: 's', body: 'b', messageId: '<m@x>' }));
  const ascii = buildMessage({ from: SENDER, to: env.STUDY_INBOX_A_ADDRESS, subject: 'S', body: 'line\n.dot', messageId: '<m@example.edu>' });
  assert.match(ascii, /Content-Transfer-Encoding: 7bit\r\n\r\nline\r\n\.dot\r\n$/);
});

// In-process loopback SMTP fake (no real mail host) for the hand-written client.
function fakeSmtpServer({ rcptCode = 250 } = {}) {
  const log = [];
  const server = net.createServer((socket) => {
    let buf = '', inData = false, data = '';
    socket.write('220 fake.example.edu ESMTP\r\n');
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; log.push({ data }); socket.write('250 2.0.0 OK queued\r\n'); }
          else data += `${line}\r\n`;
          continue;
        }
        log.push(line);
        if (line.startsWith('EHLO')) socket.write('250-fake.example.edu\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n');
        else if (line.startsWith('AUTH PLAIN')) socket.write('235 2.7.0 Accepted\r\n');
        else if (line.startsWith('MAIL FROM')) socket.write('250 OK\r\n');
        else if (line.startsWith('RCPT TO')) socket.write(rcptCode === 250 ? '250 OK\r\n' : `${rcptCode} 5.1.1 No such user ${line.slice(9, -1)}\r\n`);
        else if (line === 'DATA') { inData = true; socket.write('354 go ahead\r\n'); }
        else if (line === 'QUIT') { socket.end('221 bye\r\n'); }
        else socket.write('502 unknown\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const connect = () => new Promise((ok, fail) => { const s = net.connect(server.address().port, '127.0.0.1', () => ok(s)); s.once('error', fail); });
    resolve({ log, connect, close: () => new Promise((r) => server.close(r)) });
  }));
}

test('SMTP client authenticates, sends one recipient and dot-stuffs the body', async () => {
  const fake = await fakeSmtpServer();
  try {
    const t = createSmtpTransport({ user: SENDER, pass: PASSWORD, connect: fake.connect, timeoutMs: 2000 });
    const raw = buildMessage({ from: SENDER, to: env.STUDY_INBOX_A_ADDRESS, subject: 'S', body: 'one\n.two', messageId: '<m@example.edu>' });
    const result = await t.send({ from: SENDER, to: env.STUDY_INBOX_A_ADDRESS, raw });
    assert.match(result.response, /OK queued/);
    const auth = fake.log.find((l) => typeof l === 'string' && l.startsWith('AUTH PLAIN'));
    assert.equal(Buffer.from(auth.slice(11), 'base64').toString(), `\u0000${SENDER}\u0000abcdefghijklmnop`);
    assert.deepEqual(fake.log.filter((l) => typeof l === 'string' && /^(MAIL|RCPT)/.test(l)), [`MAIL FROM:<${SENDER}>`, `RCPT TO:<${env.STUDY_INBOX_A_ADDRESS}>`]);
    const { data } = fake.log.find((l) => l.data);
    assert.equal(data, raw.replace('\r\n.two', '\r\n..two'));
    await assert.rejects(t.send({ from: 'someone.else@example.edu', to: env.STUDY_INBOX_A_ADDRESS, raw }), /From must be the authenticated sender/);
  } finally { await fake.close(); }
});

test('SMTP client reports rejections with masked addresses and no password', async () => {
  const fake = await fakeSmtpServer({ rcptCode: 550 });
  try {
    const t = createSmtpTransport({ user: SENDER, pass: PASSWORD, connect: fake.connect, timeoutMs: 2000 });
    const raw = buildMessage({ from: SENDER, to: env.STUDY_INBOX_A_ADDRESS, subject: 'S', body: 'b', messageId: '<m@example.edu>' });
    await assert.rejects(t.send({ from: SENDER, to: env.STUDY_INBOX_A_ADDRESS, raw }), (e) => {
      assert.match(e.message, /RCPT TO failed \(550\)/);
      assert.match(e.message, /i\*\*\*@example\.edu/);
      assert.ok(!e.message.includes(env.STUDY_INBOX_A_ADDRESS) && !e.message.includes('abcdefgh'));
      return true;
    });
  } finally { await fake.close(); }
});
