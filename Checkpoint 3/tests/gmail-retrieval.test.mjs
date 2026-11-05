import test from 'node:test';
import assert from 'node:assert/strict';
import { createGmailClient, gmailBody, retrieveGmail } from '../app/pipeline/gmail-retrieval.mjs';
import { createGmailScanHandler } from '../app/supabase/functions/_shared/gmail-scan-handler.mjs';

const base64url = text => btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const date = '2026-11-05T12:00:00Z';
const message = (id, from='teacher@example.org', sentAt=date, subject='Assignment') => ({
  id,threadId:'thread1',internalDate:String(Date.parse(sentAt)),payload:{mimeType:'text/plain',
    headers:[{name:'From',value:from},{name:'Subject',value:subject}],body:{data:base64url('Please submit the report.')}},
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
test('rate limits and oversized bodies preserve pending coverage without consuming content',async()=>{
 for(const code of ['GMAIL_RATE_LIMITED','GMAIL_BODY_LIMIT']){
  const s=setup([message('current')]);s.options.gmail.full=async()=>{throw Object.assign(new Error('provider secret'),{code});};
  const r=await retrieveGmail(s.options);assert.equal(r.error,code);assert.deepEqual(r.continuation.pending,['current']);assert.equal(s.inputs.length,0);
 }
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
 assert.equal(new URL(calls[0].url).searchParams.get('fields'),'id,threadId,internalDate,payload(headers)');
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
