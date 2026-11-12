import test from 'node:test';
import assert from 'node:assert/strict';
import { createGmailClient, gmailBody, retrieveGmail, senderAuthenticated } from '../app/pipeline/gmail-retrieval.mjs';
import { createGmailScanHandler } from '../app/supabase/functions/_shared/gmail-scan-handler.mjs';

const base64url = text => btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const date = '2026-11-05T12:00:00Z';
const passing = from => `mx.google.com; dkim=pass header.i=@${from.match(/@([^\s>]+)>?\s*(?:\(.*\))?$/)?.[1] ?? 'example.org'} header.s=s1; spf=pass smtp.mailfrom=x; dmarc=pass (p=REJECT) header.from=${from.match(/@([^\s>]+)>?\s*(?:\(.*\))?$/)?.[1] ?? 'example.org'}`;
const message = (id, from='teacher@example.org', sentAt=date, subject='Assignment', auth=passing(from)) => ({
  id,threadId:'thread1',internalDate:String(Date.parse(sentAt)),payload:{mimeType:'text/plain',
    headers:[...(auth===null?[]:[{name:'Authentication-Results',value:auth}]),{name:'From',value:from},{name:'Subject',value:subject}],body:{data:base64url('Please submit the report.')}},
});
const work = () => ({start:'2026-10-29T12:00:00Z',end:date,
  rules:{allow:{senders:[],domains:['example.org']},block:{senders:['blocked@example.org'],domains:[],subjectKeywords:['private']}},
  contextLimits:{maxMessages:5,maxAgeDays:90,maxMessageChars:12000,maxTotalChars:24000}});
function setup(messages, thread=[]) {
  const calls=[]; const inputs=[];
  return {calls,inputs,options:{work:work(),check:async()=>{},consume:async input=>{inputs.push(input);return {modelCalls:0};},
    gmail:{list:async()=>({ids:messages.map(m=>m.id),next:null}),
      metadata:async id=>{calls.push(`metadata:${id}`);return messages.find(m=>m.id===id);},
      full:async id=>{calls.push(`body:${id}`);return [...messages,...thread].find(m=>m.id===id);},thread:async()=>thread}}};
}
test('retrieval filters metadata before bodies and independently permits earlier context',async()=>{
  const s=setup([message('allowed'),message('blocked','blocked@example.org'),message('subject','teacher@example.org',date,'PRIVATE report'),message('subdomain','teacher@sub.example.org')],
    [message('older','teacher@example.org','2026-11-04T12:00:00Z'),message('secret','blocked@example.org','2026-11-03T12:00:00Z'),message('ancient','teacher@example.org','2026-01-01T12:00:00Z')]);
  const result=await retrieveGmail(s.options);
  assert.deepEqual(s.calls.filter(c=>c.startsWith('body:')),['body:allowed','body:older']);
  assert.equal(result.counts.blocked,3);assert.equal(result.counts.modelCalls,0);assert.equal(result.backlog,false);
  assert.deepEqual(s.inputs[0].threadContext.map(m=>m.id),['older']);
});
test('zero context skips thread retrieval; empty allowlist never retrieves bodies',async()=>{
  const s=setup([message('allowed')]);s.options.work.contextLimits.maxMessages=0;
  s.options.gmail.thread=async()=>{throw new Error('must not fetch context');};
  await retrieveGmail(s.options);assert.equal(s.inputs[0].threadContext.length,0);
  s.calls.length=0;s.options.work.rules.allow.domains=[];
  const r=await retrieveGmail(s.options);assert.equal(r.counts.permitted,0);assert.ok(!s.calls.some(c=>c.startsWith('body:')));
});
test('context selects most recent eligible messages then presents chronological order relative to analyzed mail',async()=>{
 const s=setup([message('current')],[message('one','teacher@example.org','2026-11-01T12:00:00Z'),message('three','teacher@example.org','2026-11-03T12:00:00Z'),message('two','teacher@example.org','2026-11-02T12:00:00Z'),message('future','teacher@example.org','2026-11-06T12:00:00Z')]);
 s.options.work.contextLimits.maxMessages=2;await retrieveGmail(s.options);
 assert.deepEqual(s.inputs[0].threadContext.map(m=>m.id),['two','three']);
});
test('changed permission fences body retrieval and leaves pending work for explicit continuation',async()=>{
 const s=setup([message('current')]);let checks=0;
 s.options.check=async()=>{if(++checks===4)throw Object.assign(new Error(),{code:'STORAGE_STALE'});};
 const r=await retrieveGmail(s.options);assert.equal(r.error,'STORAGE_STALE');
 assert.ok(!s.calls.includes('body:current'));assert.deepEqual(r.continuation.pending,['current']);assert.equal(r.counts.modelCalls,0);
});
test('candidate metadata is bounded even when all senders are excluded',async()=>{
 const s=setup([]);s.options.gmail.list=async()=>({ids:Array.from({length:10},(_,i)=>`m${i}`),next:'next'});
 s.options.gmail.metadata=async id=>message(id,'blocked@example.org');
 const r=await retrieveGmail(s.options);assert.ok(r.counts.candidates>0 && r.counts.candidates<=200);assert.equal(r.error,'SCAN_RETRIEVAL_LIMIT');assert.equal(r.backlog,true);assert.equal(r.counts.permitted,0);
});
test('permitted limit preserves IDs and requires Scan more rather than losing a partial page',async()=>{
 const s=setup([]);let i=0;s.options.work.contextLimits.maxMessages=0;
 s.options.gmail.list=async()=>({ids:Array.from({length:10},()=>`m${i++}`),next:'next'});
 s.options.gmail.metadata=async id=>message(id);s.options.gmail.full=async id=>message(id);
 const r=await retrieveGmail(s.options);
 // Independent request budget can stop before the 100-message ceiling.
 assert.ok(r.counts.permitted<=100);assert.equal(r.backlog,true);assert.ok(r.continuation.next);
});
test('rate limits preserve pending coverage without consuming content',async()=>{
 const s=setup([message('current')]);s.options.gmail.full=async()=>{throw Object.assign(new Error('provider secret'),{code:'GMAIL_RATE_LIMITED'});};
 const r=await retrieveGmail(s.options);assert.equal(r.error,'GMAIL_RATE_LIMITED');assert.deepEqual(r.continuation.pending,['current']);assert.equal(s.inputs.length,0);
});
test('a display name cannot supply the sender and ambiguous From headers grant nothing',async()=>{
 const s=setup([message('spoof','"<teacher@example.org>" <evil@outside.test>'),message('multi','teacher@example.org, evil@outside.test'),message('multi2','evil@outside.test, <teacher@example.org>'),message('real','"Teacher, Example" <teacher@example.org> (office)')]);
 const r=await retrieveGmail(s.options);
 assert.deepEqual(s.calls.filter(c=>c.startsWith('body:')),['body:real']);assert.equal(r.counts.blocked,3);assert.equal(r.error,null);
});
test('missing subjects are processed; unverifiable senders are blocked without stopping the scan',async()=>{
 const noSubject=message('nosubject');noSubject.payload.headers=noSubject.payload.headers.filter(h=>h.name!=='Subject');
 const noFrom=message('nofrom');noFrom.payload.headers=noFrom.payload.headers.filter(h=>h.name!=='From');
 const s=setup([noFrom,noSubject,message('after')]);
 const r=await retrieveGmail(s.options);
 assert.deepEqual(s.inputs.map(i=>i.message.id),['nosubject','after']);assert.equal(s.inputs[0].message.subject,'');
 assert.equal(r.counts.blocked,1);assert.equal(r.error,null);assert.ok(!s.calls.includes('body:nofrom'));
});
test('an unverifiable thread message is excluded from context without losing the current message',async()=>{
 const bad=message('badcontext','not an address','2026-11-04T12:00:00Z');
 const s=setup([message('current')],[bad,message('older','teacher@example.org','2026-11-03T12:00:00Z')]);
 const r=await retrieveGmail(s.options);
 assert.deepEqual(s.inputs[0].threadContext.map(m=>m.id),['older']);assert.ok(!s.calls.includes('body:badcontext'));assert.equal(r.error,null);
 assert.ok(s.inputs[0].retrievalWarnings.some(w=>/excluded/.test(w)));
});
test('thread messages in Spam or Trash are never fetched as context, with a visible warning',async()=>{
 const hidden=(id,label,sentAt)=>({...message(id,'teacher@example.org',sentAt),labelIds:[label]});
 const s=setup([message('current')],[hidden('trashed','TRASH','2026-11-04T12:00:00Z'),hidden('spam','SPAM','2026-11-03T12:00:00Z'),{...message('kept','teacher@example.org','2026-11-02T12:00:00Z'),labelIds:['INBOX']}]);
 await retrieveGmail(s.options);
 assert.deepEqual(s.inputs[0].threadContext.map(m=>m.id),['kept']);
 assert.ok(!s.calls.includes('body:trashed'));assert.ok(!s.calls.includes('body:spam'));
 assert.ok(s.inputs[0].retrievalWarnings.some(w=>/excluded/.test(w)));
});
test('a later trashed reply does not warn, and a continuation message now in Trash is skipped unread',async()=>{
 const later={...message('latertrash','teacher@example.org','2026-11-06T12:00:00Z'),labelIds:['TRASH']};
 const s=setup([message('current')],[later]);await retrieveGmail(s.options);
 assert.deepEqual(s.inputs[0].retrievalWarnings,[]);
 const moved=setup([{...message('moved'),labelIds:['TRASH']},message('next')]);
 const r=await retrieveGmail(moved.options);
 assert.ok(!moved.calls.includes('body:moved'));assert.equal(r.counts.skipped,1);assert.deepEqual(moved.inputs.map(i=>i.message.id),['next']);
});
test('an excluded later reply does not warn about history on an earlier message',async()=>{
 const s=setup([message('current')],[message('laterblocked','blocked@example.org','2026-11-06T12:00:00Z')]);
 await retrieveGmail(s.options);
 assert.deepEqual(s.inputs[0].retrievalWarnings,[]);
});
test('waiting out a retry window does not use up the bounded retry attempts',async()=>{
 const s=setup([message('waiting')]);
 s.options.consume=async()=>{throw Object.assign(new Error(),{code:'STORAGE_RETRY_LATER'});};
 let r=await retrieveGmail(s.options);
 for(let attempt=0;attempt<5;attempt++){s.options.work.continuation=r.continuation;r=await retrieveGmail(s.options);}
 assert.equal(r.unresolved,0);assert.equal(r.continuation.failed[0].attempts,0);assert.equal(r.backlog,true);
});
test('one unprocessable message is recorded and later mail still scans; retries are bounded',async()=>{
 const s=setup([message('bad'),message('good')]);const full=s.options.gmail.full;
 s.options.gmail.full=async id=>{if(id==='bad')throw Object.assign(new Error(),{code:'GMAIL_BODY_ENCODING'});return full(id);};
 let r=await retrieveGmail(s.options);
 assert.deepEqual(s.inputs.map(i=>i.message.id),['good']);assert.equal(r.counts.failed,1);assert.equal(r.error,null);assert.equal(r.backlog,true);
 assert.deepEqual(r.failures,{GMAIL_BODY_ENCODING:1});assert.deepEqual(r.continuation.pending,[]);
 for(let attempt=2;attempt<=3;attempt++){
  s.options.work.continuation=r.continuation;r=await retrieveGmail(s.options);assert.equal(r.counts.failed,1);
 }
 assert.equal(r.continuation,null);assert.equal(r.backlog,false);assert.equal(r.unresolved,1);
});
test('model and suppression outcomes for one message do not stop the rest of the scan',async()=>{
 const s=setup([message('deleted'),message('invalid'),message('limit'),message('ok')]);
 const codes={deleted:'STORAGE_SUPPRESSED',invalid:'GMAIL_EXTRACTION_FAILED',limit:'STORAGE_ATTEMPT_LIMIT'};
 s.options.consume=async input=>{if(codes[input.message.id])throw Object.assign(new Error(),{code:codes[input.message.id]});s.inputs.push(input);return {modelCalls:0,reused:true};};
 const r=await retrieveGmail(s.options);
 assert.deepEqual(s.inputs.map(i=>i.message.id),['ok']);assert.equal(r.counts.skipped,1);assert.equal(r.counts.failed,2);assert.equal(r.counts.reused,1);assert.equal(r.error,null);
});
test('scan-wide limits still stop with coverage preserved',async()=>{
 for(const code of ['SCAN_INFERENCE_LIMIT','STORAGE_BUDGET','GMAIL_RECONNECT_REQUIRED']){
  const s=setup([message('one'),message('two')]);s.options.consume=async()=>{throw Object.assign(new Error(),{code});};
  const r=await retrieveGmail(s.options);assert.equal(r.error,code);assert.deepEqual(r.continuation.pending,['one','two']);assert.equal(r.counts.failed,0);
 }
});
test('user-deleted messages are never fetched as current mail or context',async()=>{
 const s=setup([message('gone'),message('current')],[message('deletedcontext','teacher@example.org','2026-11-04T12:00:00Z')]);
 s.options.work.suppressed=['gone','deletedcontext'];
 const r=await retrieveGmail(s.options);
 assert.ok(!s.calls.includes('body:gone'));assert.ok(!s.calls.includes('body:deletedcontext'));assert.equal(r.counts.skipped,1);
 assert.deepEqual(s.inputs[0].threadContext,[]);
});
test('long quoted history does not count against the cleaned message limit',async()=>{
 const body=`Please submit the report.\n${'> quoted line of earlier text\n'.repeat(1000)}`;
 const long=message('long');long.payload.body={data:base64url(body)};
 const s=setup([long]);const r=await retrieveGmail(s.options);
 assert.equal(s.inputs.length,1);assert.equal(r.counts.failed,0);
});
test('a message with only quoted text is recorded as unprocessable, not sent onward',async()=>{
 const quoted=message('quoted');quoted.payload.body={data:base64url('> only quoted text')};
 const s=setup([quoted]);const r=await retrieveGmail(s.options);
 assert.equal(s.inputs.length,0);assert.deepEqual(r.failures,{GMAIL_BODY_EMPTY:1});
});
test('MIME prefers plain text, strips HTML scripts and skips attachments; oversize/unsupported encodings fail',()=>{
 const data=message('m');data.payload={mimeType:'multipart/alternative',parts:[{mimeType:'text/html',body:{data:base64url('<p>HTML</p>')}},message('plain').payload]};
 assert.equal(gmailBody(data,100),'Please submit the report.');
 data.payload={mimeType:'text/html',body:{data:base64url('<script>secret()</script><p>Hello &amp; goodbye</p>')}};
 assert.equal(gmailBody(data,100),'Hello & goodbye');assert.throws(()=>gmailBody(data,3),/GMAIL_BODY_LIMIT/);
 data.payload.filename='attachment.html';assert.equal(gmailBody(data,100),'');
});
test('HTTP adapter fixes mailbox to me, uses metadata before full and sanitizes failures',async()=>{
 const calls=[];const gmail=createGmailClient({accessToken:async()=>'secret-token',fetchImpl:async(url,options)=>{
  calls.push({url,options});return new Response(JSON.stringify(message('m')));
 }});
 await gmail.metadata('m');await gmail.full('m');assert.ok(calls[0].url.includes('/users/me/messages/m?format=metadata'));
 assert.equal(new URL(calls[0].url).searchParams.get('fields'),'id,threadId,labelIds,internalDate,payload(headers)');
 assert.deepEqual(new URL(calls[0].url).searchParams.getAll('metadataHeaders'),['From','Subject','Authentication-Results']);
 assert.ok(calls[1].url.includes('format=full'));assert.equal(calls[0].options.redirect,'error');
 const bad=createGmailClient({accessToken:async()=>'secret-token',fetchImpl:async()=>new Response('private diagnostic',{status:429})});
 await assert.rejects(bad.full('m'),error=>error.code==='GMAIL_RATE_LIMITED'&&!error.message.includes('private'));
});
test('manual endpoint is disabled by default, verifies owner and accepts mode only',async()=>{
 let calls=0;const verifyUser=async token=>token==='valid'?{id:'verified-owner'}:null;
 const request=body=>new Request('http://localhost/gmail_scan',{method:'POST',headers:{authorization:'Bearer valid','content-type':'application/json'},body:JSON.stringify(body)});
 let handler=createGmailScanHandler({verifyUser,scan:async()=>{calls++;}});
 assert.equal((await handler(request({mode:'initial'}))).status,503);assert.equal(calls,0);
 handler=createGmailScanHandler({verifyUser,enabled:true,scan:async(user,mode)=>{calls++;assert.equal(user.id,'verified-owner');return {counts:{modelCalls:0},mode};}});
 assert.equal((await handler(request({mode:'initial',userId:'other'}))).status,400);
 assert.equal((await handler(request({mode:'initial'}))).status,200);assert.equal(calls,1);
 assert.equal((await handler(new Request('http://localhost',{method:'POST'}))).status,401);
});

test('allowlisted senders need an aligned DKIM or DMARC pass recorded by Gmail',()=>{
 const check=(auth,from='teacher@example.org',extra=[])=>senderAuthenticated({payload:{headers:[...(auth===null?[]:[{name:'Authentication-Results',value:auth}]),...extra]}},from);
 assert.equal(check('mx.google.com; dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=example.org'),true);
 assert.equal(check('mx.google.com;\r\n       dkim=pass header.i=@example.org header.s=s1 header.b=abc;\r\n       spf=pass smtp.mailfrom=example.org'),true);
 assert.equal(check('mx.google.com; dkim=pass header.i=@mail.example.org header.s=s1'),true,'relaxed subdomain alignment');
 assert.equal(check('mx.google.com; dkim=pass header.d=example.org','teacher@dept.example.org'),true,'relaxed parent alignment');
 assert.equal(check(null),false,'no result');
 assert.equal(check('mx.google.com; spf=pass smtp.mailfrom=example.org'),false,'SPF alone is not From-aligned');
 assert.equal(check('mx.google.com; dkim=pass header.i=@outside.test; dmarc=fail header.from=example.org'),false,'unaligned signer');
 assert.equal(check('mx.google.com; dkim=pass header.i=@notexample.org'),false,'suffix without a dot boundary');
 assert.equal(check('mx.google.com; dmarc=pass header.from=outside.test'),false);
 assert.equal(check('mx.google.com; dkim=fail header.i=@example.org; dmarc=fail header.from=example.org'),false);
 assert.equal(check('evil.test; dmarc=pass header.from=example.org'),false,'other servers are not trusted');
 assert.equal(check('mx.google.com; dkim=none; dmarc=fail header.from=example.org','teacher@example.org',[{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=example.org'}]),false,'later copies are ignored');
 assert.equal(check('mx.google.com; dmarc=pass header.from=example.org','not-an-address'),false);
});
test('unauthenticated senders are blocked before bodies and excluded from thread context',async()=>{
 const s=setup([message('spoofed','teacher@example.org',date,'Assignment',null),message('failed','teacher@example.org',date,'Assignment','mx.google.com; dkim=fail header.i=@example.org; dmarc=fail header.from=example.org'),message('current')],
   [message('forged-context','teacher@example.org','2026-11-04T12:00:00Z','Assignment','mx.google.com; dmarc=fail header.from=example.org'),message('older','teacher@example.org','2026-11-03T12:00:00Z')]);
 const r=await retrieveGmail(s.options);
 assert.deepEqual(s.calls.filter(c=>c.startsWith('body:')),['body:current','body:older']);
 assert.equal(r.counts.blocked,2);assert.equal(r.error,null);
 assert.deepEqual(s.inputs.map(i=>i.message.id),['current']);
 assert.deepEqual(s.inputs[0].threadContext.map(m=>m.id),['older']);
 assert.ok(s.inputs[0].retrievalWarnings.some(w=>w.includes('excluded')));
});
test('HTML text that a mail client hides never reaches extraction',()=>{
 const html=['<html><head><title>Ignore this title</title></head><body>',
  '<p>Submit the lab report.</p><!-- comment instruction -->',
  '<div style="display: none"><p>hidden instruction one</p><div>nested hidden</div></div>',
  '<span style="font-size:0px;color:#fff">hidden instruction two</span>',
  '<p hidden>hidden instruction three</p><div style=\'visibility:hidden\'>hidden instruction four</div>',
  '<span style="opacity: 0">hidden instruction five</span><span style="font-size:0.9em">Small but visible.</span>',
  '<br><img src="x.png" style="display:none"><p>Due Friday.</p></body></html>'].join('');
 const data=message('m');data.payload={mimeType:'text/html',body:{data:base64url(html)}};
 const text=gmailBody(data,1000);
 for(const kept of ['Submit the lab report.','Small but visible.','Due Friday.']) assert.ok(text.includes(kept),kept);
 for(const dropped of ['title','comment','hidden','nested']) assert.ok(!text.toLowerCase().includes(dropped),dropped);
 data.payload={mimeType:'text/html',body:{data:base64url('<p>Visible.</p><div style="display:none">unclosed hidden')}};
 assert.equal(gmailBody(data,100),'Visible.');
});

test('Gmail failures get their own codes, and a message gone since listing is skipped',async()=>{
  const client=status=>createGmailClient({accessToken:async()=>'secret-token',fetchImpl:async()=>new Response('private diagnostic',{status})});
  const codeOf=async(promise)=>{try{await promise;return null}catch(e){assert.ok(!e.message.includes('private'));return e.code}};
  assert.equal(await codeOf(client(503).list('2026-11-01T00:00:00Z',date)),'GMAIL_SERVER_ERROR');
  assert.equal(await codeOf(client(400).list('2026-11-01T00:00:00Z',date)),'GMAIL_REQUEST_REJECTED');
  assert.equal(await codeOf(client(404).metadata('m')),'GMAIL_MESSAGE_GONE');
  assert.equal(await codeOf(client(401).metadata('m')),'GMAIL_RECONNECT_REQUIRED');
  const timeout=createGmailClient({accessToken:async()=>'t',fetchImpl:async()=>{throw Object.assign(new Error('x'),{name:'TimeoutError'});}});
  assert.equal(await codeOf(timeout.list('2026-11-01T00:00:00Z',date)),'GMAIL_TIMEOUT');
  const offline=createGmailClient({accessToken:async()=>'t',fetchImpl:async()=>{throw new TypeError('network');}});
  assert.equal(await codeOf(offline.list('2026-11-01T00:00:00Z',date)),'GMAIL_UNAVAILABLE');
  // A listed message deleted before it was read is skipped; the rest are processed.
  const s=setup([message('gone'),message('kept')]);
  s.options.gmail.metadata=async id=>{if(id==='gone')throw Object.assign(new Error('GMAIL_MESSAGE_GONE'),{code:'GMAIL_MESSAGE_GONE'});return message(id);};
  const r=await retrieveGmail(s.options);
  assert.equal(r.error,null);assert.equal(r.counts.skipped,1);assert.deepEqual(s.inputs.map(i=>i.message.id),['kept']);
  // An error without a code is reported as unexpected, not as Gmail being unreachable.
  const b=setup([message('m')]);b.options.consume=async()=>{throw new TypeError('bug');};
  assert.equal((await retrieveGmail(b.options)).error,'SCAN_UNEXPECTED_ERROR');
});

test('a list with no matching messages (Gmail 204 No Content) is an empty result, not an outage',async()=>{
  const gmail=createGmailClient({accessToken:async()=>'t',fetchImpl:async()=>new Response(null,{status:204,headers:{'content-type':'application/json; charset=UTF-8'}})});
  assert.deepEqual(await gmail.list('2026-11-12T19:41:00Z','2026-11-12T19:48:00Z'),{ids:[],next:null});
  // End to end: a short automatic-check window with no new email finishes cleanly.
  const r=await retrieveGmail({gmail:{...gmail,metadata:async()=>{throw new Error('not called');}},
    work:{start:'2026-11-12T19:41:00Z',end:'2026-11-12T19:48:00Z',rules:work().rules,contextLimits:work().contextLimits},
    check:async()=>{},consume:async()=>({modelCalls:0})});
  assert.equal(r.error,null);assert.equal(r.backlog,false);assert.equal(r.counts.candidates,0);
});
