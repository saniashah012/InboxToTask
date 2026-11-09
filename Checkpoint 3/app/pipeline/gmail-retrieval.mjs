import { address, cleanBody, filterMessage } from './core.mjs';

const problem = code => Object.assign(new Error(code), { code });
// Raw decoded text before quote cleanup; configured caps apply to the cleaned text.
const RAW_BODY_CHARS = 200000;
const MAX_RETRY_ATTEMPTS = 3;
const MAX_TRACKED_FAILURES = 50;
// This message cannot proceed now, but later mail can. Everything else stops the
// scan with the current ID pending: rate limits, budgets, auth and permission changes.
const MESSAGE_FAILURES = new Set(['GMAIL_BODY_LIMIT','GMAIL_BODY_ENCODING','GMAIL_BODY_EMPTY','GMAIL_CONTEXT_LIMIT','GMAIL_INVALID_RESPONSE',
  'GMAIL_METADATA_CHANGED','GMAIL_RESPONSE_TOO_LARGE','GMAIL_MESSAGE_REVIEW_REQUIRED','MODEL_INPUT_TOO_LARGE','INVALID_TASK_CONTEXT',
  'GMAIL_EXTRACTION_FAILED','STORAGE_RETRY_LATER','STORAGE_ATTEMPT_LIMIT']);
// The message list skips Spam and Trash, but thread and single-message reads do not.
const hiddenFromScans = data => Array.isArray(data?.labelIds) && data.labelIds.some(label => label === 'SPAM' || label === 'TRASH');
const CONTEXT_OMISSIONS = new Set(['GMAIL_BODY_LIMIT','GMAIL_BODY_ENCODING','GMAIL_INVALID_RESPONSE','GMAIL_METADATA_CHANGED','GMAIL_RESPONSE_TOO_LARGE','GMAIL_METADATA_UNVERIFIABLE']);
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const METADATA_HEADERS = ['From','Subject','Authentication-Results'];
const domainOf = value => typeof value === 'string' && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value) ? value : null;
const aligned = (signer, from) => signer === from || from.endsWith(`.${signer}`) || signer.endsWith(`.${from}`);

// An allowlist rule names a sender, so it grants access only when Gmail's own
// receiving server recorded an authenticated, From-aligned result. Only the first
// Authentication-Results header is read: Gmail adds it above any copies a sender wrote.
export function senderAuthenticated(data, from) {
  const fromDomain = typeof from === 'string' ? from.split('@')[1] : null;
  const headers = data?.payload?.headers;
  if (!fromDomain || !Array.isArray(headers)) return false;
  const first = headers.find(h => typeof h?.name === 'string' && h.name.toLowerCase() === 'authentication-results');
  if (typeof first?.value !== 'string' || first.value.length > 8000) return false;
  const parts = first.value.replace(/\((?:[^()\\]|\\.)*\)/g, ' ').toLowerCase().split(';').map(p => p.trim().replace(/\s+/g, ' '));
  if (parts.shift() !== 'mx.google.com') return false;
  const property = (part, key) => part.match(new RegExp(`(?:^|\\s)${key.replace('.', '\\.')}=(\\S+)`))?.[1] ?? null;
  return parts.some(part => {
    if (/^dmarc=pass(\s|$)/.test(part)) return domainOf(property(part, 'header.from')) === fromDomain;
    if (/^dkim=pass(\s|$)/.test(part)) {
      const signer = domainOf(property(part, 'header.d')) ?? domainOf(property(part, 'header.i')?.split('@').pop());
      return !!signer && aligned(signer, fromDomain);
    }
    return false;
  });
}
const permitted = (data, meta, rules) => filterMessage(meta, rules) === 'PERMITTED' && senderAuthenticated(data, meta.from);
async function boundedJson(response, cap) {
  if (!response.body) throw problem('GMAIL_UNAVAILABLE');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > cap) { await reader.cancel(); throw problem('GMAIL_RESPONSE_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw problem('GMAIL_INVALID_RESPONSE'); }
}

// Fixed endpoint and backend token supplier. No raw provider prose escapes.
export function createGmailClient({ accessToken, fetchImpl = fetch }) {
  const get = async (path, params, cap) => {
    const token = await accessToken();
    let response;
    try {
      response = await fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/${path}?${params}`, {
        headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
      });
    } catch { throw problem('GMAIL_UNAVAILABLE'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw problem(response.status === 429 ? 'GMAIL_RATE_LIMITED' : [401,403].includes(response.status) ? 'GMAIL_RECONNECT_REQUIRED' : 'GMAIL_UNAVAILABLE');
    }
    return boundedJson(response, cap);
  };
  const message = async (messageId, format) => {
    if (!id(messageId)) throw problem('GMAIL_INVALID_RESPONSE');
    const params = new URLSearchParams({ format, fields: format === 'metadata' ? 'id,threadId,labelIds,internalDate,payload(headers)' : 'id,threadId,internalDate,payload' });
    if (format === 'metadata') for (const header of METADATA_HEADERS) params.append('metadataHeaders',header);
    return get(`messages/${messageId}`, params, format === 'full' ? 2000000 : 16000);
  };
  return {
    async list(start, end, pageToken) {
      const params = new URLSearchParams({ maxResults: '10', includeSpamTrash: 'false', fields:'messages/id,nextPageToken',
        q: `after:${Math.floor(Date.parse(start)/1000)} before:${Math.ceil(Date.parse(end)/1000)}` });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await get('messages', params, 16000);
      if ((data.messages && (!Array.isArray(data.messages) || data.messages.length > 10 || !data.messages.every(m => id(m.id))))
        || (data.nextPageToken && (typeof data.nextPageToken !== 'string' || data.nextPageToken.length > 2000))) throw problem('GMAIL_INVALID_RESPONSE');
      return { ids: (data.messages ?? []).map(m => m.id), next: data.nextPageToken ?? null };
    },
    metadata: messageId => message(messageId, 'metadata'),
    full: messageId => message(messageId, 'full'),
    async thread(threadId) {
      if (!id(threadId)) throw problem('GMAIL_INVALID_RESPONSE');
      const params = new URLSearchParams({ format: 'metadata',fields:'id,messages(id,threadId,labelIds,internalDate,payload(headers))' });
      for (const header of METADATA_HEADERS) params.append('metadataHeaders',header);
      const data = await get(`threads/${threadId}`,params,100000);
      if (!Array.isArray(data.messages) || data.messages.length > 100) throw problem('GMAIL_CONTEXT_LIMIT');
      return data.messages;
    },
  };
}

export function gmailMetadata(data) {
  if (!id(data?.id) || !id(data.threadId) || !/^\d{1,16}$/.test(String(data.internalDate))) throw problem('GMAIL_INVALID_RESPONSE');
  const headers = data.payload?.headers;
  if (!Array.isArray(headers) || headers.length > 200) throw problem('GMAIL_INVALID_RESPONSE');
  const matching = name => headers.filter(h => typeof h.name === 'string' && h.name.toLowerCase() === name);
  const single = rows => {
    if (rows.length !== 1 || typeof rows[0].value !== 'string') throw problem('GMAIL_METADATA_UNVERIFIABLE');
    return rows[0].value;
  };
  // Rules cannot be evaluated without one sender and one subject, so this is treated
  // as not permitted. A message with no Subject header has an empty subject.
  let from; try { from = address(single(matching('from'))); } catch { throw problem('GMAIL_METADATA_UNVERIFIABLE'); }
  const subjects = matching('subject');
  const subject = subjects.length ? single(subjects) : '';
  const sentAt = new Date(Number(data.internalDate));
  if (subject.length > 1000) throw problem('GMAIL_METADATA_UNVERIFIABLE');
  if (!Number.isFinite(sentAt.valueOf())) throw problem('GMAIL_INVALID_RESPONSE');
  return { id: data.id, threadId: data.threadId, from, subject, sentAt: sentAt.toISOString(), labels: [] };
}

const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
const hiddenElement = attrs => {
  if (/(?:^|\s)hidden(?:\s|=|\/|$)/i.test(attrs)) return true;
  const style = attrs.match(/(?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const css = style ? (style[1] ?? style[2] ?? style[3]) : '';
  return /display\s*:\s*none|visibility\s*:\s*hidden|(?:^|[;\s])(?:font-size|opacity|max-height)\s*:\s*0(?![.\d]*[1-9])/i.test(css);
};
// Drop markup a mail client does not show, so extraction sees what the reader sees.
function visibleHtml(html) {
  html = html.replace(/<!--[\s\S]*?(?:-->|$)/g,' ').replace(/<(head|title|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
  const tag = /<\s*(\/)?\s*([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  let out = '', last = 0, hiddenTag = null, depth = 0, m;
  while ((m = tag.exec(html))) {
    const [all, close, rawName, attrs] = m, name = rawName.toLowerCase();
    const opens = !close && !VOID_TAGS.has(name) && !/\/\s*$/.test(attrs);
    if (hiddenTag === null) {
      out += html.slice(last, m.index);
      if (opens && hiddenElement(attrs)) { hiddenTag = name; depth = 1; } else out += all;
    } else if (name === hiddenTag) {
      if (close) depth--; else if (opens) depth++;
      if (!depth) { hiddenTag = null; out += ' '; }
    }
    last = tag.lastIndex;
  }
  return hiddenTag === null ? out + html.slice(last) : out;
}
function htmlText(html) {
  return visibleHtml(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/<\s*(br|\/p|\/div|\/li)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
      if (entity.startsWith('#')) {
        const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : Number(entity.slice(1));
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
      }
      return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[entity.toLowerCase()];
    });
}
export function gmailBody(data, maxChars) {
  let parts = 0;
  const walk = (part, depth = 0) => {
    if (!part || ++parts > 100 || depth > 12) throw problem('GMAIL_BODY_LIMIT');
    if (part.filename || part.mimeType === 'message/rfc822') return '';
    if (part.mimeType?.startsWith('multipart/')) {
      if (!Array.isArray(part.parts)) return '';
      if (part.mimeType === 'multipart/alternative') {
        const plain = part.parts.find(p => p.mimeType === 'text/plain');
        return plain ? walk(plain, depth+1) : walk(part.parts.find(p => p.mimeType === 'text/html') ?? part.parts[0],depth+1);
      }
      const text = part.parts.map(p => walk(p,depth+1)).filter(Boolean).join('\n');
      if (text.length > maxChars) throw problem('GMAIL_BODY_LIMIT');
      return text;
    }
    if (!['text/plain','text/html'].includes(part.mimeType) || !part.body?.data) return '';
    if (typeof part.body.data !== 'string' || part.body.data.length > 500000 || !/^[\w-]*={0,2}$/.test(part.body.data)) throw problem('GMAIL_BODY_LIMIT');
    let text;
    try {
      const binary = atob(part.body.data.replace(/-/g,'+').replace(/_/g,'/'));
      text = new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
    } catch { throw problem('GMAIL_BODY_ENCODING'); }
    if (part.mimeType === 'text/html') text = htmlText(text);
    if (text.length > maxChars) throw problem('GMAIL_BODY_LIMIT');
    return text.trim();
  };
  return walk(data.payload);
}

// All bodies remain transient. check() fences each external retrieval boundary.
// consume is backend-only; the retrieval endpoint supplies a no-model consumer.
export async function retrieveGmail({ gmail, work, check, consume, now = Date.now }) {
  const started = now(); const limits = work.contextLimits;
  const counts = { candidates:0, permitted:0, blocked:0, skipped:0, prepared:0, reused:0, failed:0, contextBodies:0, modelCalls:0 };
  let pending = [...(work.continuation?.pending ?? [])]; let next = work.continuation?.next ?? null;
  let listed = !!work.continuation && !work.continuation.unlisted; let lastError = null; let requests = 0; let metadataRecords = 0;
  // Failed IDs stay retryable on the next explicit request, up to a fixed attempt count.
  const retry = new Map((work.continuation?.failed ?? []).map(entry => [entry.id, entry]));
  for (const failedId of retry.keys()) if (!pending.includes(failedId)) pending.push(failedId);
  const suppressed = new Set(work.suppressed ?? []);
  const failures = {}; let unresolved = 0;
  const boundary = async () => { await check(); if (++requests > 300 || metadataRecords >= 500) throw problem('SCAN_RETRIEVAL_LIMIT'); if (now()-started > 90000) throw problem('SCAN_TIME_LIMIT'); };
  while (counts.candidates < 200 && counts.permitted < 100) {
    try { await boundary(); } catch (error) { lastError = error.code; break; }
    if (!pending.length) {
      if (listed && !next) break;
      try { await boundary(); const page = await gmail.list(work.start,work.end,next); pending = page.ids; next = page.next; listed = true; }
      catch (error) { lastError = error.code; break; }
      if (!pending.length) { if (!next) break; continue; }
    }
    const messageId = pending[0];
    if (suppressed.has(messageId)) { counts.skipped++; retry.delete(messageId); pending.shift(); continue; }
    try {
      await boundary();
      let current, raw;
      try {
        raw = await gmail.metadata(messageId);
        // A saved continuation can name a message that has since moved to Spam or Trash.
        if (hiddenFromScans(raw)) { counts.skipped++; retry.delete(messageId); pending.shift(); continue; }
        current = gmailMetadata(raw);
      } catch (error) {
        if (error?.code !== 'GMAIL_METADATA_UNVERIFIABLE') throw error;
        counts.candidates++; metadataRecords++; counts.blocked++; retry.delete(messageId); pending.shift(); continue;
      }
      counts.candidates++; metadataRecords++;
      if (!permitted(raw,current,work.rules)) { counts.blocked++; retry.delete(messageId); pending.shift(); continue; }
      if (Date.parse(current.sentAt)<Date.parse(work.start) || Date.parse(current.sentAt)>Date.parse(work.end)) { retry.delete(messageId); pending.shift(); continue; }
      counts.permitted++;
      await boundary(); const full = await gmail.full(messageId);
      if (JSON.stringify(gmailMetadata(full)) !== JSON.stringify(current)) throw problem('GMAIL_METADATA_CHANGED');
      const body = gmailBody(full,RAW_BODY_CHARS);
      const cleanedChars = cleanBody(body).body.length;
      if (!cleanedChars) throw problem('GMAIL_BODY_EMPTY');
      if (cleanedChars > limits.maxMessageChars || cleanedChars > limits.maxTotalChars) throw problem('GMAIL_BODY_LIMIT');
      let used = cleanedChars; const context = []; const retrievalWarnings=[];
      if (!limits.maxMessages) retrievalWarnings.push('Earlier email context is disabled; verify references to previous requests.');
      if (limits.maxMessages) {
        await boundary(); const thread = await gmail.thread(current.threadId); metadataRecords += thread.length;
        if (metadataRecords > 500) throw problem('SCAN_RETRIEVAL_LIMIT');
        let excluded = false;
        const threadMetadata = thread.flatMap(item => {
          try {
            if (item.id !== messageId && hiddenFromScans(item)) {
              if (Number(item.internalDate) <= Date.parse(current.sentAt)) excluded = true;
              return [];
            }
            const meta = gmailMetadata(item);
            if (meta.id !== messageId && (suppressed.has(meta.id) || !permitted(item,meta,work.rules))) {
              // Later mail is never context for this message, so excluding it hides nothing.
              if (Date.parse(meta.sentAt) <= Date.parse(current.sentAt)) excluded = true;
              return [];
            }
            return [meta];
          } catch { excluded = true; return []; }
        });
        if (excluded) retrievalWarnings.push('Some thread history was excluded by current source permissions.');
        const eligible = threadMetadata.filter(m => m.id !== messageId && m.threadId === current.threadId
          && Date.parse(m.sentAt) <= Date.parse(current.sentAt)
          && Date.parse(current.sentAt)-Date.parse(m.sentAt) <= limits.maxAgeDays*86400000)
          .sort((a,b)=>Date.parse(b.sentAt)-Date.parse(a.sentAt));
        if(eligible.length>limits.maxMessages)retrievalWarnings.push('Some earlier history was omitted by the message-count limit.');
        for (const meta of eligible.slice(0,limits.maxMessages)) {
          await boundary();
          // Context is optional: one unusable earlier message becomes a visible
          // warning, so the current message can still be reviewed.
          let text;
          try {
            const earlier = await gmail.full(meta.id); counts.contextBodies++;
            if (JSON.stringify(gmailMetadata(earlier)) !== JSON.stringify(meta)) throw problem('GMAIL_METADATA_CHANGED');
            text = gmailBody(earlier,RAW_BODY_CHARS);
          } catch (error) {
            if (!CONTEXT_OMISSIONS.has(error?.code)) throw error;
            retrievalWarnings.push('Some permitted history could not fit or decode within message limits.'); continue;
          }
          const chars = cleanBody(text).body.length;
          if (chars > limits.maxMessageChars) { retrievalWarnings.push('Some permitted history could not fit or decode within message limits.'); continue; }
          if (used+chars>limits.maxTotalChars) {retrievalWarnings.push('Some earlier history was omitted by the total character limit.');continue;}
          context.push({...meta,body:text}); used += chars;
        }
      }
      await boundary();
      const result = await consume({ message:{...current,body},threadContext:context.reverse(),rules:work.rules,contextLimits:limits,retrievalWarnings:[...new Set(retrievalWarnings)] },{remainingMs:90000-(now()-started)});
      counts.modelCalls += result?.modelCalls ?? 0; counts.prepared++; if (result?.reused) counts.reused++;
      retry.delete(messageId); pending.shift();
    } catch (error) {
      const code = error?.code ?? 'GMAIL_UNAVAILABLE';
      if (code === 'STORAGE_SUPPRESSED') { counts.skipped++; retry.delete(messageId); pending.shift(); continue; }
      if (!MESSAGE_FAILURES.has(code)) { lastError = code; break; }
      counts.failed++; failures[code] = (failures[code] ?? 0)+1; pending.shift();
      // Waiting out a retry window made no attempt, so it must not use one up.
      const attempts = (retry.get(messageId)?.attempts ?? 0)+(code==='STORAGE_RETRY_LATER'?0:1);
      if (attempts >= MAX_RETRY_ATTEMPTS) { retry.delete(messageId); unresolved++; }
      else retry.set(messageId,{id:messageId,code,attempts});
      if (retry.size >= MAX_TRACKED_FAILURES) { lastError = 'SCAN_FAILURE_LIMIT'; break; }
    }
  }
  const remaining = pending.length>0 || !!next || !listed || retry.size>0;
  return { counts, error:lastError, backlog:remaining, failures, unresolved,
    continuation:remaining ? {pending,next,unlisted:!listed,failed:[...retry.values()]} : null };
}
