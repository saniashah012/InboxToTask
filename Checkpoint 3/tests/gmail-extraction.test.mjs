import test from 'node:test';
import assert from 'node:assert/strict';
import {contentWarnings,extract,groundDetails,prepareInput,relativeDayFromSent,validateExtraction} from '../app/pipeline/core.mjs';
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
 tasks:[],waitingFor:[],suggestedFollowUps:[],uncertainties:[],details:{title:null,dates:[],location:null,links:[]},topicRelevance:{decision:'relevant',reason:'No topic restrictions.'},
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

// "Turn into task" details of a Passive email: ungrounded entries are dropped, never fatal.
const notice='Open house on November 20 at 6 pm in Room 101,  Main Hall. Doors open at 5:30 pm. RSVP at https://example.org/rsvp or see https://example.org/map; files at ftp://example.org/files.';
const passivePayload=(body=notice)=>prepareInput({contract:'gmail-v1',user:{email:'student@example.org',timeZone:'America/Chicago'},analysisTime:'2026-11-05T13:00:00Z',rules,message:{...message,body},threadContext:[],contextLimits:{maxMessages:5,maxAgeDays:90,maxMessageChars:12000,maxTotalChars:24000},semanticPreferences:{include:[],exclude:[]},existingTaskContext:[]},{}).payload;
const stated={label:'Open house',date:'2026-11-20',time:'18:00',timeZone:'America/Chicago',wording:'November  20 at 6 PM',boundary:'on'};
const passive=(details={})=>({...output(),category:'Passive',summary:'An open house is planned.',evidence:{messageId:'gmail1',quote:'Open house on November 20 at 6 pm'},taskChanges:[],
 details:{title:null,dates:[],location:null,links:[],...details}});
test('Passive details keep grounded dates and drop ungrounded, invalid or empty ones without failing',()=>{
 const timeOnly={label:'Doors open',date:null,time:'17:30',timeZone:'America/Chicago',wording:'Doors open at 5:30 pm',boundary:'unspecified'};
 const dates=[stated,timeOnly,{...stated,wording:'November 21 at 6 pm'},{...stated,timeZone:'Mars/Olympus'},{...stated,date:'2026-02-30'},{...stated,date:null,time:null}];
 const result=validateExtraction(passive({title:'  Attend the   open house ',dates}),passivePayload()).details;
 assert.deepEqual(result.dates,[stated,timeOnly]);
 assert.equal(result.title,'Attend the open house');
 assert.deepEqual(groundDetails(passive({dates:[{...stated,date:'2026-11-31'}]}),passivePayload()).details.dates,[]);
});
test('Passive details keep a stated location and http(s) links found in the body, once each',()=>{
 const result=validateExtraction(passive({location:'room 101, main   hall',links:['https://example.org/rsvp',' https://example.org/rsvp ','ftp://example.org/files','https://example.org/map','https://example.org/elsewhere']}),passivePayload()).details;
 assert.equal(result.location,'room 101, main hall');
 assert.deepEqual(result.links,['https://example.org/rsvp','https://example.org/map']);
 const other=validateExtraction(passive({location:'Room 202',links:['example.org/rsvp']}),passivePayload()).details;
 assert.equal(other.location,null);assert.deepEqual(other.links,[]);
});
test('Actionable results never carry Passive details',()=>{
 const v=output();v.details={title:'Submit research report',dates:[{...stated,wording:'now due November 9',date:'2026-11-09',time:null}],location:null,links:[]};
 assert.deepEqual(validateExtraction(v,payload()).details,{title:null,dates:[],location:null,links:[]});
});
test('malformed details still fail the output schema',()=>{
 const link='https://example.org/rsvp';
 for(const details of [{title:null,dates:[],location:null},{title:null,dates:Array(7).fill(stated),location:null,links:[]},
  {title:null,dates:[],location:null,links:Array(6).fill(link)},{title:null,dates:[{...stated,time:'6pm'}],location:null,links:[]},
  {title:null,dates:[{...stated,time:'24:00'}],location:null,links:[]},{title:null,dates:[],location:null,links:[],extra:1}]){
  const v=passive();v.details=details;assert.throws(()=>validateExtraction(v,passivePayload()),/INVALID_OUTPUT_SCHEMA/,JSON.stringify(details).slice(0,80));
 }
 const missing=passive();delete missing.details;assert.throws(()=>validateExtraction(missing,passivePayload()),/INVALID_OUTPUT_SCHEMA/);
});
test('topic filtering empties details of an irrelevant email and keeps a relevant one',()=>{
 const details={title:'Attend the open house',dates:[stated],location:'Room 101',links:['https://example.org/rsvp']};
 const v=passive(details);v.topicRelevance={decision:'irrelevant',reason:'Outside selected topics.'};
 assert.deepEqual(filterRelevantOutput({result:v}).result.details,{title:null,dates:[],location:null,links:[]});
 assert.deepEqual(filterRelevantOutput({result:passive(details)}).result.details,details);
});
test('a link is grounded only as a whole link, not as the start of a longer one',()=>{
 const body='Register at https://example.org/rsvp-form-2026 before Friday.';
 const v=passive({links:['https://example.org/rsvp']});v.evidence={messageId:'gmail1',quote:'Register at'};
 assert.deepEqual(validateExtraction(v,passivePayload(body)).details.links,[]);
});
test('a weekday named on the sent weekday is that day only while its stated time is still ahead',()=>{
 // Sent Thursday, November 5, 2026 at 6:00 AM Central.
 const body='Office hours are Thursday at 5 am. The exam is Thursday at 3:30 PM. The fair is Thursday. Bring it today at 5 am.';
 const entry=(wording,date,time=null)=>({label:'Event',date,time,timeZone:'America/Chicago',wording,boundary:'on'});
 const v=passive({dates:[entry('Thursday at 5 am','2026-11-05','05:00'),entry('Thursday at 3:30 PM','2026-11-12','15:30'),
  entry('Thursday','2026-11-12'),entry('today at 5 am','2026-11-12','05:00')]});
 v.evidence={messageId:'gmail1',quote:'The exam is Thursday at 3:30 PM.'};
 // 5 am had passed when it was sent, so that Thursday is the next one; 3:30 PM had not;
 // with no time the sent day stands; "today" never moves.
 assert.deepEqual(validateExtraction(v,passivePayload(body)).details.dates.map(d=>d.date),['2026-11-12','2026-11-05','2026-11-05','2026-11-05']);
});
test('a relative day in Passive details is counted from the day the email was sent, not the day it was analysed',()=>{
 // The fixture message was sent Thursday, November 5, 2026 (6:00 AM Central).
 const body='Exam is on 3:30PM thursday. Review is tomorrow. Lab is next Thursday. Fair is Friday, November 20. Quiz is last Friday.';
 const entry=(wording,date,time=null)=>({label:'Event',date,time,timeZone:'America/Chicago',wording,boundary:'on'});
 const v=passive({dates:[entry('3:30PM thursday','2026-11-12','15:30'),entry('tomorrow','2026-11-18'),entry('next Thursday','2026-11-05'),
  entry('Friday, November 20','2026-11-20'),entry('last Friday','2026-10-30'),entry('3:30PM thursday',null,'15:30')]});
 v.evidence={messageId:'gmail1',quote:'Exam is on 3:30PM thursday.'};
 const dates=validateExtraction(v,passivePayload(body)).details.dates;
 // A weekday is the first such day on or after the sent day, the sent day included.
 assert.deepEqual(dates.map(d=>d.date),['2026-11-05','2026-11-06','2026-11-12','2026-11-20','2026-10-30',null]);
 assert.equal(dates[0].time,'15:30');
 const zone='America/Chicago';
 assert.equal(relativeDayFromSent('thursday','2026-11-13T03:30:00Z',zone),'2026-11-12','the sent day is taken in the email time zone');
 for(const wording of ['Thursday, November 19','by Friday or Saturday','every Friday','the day after tomorrow','Starts at 3:30 PM','11/20'])
  assert.equal(relativeDayFromSent(wording,'2026-11-05T12:00:00Z',zone),null,wording);
});
test('the sent-day rule applies only to wording that is nothing but one relative day, a time and connecting words',()=>{
 // Sent Thursday, November 5, 2026, 6:00 AM Central.
 const zone='America/Chicago',sent='2026-11-05T12:00:00Z',day=w=>relativeDayFromSent(w,sent,zone);
 const accepted=[['Thursday','2026-11-05'],['this Thursday.','2026-11-05'],['next Thursday','2026-11-12'],['Friday','2026-11-06'],['next Friday','2026-11-06'],
  ['Wednesday','2026-11-11'],['today','2026-11-05'],['tonight','2026-11-05'],['tomorrow','2026-11-06'],['tomorrow night','2026-11-06'],
  ['3:30PM thursday','2026-11-05'],['Thursday at 3:30 PM','2026-11-05'],['Friday 3 pm','2026-11-06'],['Friday 3 p.m.','2026-11-06'],['Friday, 15:30','2026-11-06'],
  ['Fri at noon','2026-11-06'],['Thursday at midnight','2026-11-05'],['by end of day Friday','2026-11-06'],['EOD Friday','2026-11-06'],['Friday afternoon','2026-11-06'],
  ['Friday evening','2026-11-06'],['due by Friday','2026-11-06'],['no later than Friday at 5pm','2026-11-06'],['until Monday','2026-11-09'],['before Tuesday','2026-11-10'],
  ['starts Tuesday','2026-11-10'],['is on Saturday','2026-11-07'],['from Sunday','2026-11-08'],['the next Friday','2026-11-06'],
  ['Thu','2026-11-05'],['Thurs.','2026-11-05'],['tues','2026-11-10']];
 for(const [wording,expected] of accepted) assert.equal(day(wording),expected,wording);
 // "next <weekday>" sent on another day is the coming one, with no extra week.
 assert.equal(relativeDayFromSent('next Thursday','2026-11-09T15:00:00Z',zone),'2026-11-12');
 // Sent 9:30 PM Wednesday Central, already Thursday in UTC.
 assert.equal(relativeDayFromSent('tomorrow','2026-11-12T03:30:00Z',zone),'2026-11-12');
 assert.equal(relativeDayFromSent('Wednesday','2026-11-12T03:30:00Z',zone),'2026-11-11');
 assert.equal(relativeDayFromSent('next Wednesday','2026-11-12T03:30:00Z',zone),'2026-11-18');
 const rejected=['the Friday after Thanksgiving','Friday of next week','two weeks from Friday','the following Monday','a week from tomorrow','Thursday the week after break',
  'Thursday, November 19','Nov 20','Friday the 20th','11/20','11-20 Friday','2026-11-20','by Friday or Saturday','Thursday and Friday','Friday, Friday','last Friday','every Friday','each Friday',
  'the day after tomorrow','Friday after next','next week','this weekend','this morning','next tomorrow','','   ','Starts at 3:30 PM','soon','Friday 3','Friday 13 pm','Friday at 3 or 4 pm','Friday 3pm 5pm',
  "Friday's class",'Friday after class',
  // Abbreviations that are also ordinary words are not read as days.
  'Sat','by sat','the SAT','sun','Wed','Mon'];
 for(const wording of rejected) assert.equal(day(wording),null,JSON.stringify(wording));
 assert.equal(relativeDayFromSent('Friday',sent,'Mars/Olympus'),null);
 assert.equal(relativeDayFromSent('Friday','not a time',zone),null);
});

// Gmail deadlines follow the same rule; the fixture contract does not.
const dueBody='The report is now due November 9. The report is now due Friday. Please upload the slides by Friday at 5 PM. Maria will send the data by Tuesday. The poster is due Thursday at midnight.';
const limits={maxMessages:5,maxAgeDays:90,maxMessageChars:12000,maxTotalChars:24000};
const duePayload=({threadContext=[],existing=context,analysisTime='2026-11-05T13:00:00Z'}={})=>prepareInput({contract:'gmail-v1',user:{email:'student@example.org',timeZone:'America/Chicago'},
 analysisTime,rules,message:{...message,body:dueBody},threadContext,contextLimits:limits,semanticPreferences:{include:[],exclude:[]},existingTaskContext:existing},{}).payload;
const due=(wording,date,time=null)=>({date,time,timeZone:'America/Chicago',wording,boundary:'by'});
const slides=(deadline,quote='Please upload the slides by Friday at 5 PM.',messageId='gmail1')=>({action:'Upload the slides',owner:'student@example.org',deadline,condition:null,requirements:[],topicRelevance:'relevant',evidence:{messageId,quote}});
test('a new task deadline in relative words is counted from the sent day; other deadlines are untouched',()=>{
 const late=due('by Friday at 5 PM','2026-11-13','17:00');
 const v=output();v.taskChanges=[];v.tasks=[slides(late),slides(due('due November 9','2026-11-09')),slides(null)];
 const tasks=validateExtraction(v,duePayload()).tasks;
 assert.deepEqual(tasks[0].deadline,{...late,date:'2026-11-06'},'only the date changes');
 assert.deepEqual(tasks[1].deadline,due('due November 9','2026-11-09'));
 assert.equal(tasks[2].deadline,null);
 // A correct date and a date-only deadline pass through unchanged.
 const ok=output();ok.taskChanges=[];ok.tasks=[slides(due('Friday','2026-11-06'))];
 assert.deepEqual(validateExtraction(ok,duePayload()).tasks[0].deadline,due('Friday','2026-11-06'));
 // "Thursday at midnight" may mean the start of Friday: both readings are kept, a week-late one is not.
 const midnight=output();midnight.taskChanges=[];midnight.tasks=[slides(due('Thursday at midnight','2026-11-06','00:00')),slides(due('Thursday at midnight','2026-11-12','00:00'))];
 assert.deepEqual(validateExtraction(midnight,duePayload()).tasks.map(t=>t.deadline.date),['2026-11-06','2026-11-05']);
});
test('a relative day in an earlier thread message counts from that message, including a date-only placeholder',()=>{
 const earlier={id:'earlier',threadId:'thread1',from:'teacher@example.org',subject:'Research report',labels:[],sentAt:'2026-11-02T15:00:00Z',body:'Please upload the slides by Wednesday. Bring it tomorrow.'};
 // Sent Monday, November 2: "Wednesday" is November 4, not November 11 counted from the current Thursday.
 const v=output();v.taskChanges=[];v.tasks=[slides(due('by Wednesday','2026-11-11'),'Please upload the slides by Wednesday.','earlier')];
 assert.equal(validateExtraction(v,duePayload({threadContext:[earlier]})).tasks[0].deadline.date,'2026-11-04');
 // Midnight -05:00 is the evening before in Los Angeles; the written date is the sent day.
 const dated={...earlier,sentAt:'2026-11-02T00:00:00-05:00',sentAtPrecision:'date'};
 const w=output();w.taskChanges=[];w.tasks=[slides({...due('tomorrow','2026-11-06'),timeZone:'America/Los_Angeles'},'Bring it tomorrow.','earlier')];
 assert.equal(validateExtraction(w,duePayload({threadContext:[dated]})).tasks[0].deadline.date,'2026-11-03');
});
test('a promised deadline is corrected before deciding whether a follow-up is allowed',()=>{
 const waiting=(date)=>({action:'Send the data',owner:'maria@example.org',promisedDeadline:due('by Tuesday',date),topicRelevance:'relevant',evidence:{messageId:'gmail1',quote:'Maria will send the data by Tuesday.'}});
 const passiveDue=(date,followUp)=>{const v=output();Object.assign(v,{category:'Passive',taskChanges:[],waitingFor:[waiting(date)],
  suggestedFollowUps:followUp?[{action:'Ask Maria for the data',recipient:'maria@example.org',waitingForIndex:0,rationale:'The promised date has passed.',topicRelevance:'relevant',evidence:{messageId:'gmail1',quote:'Maria will send the data by Tuesday.'}}]:[]});return v;};
 // Tuesday after the Thursday send is November 10.
 assert.equal(validateExtraction(passiveDue('2026-11-17',false),duePayload()).waitingFor[0].promisedDeadline.date,'2026-11-10');
 // Analysed November 12: the miscounted November 17 is not past, the real November 10 is, so the follow-up stands.
 assert.equal(validateExtraction(passiveDue('2026-11-17',true),duePayload({analysisTime:'2026-11-12T15:00:00Z'})).suggestedFollowUps.length,1);
 // Analysed the day it was sent: the miscounted November 3 is past, the real November 10 is not, so the follow-up is refused.
 assert.throws(()=>validateExtraction(passiveDue('2026-11-03',true),duePayload()),/UNSUPPORTED_FOLLOW_UP/);
});
test('a task change deadline is corrected only when the deadline is a changed field',()=>{
 const v=output();v.taskChanges[0].fields.deadline=due('due Friday','2026-11-13');
 assert.deepEqual(validateExtraction(v,duePayload()).taskChanges[0].fields.deadline,due('due Friday','2026-11-06'));
 // The accepted deadline is kept exactly as the user has it, even if it looks miscounted.
 const accepted={...fields,deadline:due('Friday','2026-11-13')};
 const existing=[{...context[0],acceptedFields:accepted}];
 const keep=output();keep.taskChanges[0].changedFields=['action'];keep.taskChanges[0].fields={...accepted,action:'Submit the final research report'};
 assert.deepEqual(validateExtraction(keep,duePayload({existing})).taskChanges[0].fields.deadline,due('Friday','2026-11-13'));
});
test('the fixture contract keeps a relative-day deadline as the model returned it',()=>{
 const fixture=prepareInput({user:{email:'student@example.org',timeZone:'America/Chicago'},analysisTime:'2026-11-05T13:00:00Z',rules,message:{...message,body:dueBody},threadContext:[],contextLimits:limits},{}).payload;
 assert.equal(fixture.contract,undefined);
 const late=due('by Friday at 5 PM','2026-11-13','17:00');
 const v={category:'Actionable',confidence:90,evidence,explanation:'Slides are due.',summary:'Upload the slides.',uncertainties:[],waitingFor:[],suggestedFollowUps:[],
  tasks:[{action:'Upload the slides',owner:'student@example.org',deadline:late,condition:null,requirements:[],evidence:{messageId:'gmail1',quote:'Please upload the slides by Friday at 5 PM.'}}]};
 const notes=[];assert.deepEqual(validateExtraction(v,fixture,notes).tasks[0].deadline,late);assert.deepEqual(notes,[]);
});

// When code and the model disagree about a date, the user is told; when they agree, nothing is added.
// Every body below is sent Thursday, November 5, 2026, 6:00 AM Central, like the fixture message.
const datedPayload=(body,threadContext=[])=>prepareInput({contract:'gmail-v1',user:{email:'student@example.org',timeZone:'America/Chicago'},analysisTime:'2026-11-05T13:00:00Z',
 rules,message:{...message,body},threadContext,contextLimits:limits,semanticPreferences:{include:[],exclude:[]},existingTaskContext:[]},{}).payload;
const datedTasks=(deadlines,quote='the slides by Friday',messageId='gmail1')=>{const v=output();v.taskChanges=[];v.evidence={messageId:'gmail1',quote:'Hi all.'};
 v.tasks=deadlines.map(d=>slides(d,quote,messageId));return v;};
const dated=(body,deadline,quote,{threadContext=[],messageId}={})=>{
 const notes=[];const v=validateExtraction(datedTasks([deadline],quote,messageId),datedPayload(body,threadContext),notes);
 return {date:v.tasks[0].deadline.date,notes};
};
const earlierMessage=(id,body,sentAt='2026-11-02T15:00:00Z')=>({id,threadId:'thread1',from:'teacher@example.org',subject:'Research report',labels:[],sentAt,body});
test('a corrected date adds one plain note naming both dates; an agreeing date adds none',()=>{
 const body='Hi all.\nPlease upload the slides by Friday.';
 assert.deepEqual(dated(body,due('by Friday','2026-11-13')),{date:'2026-11-06',notes:[
  'The email says "by Friday". That was read as Fri, Nov 13, 2026; counted from the day it was sent, it is Fri, Nov 6, 2026. Check the date.']});
 assert.deepEqual(dated(body,due('by Friday','2026-11-06')),{date:'2026-11-06',notes:[]});
 // Two items with the same wording and dates give one note.
 const notes=[];const v=validateExtraction(datedTasks([due('by Friday','2026-11-13'),due('by Friday','2026-11-13')]),datedPayload(body),notes);
 assert.deepEqual(v.tasks.map(t=>t.deadline.date),['2026-11-06','2026-11-06']);assert.equal(notes.length,1);
 // Called with two arguments, it still returns the value and corrects the date.
 const two=datedTasks([due('by Friday','2026-11-13')]);assert.equal(validateExtraction(two,datedPayload(body)),two);assert.equal(two.tasks[0].deadline.date,'2026-11-06');
 // A long wording is cut to 80 characters in the note.
 const long=`${'by '.repeat(40)}Friday`;
 const cut=dated(`Hi all.\nUpload the slides ${long}.`,due(long,'2026-11-13'),`the slides ${long}`).notes[0];
 assert.ok(cut.startsWith(`The email says "${'by '.repeat(25)}by...". That was read`),cut);
});
test('a weekday next to wording about another week keeps the model date, with a note',()=>{
 const kept=(body,label)=>assert.deepEqual(dated(body,due('by Friday','2026-11-13')),{date:'2026-11-13',notes:[
  'The email says "by Friday" near wording about another week. The date was left as Fri, Nov 13, 2026; counted from the day it was sent, it would be Fri, Nov 6, 2026. Check the date.']},label);
 const fixed=(body,label)=>assert.equal(dated(body,due('by Friday','2026-11-13')).date,'2026-11-06',label);
 kept('Hi all.\nNext week, upload the slides by Friday.','same sentence');
 kept('Hi all. The schedule moves to the following week. Upload the slides by Friday.','previous sentence');
 kept("Hi all.\n\nNext week's schedule:\nReading quiz on Monday.\nUpload the slides by Friday.\n",'under a colon heading');
 fixed("Hi all.\nNext week's schedule:\nQuiz Monday.\n\nUpload the slides by Friday.",'a blank line ends the heading');
 fixed('Hi all. In two weeks we start a new unit. The lab is open. Upload the slides by Friday.','two sentences away');
 for(const cue of ["Next week's","After Thanksgiving,",'After the break,','The week of November 16,','In a couple of weeks,','In 3 weeks,','After Spring Break,',
  'Later this month,','Next month,','In the upcoming week,','The week after,','After the holidays,','The following week,'])
  kept(`Hi all.\n${cue} upload the slides by Friday.`,cue);
 for(const plain of ['This week,',"After Friday's lecture,",'Every day,','After class,','The week is busy, so'])
  fixed(`Hi all.\n${plain} upload the slides by Friday.`,plain);
 // With the model already on the plain rule's date, nothing is added.
 assert.deepEqual(dated('Hi all.\nNext week, upload the slides by Friday.',due('by Friday','2026-11-06')),{date:'2026-11-06',notes:[]});
});
test('"next <weekday>" keeps the rule date and says the wording can mean either of two weeks',()=>{
 const body='Hi all.\nUpload the slides next Thursday.';
 assert.deepEqual(dated(body,due('next Thursday','2026-11-19'),'the slides next Thursday'),{date:'2026-11-12',notes:[
  'The email says "next Thursday", which can mean either of two weeks. It was set to Thu, Nov 12, 2026. Check the date.']});
 assert.deepEqual(dated(body,due('next Thursday','2026-11-12'),'the slides next Thursday'),{date:'2026-11-12',notes:[]});
 // "next Thursday" is not itself a cue; "next week" before it is.
 const near=dated('Hi all. Next week is busy. Upload the slides next Thursday.',due('next Thursday','2026-11-19'),'the slides next Thursday');
 assert.equal(near.date,'2026-11-19');assert.match(near.notes[0],/near wording about another week/);
});
test('wording that appears twice is judged at the occurrence inside its evidence quote',()=>{
 const body='Hi all. The lab is Friday.\nNext week: the slides are due Friday.';
 assert.equal(dated(body,due('Friday','2026-11-13'),'the slides are due Friday.').date,'2026-11-13');
 assert.deepEqual(dated(body,due('Friday','2026-11-13'),'The lab is Friday.'),{date:'2026-11-06',notes:[
  'The email says "Friday". That was read as Fri, Nov 13, 2026; counted from the day it was sent, it is Fri, Nov 6, 2026. Check the date.']});
 // A quote holding neither occurrence: any occurrence with a cue keeps the model date.
 assert.equal(dated(body,due('Friday','2026-11-13'),'Hi all.').date,'2026-11-13');
});
test('a date is counted from the one supplied email that contains its wording, and left alone otherwise',()=>{
 const body='Hi all.\nReminder about the slides.',quote='Reminder about the slides.';
 // Only the earlier Monday message says "by Wednesday": November 4, not November 11.
 const earlier=earlierMessage('earlier','Please upload the slides by Wednesday.');
 assert.deepEqual(dated(body,due('by Wednesday','2026-11-11'),quote,{threadContext:[earlier]}),{date:'2026-11-04',notes:[
  'The email says "by Wednesday". That was read as Wed, Nov 11, 2026; counted from the day it was sent, it is Wed, Nov 4, 2026. Check the date.']});
 // Two other emails say it, or none does: the model date stays. Nothing is added when the
 // rule from the cited email agrees; when it would differ, the user is told both dates.
 const again=earlierMessage('again','Again: the slides by Wednesday.','2026-10-30T15:00:00Z');
 assert.deepEqual(dated(body,due('by Wednesday','2026-11-11'),quote,{threadContext:[again,earlier]}),{date:'2026-11-11',notes:[]});
 assert.deepEqual(dated(body,due('by Wednesday','2026-11-18'),quote,{threadContext:[again,earlier]}),{date:'2026-11-18',notes:[
  'The date wording "by Wednesday" could not be matched to one email. The date was left as Wed, Nov 18, 2026; counted from the day this email was sent, it would be Wed, Nov 11, 2026. Check the date.']});
 assert.deepEqual(dated(body,due('due Wednesday','2026-11-18'),quote,{threadContext:[earlier]}),{date:'2026-11-18',notes:[
  'The date wording "due Wednesday" could not be matched to one email. The date was left as Wed, Nov 18, 2026; counted from the day this email was sent, it would be Wed, Nov 11, 2026. Check the date.']});
 assert.deepEqual(dated(body,due('due Wednesday','2026-11-11'),quote,{threadContext:[earlier]}),{date:'2026-11-11',notes:[]});
 // The cited email wins when it contains the wording, even if another one does too.
 assert.equal(dated('Hi all.\nUpload the slides by Wednesday.',due('by Wednesday','2026-11-04'),'the slides by Wednesday',{threadContext:[earlier]}).date,'2026-11-11');
});
test('a task change deadline is counted only from the current email, and only when it contains the wording',()=>{
 const earlier=earlierMessage('earlier','The report is now due Monday.');
 for(const threadContext of [[],[earlier]]){
  const v=output();v.taskChanges[0].fields.deadline=due('due Monday','2026-11-16');const notes=[];
  // Not in the current email: the date is left alone, and the user is told what the rule would give.
  assert.deepEqual(validateExtraction(v,duePayload({threadContext}),notes).taskChanges[0].fields.deadline,due('due Monday','2026-11-16'));
  assert.equal(notes.length,1);assert.match(notes[0],/could not be matched to one email\. The date was left as Mon, Nov 16, 2026; counted from the day this email was sent, it would be Mon, Nov 9, 2026\./);
 }
 const v=output();v.taskChanges[0].fields.deadline=due('due Friday','2026-11-13');const notes=[];
 assert.equal(validateExtraction(v,duePayload(),notes).taskChanges[0].fields.deadline.date,'2026-11-06');assert.equal(notes.length,1);
});
test('Passive details add notes too, except for an email outside the selected topics',()=>{
 const body='Lab is next Thursday. Fair is tomorrow.';
 const entry=(wording,date)=>({label:'Event',date,time:null,timeZone:'America/Chicago',wording,boundary:'on'});
 const v=passive({dates:[entry('next Thursday','2026-11-19'),entry('tomorrow','2026-11-06')]});v.evidence={messageId:'gmail1',quote:'Lab is next Thursday.'};
 const notes=[];assert.deepEqual(validateExtraction(v,passivePayload(body),notes).details.dates.map(d=>d.date),['2026-11-12','2026-11-06']);
 assert.deepEqual(notes,['The email says "next Thursday", which can mean either of two weeks. It was set to Thu, Nov 12, 2026. Check the date.']);
 const outside=passive({dates:[entry('next Thursday','2026-11-19')]});outside.evidence=v.evidence;outside.topicRelevance={decision:'irrelevant',reason:'Outside selected topics.'};
 const none=[];assert.equal(groundDetails(outside,passivePayload(body),none).details.dates[0].date,'2026-11-12');assert.deepEqual(none,[]);
 // Two arguments still work.
 assert.equal(groundDetails(passive({dates:[entry('next Thursday','2026-11-19')]}),passivePayload(body)).details.dates[0].date,'2026-11-12');
});
test('a few holiday phrases are counted by the calendar, with a note when the model differs',()=>{
 const body='Hi all.\nPlease upload the slides by the Friday after Thanksgiving.',quote='the slides by the Friday after Thanksgiving';
 assert.deepEqual(dated(body,due('by the Friday after Thanksgiving','2026-12-04'),quote),{date:'2026-11-27',notes:[
  'The email says "by the Friday after Thanksgiving". That was read as Fri, Dec 4, 2026; by the calendar it is Fri, Nov 27, 2026. Check the date.']});
 assert.deepEqual(dated(body,due('by the Friday after Thanksgiving','2026-11-27'),quote),{date:'2026-11-27',notes:[]});
 assert.deepEqual(dated('Hi all.\nUpload the slides after Thanksgiving break.',due('Thanksgiving break','2026-11-30'),'the slides after Thanksgiving break'),{date:'2026-11-30',notes:[]});
});
test('extract puts a date note in the warnings and marks the result for review, and adds nothing when the dates agree',async()=>{
 const input={contract:'gmail-v1',user:{email:'student@example.org',timeZone:'America/Chicago'},analysisTime:'2026-11-05T13:00:00Z',rules,message:{...message,body:dueBody},threadContext:[],
  contextLimits:limits,semanticPreferences:{include:[],exclude:[]},existingTaskContext:[]};
 const run=date=>{const value=output();value.taskChanges=[];value.tasks=[slides(due('by Friday at 5 PM',date,'17:00'))];
  return extract(input,{settings:{contextLimits:{}},systemPrompt:'Unit test prompt',generate:async()=>({value,attempts:1})});};
 const wrong=await run('2026-11-13');
 assert.equal(wrong.result.tasks[0].deadline.date,'2026-11-06');assert.equal(wrong.needsReview,true);
 assert.deepEqual(wrong.contextWarnings,['The email says "by Friday at 5 PM". That was read as Fri, Nov 13, 2026; counted from the day it was sent, it is Fri, Nov 6, 2026. Check the date.']);
 assert.deepEqual(wrong.result.uncertainties,[]);
 const right=await run('2026-11-06');
 assert.deepEqual(right.contextWarnings,[]);assert.equal(right.needsReview,false);
});
