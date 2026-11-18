import tls from 'node:tls';
import { randomUUID } from 'node:crypto';

// Minimal SMTP submission client for Gmail (smtp.gmail.com:465, implicit TLS,
// AUTH PLAIN with an app password) plus a plain-text message builder.
// One connection per message: EHLO, AUTH, MAIL FROM, exactly one RCPT TO, DATA, QUIT.
// Commands are never logged, and errors never carry the password.

const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

export class SmtpError extends Error {
  constructor(stage, code, detail = '') {
    super(`SMTP ${stage} failed${code ? ` (${code})` : ''}${detail ? `: ${detail}` : ''}`);
    this.name = 'SmtpError';
    this.stage = stage;
    this.code = code;
  }
}

export function isAddress(value) { return typeof value === 'string' && ADDRESS.test(value); }

// "ivy.study@example.edu" -> "i***@example.edu"
export function maskAddress(value) {
  if (!value) return '(not set)';
  const at = value.lastIndexOf('@');
  if (at < 1) return '***';
  return `${value[0]}***${value.slice(at)}`;
}

export function maskText(text, secrets = []) {
  let out = String(text ?? '');
  for (const s of secrets) if (s) out = out.split(s).join('***');
  return out.replace(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, maskAddress)
    .replace(/\s+/g, ' ').trim().slice(0, 200);
}

const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);

// RFC 2047 encoded words (UTF-8, base64), split on code-point boundaries so each
// word stays within 75 characters; folded onto continuation lines.
export function encodeHeaderValue(value) {
  if (isAscii(value)) return value;
  const words = [];
  let chunk = '';
  for (const ch of value) {
    if (Buffer.byteLength(chunk + ch) > 45) { words.push(chunk); chunk = ''; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w).toString('base64')}?=`).join('\r\n ');
}

function formatDate(date) { return date.toUTCString().replace(/GMT$/, '+0000'); }

export function createMessageId(fromAddress) {
  return `<study-${randomUUID()}@${fromAddress.slice(fromAddress.lastIndexOf('@') + 1)}>`;
}

// Returns the full RFC 5322 message with CRLF line endings.
export function buildMessage({ from, to, subject, body, messageId, inReplyTo = null, references = [], date = new Date() }) {
  if (!isAddress(from)) throw new SmtpError('message', null, 'invalid From address');
  if (!isAddress(to)) throw new SmtpError('message', null, 'invalid To address');
  if (/[\r\n]/.test(subject)) throw new SmtpError('message', null, 'subject contains a line break');
  const text = String(body).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const sevenBit = /^[\x00-\x7f]*$/.test(text) && lines.every((l) => l.length <= 998);
  const headers = [
    `Date: ${formatDate(date)}`,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Message-ID: ${messageId}`,
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${[...references, inReplyTo].join(' ')}`);
  headers.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    `Content-Transfer-Encoding: ${sevenBit ? '7bit' : 'base64'}`);
  const encoded = sevenBit ? lines.join('\r\n')
    : Buffer.from(text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').replace(/\r\n$/, '');
  return `${headers.join('\r\n')}\r\n\r\n${encoded}\r\n`;
}

// Escape lines that start with "." for the DATA phase (RFC 5321 4.5.2).
export function dotStuff(raw) { return raw.replace(/(^|\r\n)\./g, '$1..'); }

class SmtpSession {
  constructor(socket, timeoutMs) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.buffer = '';
    this.pending = [];
    this.responses = [];
    this.waiter = null;
    this.failure = null;
    socket.setEncoding?.('utf8');
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('error', (e) => this.fail(new SmtpError('connection', null, e.code ?? 'socket error')));
    socket.on('close', () => this.fail(new SmtpError('connection', null, 'closed by server')));
  }
  onData(chunk) {
    this.buffer += chunk;
    let i;
    while ((i = this.buffer.indexOf('\r\n')) >= 0) {
      const line = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 2);
      const m = /^(\d{3})([ -]?)(.*)$/.exec(line);
      if (!m) { this.fail(new SmtpError('response', null, 'malformed reply')); return; }
      this.pending.push(m[3]);
      if (m[2] !== '-') {
        this.responses.push({ code: Number(m[1]), lines: this.pending });
        this.pending = [];
      }
    }
    this.wake();
  }
  fail(error) { if (!this.failure) this.failure = error; this.wake(); }
  wake() {
    if (!this.waiter) return;
    const { resolve, reject, timer } = this.waiter;
    if (this.responses.length) { this.waiter = null; clearTimeout(timer); resolve(this.responses.shift()); }
    else if (this.failure) { this.waiter = null; clearTimeout(timer); reject(this.failure); }
  }
  read() {
    if (this.responses.length) return Promise.resolve(this.responses.shift());
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiter = null; reject(new SmtpError('response', null, 'timed out')); }, this.timeoutMs);
      this.waiter = { resolve, reject, timer };
    });
  }
  async expect(stage, codes, secrets) {
    const r = await this.read();
    if (!codes.includes(r.code)) throw new SmtpError(stage, r.code, maskText(r.lines.join(' '), secrets));
    return r;
  }
  write(data) { this.socket.write(data); }
  close() { this.socket.end?.(); this.socket.destroy?.(); }
}

function tlsConnect({ host, port, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, minVersion: 'TLSv1.2' });
    const timer = setTimeout(() => { socket.destroy(); reject(new SmtpError('connection', null, 'timed out')); }, timeoutMs);
    socket.once('secureConnect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('error', (e) => { clearTimeout(timer); reject(new SmtpError('connection', null, e.code ?? 'TLS error')); });
  });
}

// Transport interface used by send.mjs: { send({ from, to, raw }) -> { response } }.
// `connect` is injectable so tests can use an in-process fake server.
export function createSmtpTransport({ user, pass, host = 'smtp.gmail.com', port = 465, connect = tlsConnect, timeoutMs = 30000, clientName = 'localhost' } = {}) {
  if (!isAddress(user)) throw new SmtpError('setup', null, 'sender address is missing or invalid');
  const password = String(pass ?? '').replace(/\s+/g, '');
  if (!password) throw new SmtpError('setup', null, 'app password is missing');
  const secrets = [password, String(pass ?? '')];
  return {
    async send({ from, to, raw }) {
      if (from.toLowerCase() !== user.toLowerCase()) throw new SmtpError('setup', null, 'From must be the authenticated sender');
      if (!isAddress(to)) throw new SmtpError('setup', null, 'exactly one valid recipient is required');
      const session = new SmtpSession(await connect({ host, port, timeoutMs }), timeoutMs);
      try {
        await session.expect('greeting', [220], secrets);
        session.write(`EHLO ${clientName}\r\n`);
        const ehlo = await session.expect('EHLO', [250], secrets);
        const auth = ehlo.lines.find((l) => /^AUTH[ =]/i.test(l));
        if (!auth || !/\bPLAIN\b/i.test(auth)) throw new SmtpError('AUTH', null, 'server does not offer AUTH PLAIN');
        session.write(`AUTH PLAIN ${Buffer.from(`\u0000${user}\u0000${password}`).toString('base64')}\r\n`);
        await session.expect('AUTH', [235], secrets);
        session.write(`MAIL FROM:<${from}>\r\n`);
        await session.expect('MAIL FROM', [250], secrets);
        session.write(`RCPT TO:<${to}>\r\n`);
        await session.expect('RCPT TO', [250, 251], secrets);
        session.write('DATA\r\n');
        await session.expect('DATA', [354], secrets);
        const data = dotStuff(raw);
        session.write(`${data}${data.endsWith('\r\n') ? '' : '\r\n'}.\r\n`);
        const done = await session.expect('message', [250], secrets);
        session.write('QUIT\r\n');
        await session.read().catch(() => {});
        return { response: maskText(done.lines.join(' '), secrets) };
      } finally {
        session.close();
      }
    },
  };
}
