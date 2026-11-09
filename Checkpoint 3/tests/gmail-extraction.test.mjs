import test from 'node:test';
import assert from 'node:assert/strict';
import {contentWarnings,extract,prepareInput,validateExtraction} from '../app/pipeline/core.mjs';
import {selectTaskContext} from '../app/pipeline/task-context.mjs';
import {filterRelevantOutput} from '../app/pipeline/gmail-processor.mjs';
const ID='11111111-1111-4111-8111-111111111111';
const fields={action:'Submit research report',requirements:['Keep my edited requirement'],condition:null,deadline:null};
const message={id:'gmail1',threadId:'thread1',from:'teacher@example.org',subject:'Research report',labels:[],sentAt:'2026-11-05T12:00:00Z',body:'Submit research report. The report is now due November 9. The report is cancelled. Also upload the slides.'};
const rules={allow:{senders:[],domains:['example.org']},block:{senders:[],domains:[],subjectKeywords:[]}};
const context=[{id:ID,revision:4,acceptedFields:fields,userEdited:true,sourceMessageIds:['original']}];
const payload=()=>prepareInput({contract:'gmail-v1',user:{email:'student@example.org',timeZone:'America/Chicago'},analysisTime:'2026-11-05T13:00:00Z',rules,message,threadContext:[],contextLimits:{maxMessages:5,maxAgeDays:90,maxMessageChars:12000,maxTotalChars:24000},semanticPreferences:{include:[],exclude:[]},existingTaskContext:context},{}).payload;
const evidence={messageId:'gmail1',quote:'The report is now due November 9.'};
const output=()=>({category:'Actionable',confidence:95,summary:'The research report deadline changed.',explanation:'The sender revised the report deadline.',evidence,
 tasks:[],waitingFor:[],suggestedFollowUps:[],uncertainties:[],topicRelevance:{decision:'relevant',reason:'No topic restrictions.'},
 taskChanges:[{topicRelevance:'relevant',kind:'edit',targetTaskId:ID,expectedRevision:4,changedFields:['deadline'],fields:{...fields,deadline:{date:'2026-11-09',time:null,timeZone:'America/Chicago',wording:'now due November 9',boundary:'on'}},reason:'Explicit revised report deadline.',evidence}]});
test('deadline update targets the specific task and preserves accepted user edits',()=>{
 const value=output();assert.equal(validateExtraction(value,payload()).taskChanges[0].fields.requirements[0],'Keep my edited requirement');
 value.taskChanges[0].fields.requirements=[];assert.throws(()=>validateExtraction(value,payload()),/OVERWRITTEN_USER_EDIT/);
});
test('unknown IDs, stale revisions, duplicate targets and quoted-only changes are rejected',()=>{
 for(const mutate of [v=>v.taskChanges[0].targetTaskId='22222222-2222-4222-8222-222222222222',v=>v.taskChanges[0].expectedRevision=3,v=>v.taskChanges.push(v.taskChanges[0]),v=>v.taskChanges[0].evidence={messageId:'old',quote:'old change'}]){
  const v=output();mutate(v);assert.throws(()=>validateExtraction(v,payload()));
 }
});
test('cancellations preserve accepted state and do not become new obligations',()=>{
 const v=output();v.category='Passive';v.taskChanges=[{...v.taskChanges[0],kind:'cancel',fields:null,changedFields:[],evidence:{messageId:'gmail1',quote:'The report is cancelled.'}}];
 assert.equal(validateExtraction(v,payload()).tasks.length,0);
});
test('ambiguous updates remain untargeted review proposals',()=>{
 const v=output();v.taskChanges[0].targetTaskId=null;v.taskChanges[0].expectedRevision=null;v.uncertainties=['Which research report does this refer to?'];
 assert.equal(validateExtraction(v,payload()).taskChanges[0].targetTaskId,null);
});
test('an edit with no identifiable target can reach review without proposed values, in either category',()=>{
 // Shape returned by the real model for the live "that deliverable" case, on both replayed runs.
 for(const category of ['Passive','Actionable']){
  const v=output();v.category=category;v.uncertainties=['Which deliverable is being pushed back?'];
  Object.assign(v.taskChanges[0],{targetTaskId:null,expectedRevision:null,fields:null});
  assert.equal(validateExtraction(v,payload()).taskChanges[0].fields,null);
 }
});
test('a targeted edit still needs complete values, Actionable and at least one changed field',()=>{
 for(const mutate of [v=>v.taskChanges[0].fields=null,v=>v.category='Passive',v=>v.taskChanges[0].changedFields=[]]){
  const v=output();mutate(v);assert.throws(()=>validateExtraction(v,payload()));
 }
 const none=output();none.taskChanges=[];assert.throws(()=>validateExtraction(none,payload()),/CATEGORY_TASK_MISMATCH/);
});
test('new tasks coexist with changes without requiring inferred deadlines',()=>{
 const v=output();v.tasks=[{...fields,action:'Upload the slides',owner:'student@example.org',topicRelevance:'relevant',evidence:{messageId:'gmail1',quote:'Also upload the slides.'}}];
 assert.equal(validateExtraction(v,payload()).tasks[0].deadline,null);
});
test('task candidates require permitted same-thread provenance and exclude the message itself',()=>{
 const row={...context[0],sources:[{...message,id:'original'}]};
 assert.equal(selectTaskContext([row],message,rules).tasks.length,1);
 // A reply such as "moved to Friday" shares no action words. Membership is not a match: the model and validation choose the target.
 assert.equal(selectTaskContext([{...row,acceptedFields:{...fields,action:'Book hotel accommodation'}}],message,rules).tasks.length,1);
 assert.equal(selectTaskContext([{...row,sources:[{...message,id:'other',threadId:'thread2'}]}],message,rules).tasks.length,0);
 assert.equal(selectTaskContext([{...row,sources:[{...message,from:'blocked@outside.test'}]}],message,rules).tasks.length,0);
 assert.equal(selectTaskContext([{...row,sources:[message]}],message,rules).tasks.length,0);
});
test('task candidates exclude the source message and later-origin tasks, and rank word overlap first',()=>{
 const later={...context[0],id:'22222222-2222-4222-8222-222222222222',sources:[{...message,id:'newer'}],origins:[{id:'newer',sentAt:'2026-11-06T12:00:00Z'}]};
 const own={...context[0],id:'33333333-3333-4333-8333-333333333333',sources:[{...message,id:'older'},{...message,id:'gmail1'}],origins:[{id:'gmail1',sentAt:message.sentAt}]};
 const unrelated={...context[0],id:'44444444-4444-4444-8444-444444444444',acceptedFields:{...fields,action:'Book hotel accommodation'},sources:[{...message,id:'older'}],origins:[{id:'older',sentAt:'2026-11-01T12:00:00Z'}]};
 const related={...context[0],sources:[{...message,id:'older'}],origins:[{id:'older',sentAt:'2026-11-01T12:00:00Z'}]};
 const selected=selectTaskContext([later,own,unrelated,related],message,rules).tasks;
 assert.deepEqual(selected.map(t=>t.id),[related.id,unrelated.id]);assert.deepEqual(selected[0].sourceMessageIds,['older']);
});
test('oversized task provenance defers that candidate with a warning instead of failing the message',()=>{
 const row={...context[0],sources:Array.from({length:31},(_,i)=>({...message,id:`m${i}`}))};
 const out=selectTaskContext([row],message,rules);assert.equal(out.tasks.length,0);assert.equal(out.omitted,true);
});
test('mixed-topic filtering removes irrelevant tasks/information/changes and remaps follow-up indexes',()=>{
 const v=output();v.tasks=[{...fields,topicRelevance:'irrelevant'}];v.taskChanges[0].topicRelevance='irrelevant';
 v.waitingFor=[{action:'Blocked topic',topicRelevance:'irrelevant'},{action:'Research response',topicRelevance:'relevant'}];
 v.suggestedFollowUps=[{waitingForIndex:0,topicRelevance:'relevant'},{waitingForIndex:1,topicRelevance:'relevant'}];v.topicRelevance.decision='irrelevant';
 const result=filterRelevantOutput({result:v}).result;
 assert.equal(result.tasks.length,0);assert.equal(result.taskChanges.length,0);assert.equal(result.summary,'Outside selected topics.');assert.equal(result.suggestedFollowUps[0].waitingForIndex,0);
});

test('links and credential or payment wording in suggestions add review warnings without changing them',async()=>{
 const plain=output();assert.deepEqual(contentWarnings(plain),[]);
 const cases=[['Open https://portal.example.test/login to confirm','web link'],['Visit portal.example.test/confirm today','web link'],
  ['Reply with your password and verification code','passwords'],['Buy three gift cards and send the numbers','payments'],
  ['Send your bank account and routing number','payments']];
 for(const [action,expected] of cases){
  const v=output();v.taskChanges[0].fields.action=action;
  const found=contentWarnings(v);assert.equal(found.length,1,action);assert.ok(found[0].includes(expected),action);
 }
 const many=output();many.summary='Wire the payment via www.example.test/pay using your password.';assert.equal(contentWarnings(many).length,3);
 for(const benign of ['Submit research report by Friday','Upload slides to the shared folder','Email the professor about office hours']){
  const v=output();v.taskChanges[0].fields.action=benign;assert.deepEqual(contentWarnings(v),[],benign);
 }
 const input={contract:'gmail-v1',user:{email:'student@example.org',timeZone:'America/Chicago'},analysisTime:'2026-11-05T13:00:00Z',rules,message,threadContext:[],
  contextLimits:{maxMessages:5,maxAgeDays:90,maxMessageChars:12000,maxTotalChars:24000},semanticPreferences:{include:[],exclude:[]},existingTaskContext:context};
 const value=output();value.taskChanges[0].fields.action='Confirm the report at https://portal.example.test';value.taskChanges[0].changedFields=['action','deadline'];
 const result=await extract(input,{settings:{contextLimits:{}},systemPrompt:'Unit test prompt',generate:async()=>({value,attempts:1})});
 assert.equal(result.needsReview,true);assert.ok(result.contextWarnings.some(w=>w.includes('web link')));
 assert.equal(result.result.taskChanges[0].fields.action,'Confirm the report at https://portal.example.test');
});
