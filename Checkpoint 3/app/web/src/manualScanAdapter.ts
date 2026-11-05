import {supabase} from './supabase'
export type ScanStatus={running:boolean;backlog:boolean;lastStarted:string|null;lastFinished:string|null;lastSuccessful:string|null;cooldownUntil:string|null;result:any}
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
export async function reviewTaskChange(id:string,revision:number,action:'approve'|'dismiss'|'rebase',taskRevision?:number){
 if(!supabase)throw new Error('Account connection is not configured.')
 const {data,error}=await supabase.rpc('gmail_change_review',{p_id:id,p_revision:revision,p_action:action,p_task_revision:taskRevision??null})
 if(error)throw new Error(error.code==='PT409'?'The task, proposal or evidence changed. Reload and review against the current task before approving.':'The proposal could not be saved. Reload its current state.')
 return data
}
