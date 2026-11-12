import { prepareInput, extract, semanticPreferences } from './core.mjs';
import { selectTaskContext } from './task-context.mjs';
import { gmailSchema } from '../prompts/extraction.schema.mjs';

const problem=code=>Object.assign(new Error(code),{code});
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
async function hash(value) {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stable(value))));
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
export function filterRelevantOutput(output) {
 const copy=structuredClone(output), result=copy.result;
 const kept=new Map();const waiting=[];
 result.waitingFor.forEach((row,i)=>{if(row.topicRelevance!=='irrelevant'){kept.set(i,waiting.length);waiting.push(row);}});
 result.waitingFor=waiting;
 result.tasks=result.tasks.filter(t=>t.topicRelevance!=='irrelevant').map(({topicRelevance,...task})=>task);
 result.suggestedFollowUps=result.suggestedFollowUps.filter(f=>f.topicRelevance!=='irrelevant'&&kept.has(f.waitingForIndex)).map(f=>({...f,waitingForIndex:kept.get(f.waitingForIndex)}));
 result.taskChanges=result.taskChanges.filter(c=>c.topicRelevance!=='irrelevant');
 if(result.topicRelevance.decision==='irrelevant') result.summary='Outside selected topics.';
 return copy;
}
export function createGmailProcessor({rpc,user,work,settings,systemPrompt,generate,timeZone='America/Chicago'}) {
 let calls=0;
 return async (email,{remainingMs=60000}={})=>{
  const topics=work.semanticPreferences===undefined?null:semanticPreferences(work.semanticPreferences);
  const rows=await rpc('gmail_task_context',{p_user:user.id,p_lease:work.lease,p_meta:email.message});
  const context=selectTaskContext(rows,email.message,email.rules,undefined,topics?.terms??[]);
  const input={...email,contract:'gmail-v1',user:{email:user.email,timeZone},analysisTime:work.end,
    semanticPreferences:work.semanticPreferences,existingTaskContext:context.tasks};
  const prepared=prepareInput(input,settings.contextLimits);
  // Retrieval normally skips these first. Nothing is claimed, stored or sent.
  if(prepared.status==='skipped'&&prepared.reason==='PRIVATE_TOPIC') return {modelCalls:0,privateTopic:true};
  if(prepared.status==='skipped'&&prepared.reason==='NO_TOPIC_WORD') return {modelCalls:0,noTopicWord:true};
  if(prepared.status!=='prepared') throw problem('GMAIL_MESSAGE_REVIEW_REQUIRED');
  if(context.omitted) prepared.payload.contextWarnings.push('Some relevant task context was omitted by task-state limits. Verify update targets.');
  // The warning enters extraction too, without caller-controlled model settings.
  const effectivePrompt=systemPrompt+(context.omitted?'\nTask context was bounded; flag incomplete update-target context for review.':'');
  // Access rules are absent on purpose: SQL rechecks current permission on every use,
  // and a rule change that alters permitted context already changes the content. The
  // scan date is absent because relative dates resolve from the message's sent date.
  // Only topics of interest affect the model. Blocked words change which content is
  // sent, and so the content hash, without being part of the request.
  const configKey=await hash({settings,systemPrompt:effectivePrompt,schema:gmailSchema,topics:topics&&{include:topics.include},contextLimits:email.contextLimits});
  const {existingTaskContext,analysisTime,...content}=prepared.payload;
  const base=await hash({content,configKey});
  const key=await hash({base,existingTaskContext});
  const meta={namespace:'gmail',messageId:email.message.id,threadId:email.message.threadId,subject:email.message.subject,
    sender:email.message.from,sentAt:email.message.sentAt,analysisTime:input.analysisTime,version:'gmail-v1',model:settings.model};
  const metadata=[email.message,...email.threadContext].map(({body,...item})=>item);
  const reserve=new TextEncoder().encode(JSON.stringify(prepared.payload)+effectivePrompt+JSON.stringify(gmailSchema)).length+settings.maxOutputTokens;
  if(reserve>150000 || JSON.stringify(prepared.payload).length+effectivePrompt.length+JSON.stringify(gmailSchema).length>60000) throw problem('MODEL_INPUT_TOO_LARGE');
  // Cache lookup and permission checks precede spending a reservation. Call limit
  // is passed to SQL, so an unchanged cached result remains reusable at the limit.
  const claim=await rpc('gmail_process_claim',{p_user:user.id,p_scan:work.lease,p_key:key,p_base:base,p_config:configKey,
    p_meta:meta,p_reserve:reserve,p_guard:{metadata,tasks:existingTaskContext,allowInference:calls<2&&remainingMs>10000}});
  if(claim.state==='cached') return {modelCalls:0,reused:true,saved:true};
  if(claim.state!=='claimed') throw problem(({busy:'STORAGE_BUSY',paused:'STORAGE_PAUSED',suppressed:'STORAGE_SUPPRESSED',
    budget_deferred:'STORAGE_BUDGET',provider_deferred:'STORAGE_PROVIDER_LIMIT',retry_later:'STORAGE_RETRY_LATER',attempt_limit:'STORAGE_ATTEMPT_LIMIT',inference_deferred:'SCAN_INFERENCE_LIMIT'})[claim.state]??'STORAGE_UNAVAILABLE');
  try {
   await rpc('gmail_process_assert',{p_user:user.id,p_job:claim.jobId,p_lease:claim.leaseToken});
   const output=await extract(input,{settings:{...settings,maxAttempts:1,timeoutMs:Math.min(settings.timeoutMs,remainingMs-5000)},systemPrompt:effectivePrompt,
    generate:async args=>{calls++;return generate(args);}});
   if(context.omitted) {output.contextWarnings.push('Relevant task context was bounded; verify update targets.');output.needsReview=true;}
   // The prompt has the model repeat backend warnings as uncertainties. Store each once.
   output.result.uncertainties=output.result.uncertainties.filter(item=>!output.contextWarnings.includes(item));
   await rpc('gmail_process_finish',{p_user:user.id,p_job:claim.jobId,p_lease:claim.leaseToken,p_output:filterRelevantOutput(output),p_meta:meta});
   return {modelCalls:output.modelCalls,reused:false,saved:true};
  } catch(error) {
   try {await rpc('storage_fail',{p_user_id:user.id,p_job_id:claim.jobId,p_lease:claim.leaseToken,p_code:error.code==='PROVIDER_HTTP_429'?'rate_limited':'unavailable'});} catch {}
   throw problem(['PROVIDER_HTTP_429','STORAGE_STALE'].includes(error.code)?error.code:'GMAIL_EXTRACTION_FAILED');
  }
 };
}
