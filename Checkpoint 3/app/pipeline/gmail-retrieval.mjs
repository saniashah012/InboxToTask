import { address, filterMessage } from './core.mjs';

const problem = code => Object.assign(new Error(code), { code });
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
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
    const params = new URLSearchParams({ format, fields: format === 'metadata' ? 'id,threadId,internalDate,payload(headers)' : 'id,threadId,internalDate,payload' });
    if (format === 'metadata') for (const header of ['From','Subject']) params.append('metadataHeaders',header);
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
      const params = new URLSearchParams({ format: 'metadata',fields:'id,messages(id,threadId,internalDate,payload(headers))' });
      for (const header of ['From','Subject']) params.append('metadataHeaders',header);
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
  const header = name => {
    const found = headers.filter(h => typeof h.name === 'string' && h.name.toLowerCase() === name);
    if (found.length !== 1 || typeof found[0].value !== 'string') throw problem('GMAIL_INVALID_RESPONSE');
    return found[0].value;
  };
  let from; try { from = address(header('from')); } catch { throw problem('GMAIL_INVALID_RESPONSE'); }
  const subject = header('subject');
  const sentAt = new Date(Number(data.internalDate));
  if (subject.length > 1000 || !Number.isFinite(sentAt.valueOf())) throw problem('GMAIL_INVALID_RESPONSE');
  return { id: data.id, threadId: data.threadId, from, subject, sentAt: sentAt.toISOString(), labels: [] };
}

function htmlText(html) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
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
  const counts = { candidates:0, permitted:0, blocked:0, prepared:0, failed:0, contextBodies:0, modelCalls:0 };
  let pending = [...(work.continuation?.pending ?? [])]; let next = work.continuation?.next ?? null;
  let listed = !!work.continuation && !work.continuation.unlisted; let lastError = null; let requests = 0; let metadataRecords = 0;
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
    try {
      await boundary(); const current = gmailMetadata(await gmail.metadata(messageId)); counts.candidates++; metadataRecords++;
      if (filterMessage(current,work.rules) !== 'PERMITTED') { counts.blocked++; pending.shift(); continue; }
      if (Date.parse(current.sentAt)<Date.parse(work.start) || Date.parse(current.sentAt)>Date.parse(work.end)) { pending.shift(); continue; }
      counts.permitted++;
      await boundary(); const full = await gmail.full(messageId);
      if (JSON.stringify(gmailMetadata(full)) !== JSON.stringify(current)) throw problem('GMAIL_METADATA_CHANGED');
      const body = gmailBody(full,limits.maxMessageChars);
      let used = body.length; const context = []; const retrievalWarnings=[];
      if (!limits.maxMessages) retrievalWarnings.push('Earlier email context is disabled; verify references to previous requests.');
      if (used > limits.maxTotalChars || !body) throw problem('GMAIL_BODY_LIMIT');
      if (limits.maxMessages) {
        await boundary(); const thread = await gmail.thread(current.threadId); metadataRecords += thread.length;
        if (metadataRecords > 500) throw problem('SCAN_RETRIEVAL_LIMIT');
        const threadMetadata=thread.map(gmailMetadata);
        if(threadMetadata.some(m=>m.id!==messageId&&filterMessage(m,work.rules)!=='PERMITTED')) retrievalWarnings.push('Some thread history was excluded by current source permissions.');
        const eligible = threadMetadata.filter(m => m.id !== messageId && m.threadId === current.threadId
          && Date.parse(m.sentAt) <= Date.parse(current.sentAt)
          && Date.parse(current.sentAt)-Date.parse(m.sentAt) <= limits.maxAgeDays*86400000
          && filterMessage(m,work.rules) === 'PERMITTED')
          .sort((a,b)=>Date.parse(b.sentAt)-Date.parse(a.sentAt));
        if(eligible.length>limits.maxMessages)retrievalWarnings.push('Some earlier history was omitted by the message-count limit.');
        for (const meta of eligible.slice(0,limits.maxMessages)) {
          await boundary(); const earlier = await gmail.full(meta.id); counts.contextBodies++;
          if (JSON.stringify(gmailMetadata(earlier)) !== JSON.stringify(meta)) throw problem('GMAIL_METADATA_CHANGED');
          let text;
          try{text=gmailBody(earlier,limits.maxMessageChars);}catch(error){if(error.code==='GMAIL_BODY_LIMIT'||error.code==='GMAIL_BODY_ENCODING'){retrievalWarnings.push('Some permitted history could not fit or decode within message limits.');continue;}throw error;}
          if (used+text.length>limits.maxTotalChars) {retrievalWarnings.push('Some earlier history was omitted by the total character limit.');continue;}
          context.push({...meta,body:text}); used += text.length;
        }
      }
      await boundary();
      const result = await consume({ message:{...current,body},threadContext:context.reverse(),rules:work.rules,contextLimits:limits,retrievalWarnings:[...new Set(retrievalWarnings)] },{remainingMs:90000-(now()-started)});
      counts.modelCalls += result?.modelCalls ?? 0; counts.prepared++; pending.shift();
    } catch (error) {
      const code = error?.code ?? 'GMAIL_UNAVAILABLE'; lastError = code;
      if (['GMAIL_BODY_LIMIT','GMAIL_BODY_ENCODING','GMAIL_CONTEXT_LIMIT','GMAIL_INVALID_RESPONSE','GMAIL_METADATA_CHANGED','GMAIL_RESPONSE_TOO_LARGE'].includes(code)) {
        // Stop with this ID pending: no silent loss of coverage.
        counts.failed++;
      }
      break;
    }
  }
  return { counts, error:lastError, backlog:pending.length>0 || !!next || !listed,
    continuation:pending.length || next || !listed ? {pending,next,unlisted:!listed} : null };
}
