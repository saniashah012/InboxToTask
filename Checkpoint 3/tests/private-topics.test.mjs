// Private topics are literal word lists checked in backend code before any model
// call. Fictional example.org mail and an injected model only; no live calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedTerms, containsBlockedWord, matchText, STARTER_BLOCKED_WORDS } from '../app/pipeline/private-topics.mjs';
import { prepareInput, semanticPreferences } from '../app/pipeline/core.mjs';
import { retrieveGmail } from '../app/pipeline/gmail-retrieval.mjs';
import { createGmailProcessor } from '../app/pipeline/gmail-processor.mjs';
import { selectTaskContext } from '../app/pipeline/task-context.mjs';

const base64url = text => btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const date = '2026-11-05T12:00:00Z';
const gmailMessage = (id, {subject='Assignment', body='Please submit the report.', sentAt=date}={}) => ({
  id,threadId:'thread1',internalDate:String(Date.parse(sentAt)),payload:{mimeType:'text/plain',
    headers:[{name:'From',value:'teacher@example.org'},{name:'Subject',value:subject}],body:{data:base64url(body)}},
});
const topics = {include:[],exclude:['health','my club'],blockedWords:{health:['diagnosis','lab results'],'my club':['chess club']}};
const rules = {allow:{senders:[],domains:['example.org']},block:{senders:[],domains:[],subjectKeywords:[]}};
const limits = {maxMessages:5,maxAgeDays:90,maxMessageChars:12000,maxTotalChars:24000};
function setup(messages, thread=[]) {
  const calls=[]; const inputs=[];
  return {calls,inputs,options:{
    work:{start:'2026-10-29T12:00:00Z',end:date,rules,contextLimits:{...limits},semanticPreferences:topics},
    check:async()=>{},consume:async input=>{inputs.push(input);return {modelCalls:1};},
    gmail:{list:async()=>({ids:messages.map(m=>m.id),next:null}),
      metadata:async id=>{calls.push(`metadata:${id}`);return messages.find(m=>m.id===id);},
      full:async id=>{calls.push(`body:${id}`);return [...messages,...thread].find(m=>m.id===id);},
      thread:async()=>thread}}};
}

test('matching ignores case, accents and punctuation but requires whole words or phrases',()=>{
  const terms=blockedTerms({exclude:['x'],blockedWords:{x:['loan','lab results','w-2','café']}});
  for (const text of ['Your LOAN is approved.','The lab   results are in','Attach your W-2.','Meet at the Cafe']) assert.equal(containsBlockedWord([text],terms),true,text);
  for (const text of ['Two loans','Sloane wrote','lab, then results','Submit the report.']) assert.equal(containsBlockedWord([text],terms),false,text);
  assert.equal(containsBlockedWord(['anything'],[]),false);
  assert.equal(matchText('  A-b  '),' a b ');
});

test('suggested topics turn on reviewed starter lists; custom topics block their own name',()=>{
  const p=semanticPreferences({include:[],exclude:['Health','Rowing team']});
  assert.deepEqual(p.blockedWords.health,STARTER_BLOCKED_WORDS.health);
  assert.deepEqual(p.blockedWords['rowing team'],['rowing team']);
  for (const list of Object.values(STARTER_BLOCKED_WORDS)) assert.equal(new Set(list).size,list.length);
  assert.throws(()=>semanticPreferences({include:[],exclude:['x'],blockedWords:{x:[]}}),/INVALID_SEMANTIC_PREFERENCES/);
  assert.throws(()=>semanticPreferences({include:[],exclude:['x'],blockedWords:{x:['!!!']}}),/INVALID_SEMANTIC_PREFERENCES/);
  assert.throws(()=>semanticPreferences({include:[],exclude:[],other:[]}),/INVALID_SEMANTIC_PREFERENCES/);
});

test('a subject match skips the email before its body is fetched',async()=>{
  const s=setup([gmailMessage('private',{subject:'Your Lab Results'}),gmailMessage('normal')]);
  const r=await retrieveGmail(s.options);
  assert.deepEqual(s.calls.filter(c=>c.startsWith('body:')),['body:normal']);
  assert.deepEqual(s.inputs.map(i=>i.message.id),['normal']);
  assert.equal(r.counts.privateTopic,1);assert.equal(r.counts.modelCalls,1);assert.equal(r.counts.prepared,1);
});

test('a body match reaches no model and creates nothing; unmatched mail is unchanged',async()=>{
  const s=setup([gmailMessage('private',{body:'The diagnosis is attached. Please reply by Friday.'}),gmailMessage('normal')]);
  const r=await retrieveGmail(s.options);
  assert.deepEqual(s.inputs.map(i=>i.message.id),['normal']);
  assert.equal(s.inputs[0].message.body,'Please submit the report.');
  assert.deepEqual(s.inputs[0].retrievalWarnings,[]);
  assert.equal(r.counts.privateTopic,1);assert.equal(r.counts.failed,0);assert.equal(r.backlog,false);
});

test('earlier thread messages with a blocked word are excluded with a generic warning',async()=>{
  const s=setup([gmailMessage('current')],[
    gmailMessage('subjectHit',{subject:'Chess Club dues',sentAt:'2026-11-04T12:00:00Z'}),
    gmailMessage('bodyHit',{body:'Lab results came back.',sentAt:'2026-11-03T12:00:00Z'}),
    gmailMessage('clean',{body:'Use the template.',sentAt:'2026-11-02T12:00:00Z'})]);
  await retrieveGmail(s.options);
  assert.ok(!s.calls.includes('body:subjectHit'),'a subject match fetches no body');
  assert.deepEqual(s.inputs[0].threadContext.map(m=>m.id),['clean']);
  assert.deepEqual(s.inputs[0].retrievalWarnings,['Some thread history was excluded by your settings.']);
  assert.ok(!JSON.stringify(s.inputs[0]).includes('diagnosis') && !JSON.stringify(s.inputs[0].retrievalWarnings).includes('health'));
});

const input = (body, extra={}) => ({contract:'gmail-v1',user:{email:'student@example.org',timeZone:'America/Chicago'},analysisTime:'2026-11-05T13:00:00Z',rules,
  message:{id:'m1',threadId:'thread1',from:'teacher@example.org',subject:'Assignment',labels:[],sentAt:date,body},
  threadContext:[],contextLimits:limits,semanticPreferences:topics,existingTaskContext:[],...extra});

test('the model payload never carries excluded topics or their words, and a match is skipped',()=>{
  const prepared=prepareInput(input('Please submit the report.'),{});
  assert.deepEqual(prepared.payload.semanticPreferences,{include:[]});
  const sent=JSON.stringify(prepared.payload);
  for (const word of ['health','diagnosis','lab results','chess club','my club']) assert.ok(!sent.includes(word),word);
  assert.deepEqual(prepareInput(input('See the DIAGNOSIS.'),{}),{status:'skipped',messageId:'m1',reason:'PRIVATE_TOPIC'});
  const withContext=prepareInput(input('Please submit the report.',{threadContext:[
    {id:'c1',threadId:'thread1',from:'teacher@example.org',subject:'Re',labels:[],sentAt:'2026-11-04T12:00:00Z',body:'Chess club meets Monday.'}]}),{});
  assert.deepEqual(withContext.payload.threadContext,[]);
  assert.deepEqual(withContext.payload.contextWarnings,['Some thread history was excluded by your settings.']);
});

const ID='11111111-1111-4111-8111-111111111111', ID2='22222222-2222-4222-8222-222222222222';
const fields=action=>({action,requirements:[],condition:null,deadline:null});
const source={id:'old',threadId:'thread1',from:'teacher@example.org',subject:'Assignment',sentAt:'2026-11-01T12:00:00Z',labels:[]};
const taskRows=[{id:ID,revision:1,acceptedFields:fields('Bring lab results to the chess club'),sources:[source]},
  {id:ID2,revision:1,acceptedFields:fields('Submit the report'),sources:[source]}];

test('existing tasks containing a blocked word are not offered as context',()=>{
  const message={...input('Please submit the report.').message};
  const terms=semanticPreferences(topics).terms;
  assert.deepEqual(selectTaskContext(taskRows,message,rules,undefined,terms).tasks.map(t=>t.id),[ID2]);
  assert.deepEqual(selectTaskContext(taskRows,message,rules).tasks.map(t=>t.id).sort(),[ID,ID2]);
  const prepared=prepareInput(input('Please submit the report.',{existingTaskContext:[
    {id:ID,revision:1,acceptedFields:fields('Bring lab results'),sourceMessageIds:['old']}]}),{});
  assert.deepEqual(prepared.payload.existingTaskContext,[]);
});

test('the processor makes zero model calls and stores nothing for a blocked email',async()=>{
  const rpcCalls=[]; const payloads=[];
  const rpc=async(name)=>{rpcCalls.push(name);
    if(name==='gmail_task_context') return taskRows;
    if(name==='gmail_process_claim') return {state:'claimed',jobId:'job',leaseToken:'lease'};
    return {};};
  const generate=async({payload})=>{payloads.push(payload);return {value:{category:'Passive',confidence:90,summary:'A report reminder.',explanation:'Informational.',
    evidence:{messageId:'m1',quote:'Please submit the report.'},tasks:[],waitingFor:[],suggestedFollowUps:[],uncertainties:[],
    topicRelevance:{decision:'relevant',reason:'No topic restrictions.'},taskChanges:[]},usage:{}};};
  const processor=createGmailProcessor({rpc,user:{id:'u1',email:'student@example.org'},work:{lease:'w',end:'2026-11-05T13:00:00Z',semanticPreferences:topics},
    settings:{contextLimits:limits,model:'test-model',maxOutputTokens:8192,maxAttempts:1,timeoutMs:60000},systemPrompt:'Fictional injected model.',generate});
  const email=body=>({message:{id:'m1',threadId:'thread1',from:'teacher@example.org',subject:'Assignment',labels:[],sentAt:date,body},threadContext:[],rules,contextLimits:limits});

  assert.deepEqual(await processor(email('Your diagnosis is ready.')),{modelCalls:0,privateTopic:true});
  assert.equal(payloads.length,0);
  assert.ok(!rpcCalls.includes('gmail_process_claim') && !rpcCalls.includes('gmail_process_finish'),'nothing is claimed or saved');

  const saved=await processor(email('Please submit the report.'));
  assert.equal(saved.modelCalls,1);assert.equal(payloads.length,1);
  assert.deepEqual(payloads[0].existingTaskContext.map(t=>t.id),[ID2]);
  const sent=JSON.stringify(payloads[0]);
  for (const word of ['health','diagnosis','lab results','chess club']) assert.ok(!sent.includes(word),word);
});
