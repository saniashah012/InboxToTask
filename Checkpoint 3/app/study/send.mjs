import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { StudyError, TEST_SENDER, buildPlan, loadInbox } from './inbox-files.mjs';
import { buildMessage, createMessageId, createSmtpTransport, isAddress, maskAddress, maskText } from './smtp.mjs';

// Sends a fictional study inbox from the dedicated test-sender Gmail account to a
// study receiving inbox. Dry run by default; --send is required to send.
//
//   npm run study:send -- --inbox A [--to C] [--send] [--only 03,07] [--delay-ms 4000] [--dir <path>]
//
// Configuration comes from the environment, optionally loaded from the git-ignored
// Checkpoint 3/app/.env.study (template: study/.env.study.example).

const LETTERS = ['A', 'B', 'C'];
const CONTENT = ['A', 'B'];
const DEFAULT_DELAY_MS = 4000;
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export function defaultInboxDir(letter) {
  return resolve(REPO_ROOT, 'Checkpoint 4', 'docs', 'study_materials', `inbox_${letter.toLowerCase()}`, 'emails');
}

class UsageError extends StudyError {}

export function parseArgs(argv) {
  const opts = { inbox: null, to: null, send: false, only: null, delayMs: DEFAULT_DELAY_MS, dir: null };
  const value = (i, flag) => {
    if (i >= argv.length || argv[i].startsWith('--')) throw new UsageError(`${flag} needs a value`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--send') opts.send = true;
    else if (a === '--inbox') opts.inbox = value(++i, a).toUpperCase();
    else if (a === '--to') opts.to = value(++i, a).toUpperCase();
    else if (a === '--dir') opts.dir = resolve(value(++i, a));
    else if (a === '--only') {
      const ids = value(++i, a).split(',').map((s) => s.trim()).filter(Boolean);
      if (!ids.length || ids.some((id) => !/^\d{2}$/.test(id))) throw new UsageError('--only takes two-digit ids, e.g. 03,07');
      opts.only = [...new Set(ids)];
    } else if (a === '--delay-ms') {
      const v = value(++i, a);
      if (!/^\d+$/.test(v) || Number(v) > 600000) throw new UsageError('--delay-ms must be a whole number from 0 to 600000');
      opts.delayMs = Number(v);
    } else throw new UsageError(`unknown argument "${a}"`);
  }
  if (!CONTENT.includes(opts.inbox)) throw new UsageError('--inbox must be A or B');
  opts.to ??= opts.inbox;
  if (!LETTERS.includes(opts.to)) throw new UsageError('--to must be A, B or C');
  return opts;
}

export function readConfig(env) {
  const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    sender: clean(env.STUDY_SENDER_ADDRESS),
    password: clean(env.STUDY_SENDER_APP_PASSWORD),
    inboxes: Object.fromEntries(LETTERS.map((l) => [l, clean(env[`STUDY_INBOX_${l}_ADDRESS`])])),
  };
}

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// Throws unless `to` is one of the configured study inboxes and not the sender.
export function assertAllowedDestination(to, config) {
  const allowed = Object.values(config.inboxes).filter(Boolean);
  if (!isAddress(to) || !allowed.some((a) => same(a, to))) throw new StudyError('destination is not one of the configured study inbox addresses');
  if (same(config.sender, to)) throw new StudyError('destination must not be the sender address');
}

function describeStep(step, n) {
  const pos = String(n).padStart(2, ' ');
  const what = step.action === 'send' ? 'send          ' : `send by hand from ${step.email.sender}`;
  const reply = step.reply ? ` [${step.reply.note}]` : '';
  return `  ${pos}. ${step.email.id}  ${what}  "${step.subject}"${reply}`;
}

export async function run({ argv, env = {}, createTransport = createSmtpTransport, log = console.log, sleep = (ms) => delay(ms), now = () => new Date() }) {
  let opts, steps;
  try {
    opts = parseArgs(argv);
    const dir = opts.dir ?? defaultInboxDir(opts.inbox);
    steps = buildPlan(await loadInbox(dir), opts.only);
    opts.dirLabel = opts.dir ? basename(dir) : `${basename(dirname(dir))}/${basename(dir)}`;
  } catch (e) {
    if (!(e instanceof StudyError)) throw e;
    log(`error: ${e.message}`);
    if (e instanceof UsageError) log('usage: npm run study:send -- --inbox A|B [--to A|B|C] [--send] [--only 03,07] [--delay-ms 4000] [--dir <path>]');
    return 2;
  }
  const config = readConfig(env);
  const to = config.inboxes[opts.to];
  const toSend = steps.filter((s) => s.action === 'send');
  const byHand = steps.filter((s) => s.action === 'by-hand');

  log(`Study inbox send plan (${opts.send ? 'SEND' : 'DRY RUN: no connection is opened; add --send to send'})`);
  log(`  content:     inbox ${opts.inbox} (${opts.dirLabel})`);
  log(`  destination: inbox ${opts.to} ${to ? maskAddress(to) : `(STUDY_INBOX_${opts.to}_ADDRESS is not set)`}`);
  log(`  sender:      ${config.sender ? maskAddress(config.sender) : '(STUDY_SENDER_ADDRESS is not set)'}`);
  log(`  delay:       ${opts.delayMs} ms between messages`);
  steps.forEach((s, i) => log(describeStep(s, i + 1)));
  log(`  ${toSend.length} to send from ${TEST_SENDER}, ${byHand.length} to send by hand`);

  if (!opts.send) return 0;

  try {
    if (!isAddress(config.sender)) throw new StudyError('STUDY_SENDER_ADDRESS is missing or invalid');
    if (!config.password) throw new StudyError('STUDY_SENDER_APP_PASSWORD is missing');
    if (!to) throw new StudyError(`STUDY_INBOX_${opts.to}_ADDRESS is missing`);
    if (Object.values(config.inboxes).some((a) => same(a, config.sender))) throw new StudyError('the sender address must not be one of the study inbox addresses');
    assertAllowedDestination(to, config);
  } catch (e) {
    if (!(e instanceof StudyError)) throw e;
    log(`refused: ${e.message}`);
    return 2;
  }
  if (!toSend.length) { log('Nothing to send from the test sender.'); return 0; }

  const secrets = [config.password];
  const transport = createTransport({ user: config.sender, pass: config.password });
  const sent = new Map();
  log(`Sending ${toSend.length} message(s) from ${maskAddress(config.sender)} to ${maskAddress(to)}`);
  for (let i = 0; i < toSend.length; i++) {
    const step = toSend[i];
    const { email } = step;
    if (i > 0 && opts.delayMs) await sleep(opts.delayMs);
    try {
      assertAllowedDestination(to, config);
      const parent = step.reply?.threaded ? sent.get(step.reply.id) : null;
      if (step.reply?.threaded && !parent) throw new StudyError(`email ${step.reply.id} was not sent in this run`);
      const messageId = createMessageId(config.sender);
      const raw = buildMessage({ from: config.sender, to, subject: step.subject, body: email.body, messageId,
        inReplyTo: parent?.messageId ?? null, references: parent?.references ?? [], date: now() });
      await transport.send({ from: config.sender, to, raw });
      sent.set(email.id, { messageId, references: parent ? [...parent.references, parent.messageId] : [] });
      log(`  ${email.id}  accepted  "${step.subject}"`);
    } catch (e) {
      log(`  ${email.id}  failed    "${step.subject}": ${maskText(e.message, secrets)}`);
      const rest = toSend.slice(i).map((s) => s.email.id);
      log(`Stopped at the first failure. Not sent: ${rest.join(', ')}.`);
      log(`Resume with: npm run study:send -- --inbox ${opts.inbox} --to ${opts.to} --send --only ${rest.join(',')}`);
      return 1;
    }
  }
  log(`Done: ${sent.size} accepted.`);
  if (byHand.length) log(`Still to send by hand: ${byHand.map((s) => `${s.email.id} (${s.email.sender})`).join(', ')}`);
  return 0;
}

async function main() {
  try { process.loadEnvFile(fileURLToPath(new URL('../.env.study', import.meta.url))); }
  catch (e) { if (e.code !== 'ENOENT') { console.log('error: could not read .env.study'); process.exitCode = 2; return; } }
  process.exitCode = await run({ argv: process.argv.slice(2), env: process.env });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.log(`error: ${maskText(e?.message ?? 'unexpected failure', [process.env.STUDY_SENDER_APP_PASSWORD])}`); process.exitCode = 2; });
}
