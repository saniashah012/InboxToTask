import {googleRuntimeOptions} from '../_shared/google-runtime.ts';
import {createCalendarHandler,createCalendarRpc,createCalendarWriter} from '../_shared/calendar-event.mjs';

const options=googleRuntimeOptions();
const rpc=createCalendarRpc({url:Deno.env.get('SUPABASE_URL')??'',serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??''});
Deno.serve(createCalendarHandler({...options,
 enabled:options.enabled && Deno.env.get('ENABLE_CALENDAR_EVENTS')==='true',
 writer:options.connection ? createCalendarWriter({rpc,connection:options.connection}) : undefined}));
