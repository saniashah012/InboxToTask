import {supabase} from './supabase'
import type {TaskFields} from './storageAdapter'
export type ScanStatus={running:boolean;backlog:boolean;lastStarted:string|null;lastFinished:string|null;lastSuccessful:string|null;cooldownUntil:string|null;result:any}
const stopMessages:Record<string,string>={
 SCAN_INFERENCE_LIMIT:'This scan checked as many new emails as one scan allows. Scan again to continue.',
 SCAN_TIME_LIMIT:'This batch reached its time limit. Scan again to continue.',
 SCAN_RETRIEVAL_LIMIT:'This batch reached its Gmail request limit. Scan again to continue.',
 SCAN_FAILURE_LIMIT:'Too many messages could not be processed, so the batch stopped. Check the Gmail connection and backend configuration.',
 GMAIL_RATE_LIMITED:'Gmail asked the app to slow down. Wait, then scan again.',
 GMAIL_RECONNECT_REQUIRED:'Gmail access is no longer valid. Reconnect Gmail under Connection and permissions.',
 GMAIL_UNAVAILABLE:'Gmail could not be reached. Scan again to retry.',
 PROVIDER_HTTP_429:'The AI service is rate limited. Wait, then scan again.',
 STORAGE_BUDGET:'Your daily processing allowance is used up. Scan again after it resets.',
 STORAGE_PROVIDER_LIMIT:'The per-minute AI request limit was reached. Wait a minute, then scan again.',
 STORAGE_PAUSED:'Processing is paused.',
 STORAGE_BUSY:'Another extraction is still running. Wait, then scan again.',
 STORAGE_STALE:'Saved permissions or task state changed during the batch. Scan again to continue under current settings.',
}
export const scanStopMessage=(code:string)=>stopMessages[code]??'The batch stopped with unfinished work. Scan again to continue.'
export async function manualScanStatus():Promise<ScanStatus>{
 if(!supabase)throw new Error('Account connection is not configured.')
 const {data,error}=await supabase.rpc('gmail_scan_status')
 if(error)throw new Error('Could not load scan status. Check the local backend and reload.')
 return data
}
export async function manualScan(mode:'initial'|'more'){
 if(!supabase)throw new Error('Account connection is not configured.')
 const {data,error}=await supabase.functions.invoke('gmail_scan',{body:{mode}})
 if(error){
  let code='';try{code=(await error.context?.json())?.error??''}catch{}
  const messages:Record<string,string>={GMAIL_SCAN_DISABLED:'Manual Gmail scanning is disabled in the backend. Your settings remain saved.',
   SCAN_BUSY:'A scan is running or cooling down. Reload status before trying again.',
   SCAN_PERMISSION_OR_REVISION_CHANGED:'Scanning permission or saved state changed. Check consent, pause, exact sources and Gmail connection, then reload.',
   GMAIL_SCAN_UNAVAILABLE:'Scanning could not start. Check backend configuration and Gmail connection.'}
  throw new Error(messages[code]??'No successful scan was confirmed. Reload status before retrying.')
 }
 return data
}
export async function resolveTaskChange(id:string,revision:number,taskId:string,taskRevision:number,fields:TaskFields|null){
 if(!supabase)throw new Error('Account connection is not configured.')
 const {data,error}=await supabase.rpc('gmail_change_resolve',{p_id:id,p_revision:revision,p_task:taskId,p_task_revision:taskRevision,p_fields:fields})
 if(error)throw new Error(error.code==='PT409'?'The task or this item changed. Reload and choose again.':error.code==='22023'?'Those values could not be saved. Check them and that something changed.':'Your values could not be saved. Reload and try again.')
 return data
}
export async function reviewTaskChange(id:string,revision:number,action:'approve'|'dismiss'|'rebase',taskRevision?:number){
 if(!supabase)throw new Error('Account connection is not configured.')
 const {data,error}=await supabase.rpc('gmail_change_review',{p_id:id,p_revision:revision,p_action:action,p_task_revision:taskRevision??null})
 if(error)throw new Error(error.code==='PT409'?'The task, proposal or evidence changed. Reload and review against the current task before approving.':'The proposal could not be saved. Reload its current state.')
 return data
}
