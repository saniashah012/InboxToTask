import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareInput,validateExtraction} from '../app/pipeline/core.mjs';
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
test('new tasks coexist with changes without requiring inferred deadlines',()=>{
 const v=output();v.tasks=[{...fields,action:'Upload the slides',owner:'student@example.org',topicRelevance:'relevant',evidence:{messageId:'gmail1',quote:'Also upload the slides.'}}];
 assert.equal(validateExtraction(v,payload()).tasks[0].deadline,null);
});
test('task candidates require permitted provenance and meaningful action overlap, beyond thread identity',()=>{
 const row={...context[0],sources:[{...message,id:'original'}]};
 assert.equal(selectTaskContext([row],message,rules).tasks.length,1);
 assert.equal(selectTaskContext([{...row,acceptedFields:{...fields,action:'Book hotel accommodation'}}],message,rules).tasks.length,0);
 assert.equal(selectTaskContext([{...row,sources:[{...message,from:'blocked@outside.test'}]}],message,rules).tasks.length,0);
 assert.equal(selectTaskContext([{...row,sources:[message]}],message,rules).tasks.length,0);
});
test('mixed-topic filtering removes irrelevant tasks/information/changes and remaps follow-up indexes',()=>{
 const v=output();v.tasks=[{...fields,topicRelevance:'irrelevant'}];v.taskChanges[0].topicRelevance='irrelevant';
 v.waitingFor=[{action:'Blocked topic',topicRelevance:'irrelevant'},{action:'Research response',topicRelevance:'relevant'}];
 v.suggestedFollowUps=[{waitingForIndex:0,topicRelevance:'relevant'},{waitingForIndex:1,topicRelevance:'relevant'}];v.topicRelevance.decision='irrelevant';
 const result=filterRelevantOutput({result:v}).result;
 assert.equal(result.tasks.length,0);assert.equal(result.taskChanges.length,0);assert.equal(result.summary,'Outside selected topics.');assert.equal(result.suggestedFollowUps[0].waitingForIndex,0);
});
