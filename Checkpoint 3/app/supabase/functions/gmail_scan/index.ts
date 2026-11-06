import { createUserVerifier } from '../_shared/auth.mjs';
import { createStorageRpc } from '../_shared/storage.mjs';
import { createGoogleConnection, createGoogleProvider, createGoogleRpc, createTokenCipher } from '../_shared/google-connection.mjs';
import { createGmailClient, retrieveGmail } from '../_shared/extraction/pipeline/gmail-retrieval.mjs';
import { createGmailProcessor } from '../_shared/extraction/pipeline/gmail-processor.mjs';
import { createGeminiGenerator } from '../_shared/extraction/pipeline/gemini.mjs';
import { settings,systemPrompt } from '../_shared/extraction/assets.mjs';
import { createGmailScanHandler } from '../_shared/gmail-scan-handler.mjs';

const env = (key: string) => Deno.env.get(key) ?? '';
const persistent=env('ENABLE_GMAIL_SCAN')==='true';
const rpc = createStorageRpc({url:env('SUPABASE_URL'),serviceKey:env('SUPABASE_SERVICE_ROLE_KEY')});
Deno.serve(createGmailScanHandler({
  // Persistent mode without a model key stays disabled, before any lease is taken or mail is read.
  enabled:(persistent ? env('GEMINI_API_KEY')!=='' : env('ENABLE_GMAIL_RETRIEVAL') === 'true') && env('ENABLE_GOOGLE_CONNECTION') === 'true',
  allowedOrigins:env('APP_ORIGINS').split(',').map(s=>s.trim()).filter(Boolean),
  verifyUser:createUserVerifier({url:env('SUPABASE_URL'),publicKey:env('SUPABASE_ANON_KEY')}),
  scan:async (user: {id:string;email:string}, mode: string) => {
    const service = (action: string, data: object = {}) => rpc('gmail_scan_service',{p_user:user.id,p_action:action,p_data:data});
    const work = await service('claim',{mode});
    if (work.state !== 'claimed') throw Object.assign(new Error('SCAN_BUSY'),{code:'SCAN_BUSY'});
    const connection = createGoogleConnection({
      rpc:createGoogleRpc({url:env('SUPABASE_URL'),serviceKey:env('SUPABASE_SERVICE_ROLE_KEY')}),
      cipher:createTokenCipher({keys:env('GOOGLE_TOKEN_KEYS'),activeKey:env('GOOGLE_TOKEN_ACTIVE_KEY')}),
      provider:createGoogleProvider({clientId:env('GOOGLE_CLIENT_ID'),clientSecret:env('GOOGLE_CLIENT_SECRET'),callbackUrl:env('GOOGLE_CALLBACK_URL')}),
    });
    const processor=persistent?createGmailProcessor({rpc,user,work,settings:{...settings,model:env('GEMINI_MODEL')||settings.model},systemPrompt,
      generate:createGeminiGenerator({apiKey:env('GEMINI_API_KEY')})}):async()=>({modelCalls:0});
    const suppressed = await rpc('gmail_suppressed_messages',{p_user:user.id,p_lease:work.lease});
    const result = await retrieveGmail({
      gmail:createGmailClient({accessToken:async()=>{
        await service('assert',{lease:work.lease});
        const token = await connection.accessToken(user.id);
        await service('assert',{lease:work.lease});
        return token;
      }}),work:{...work,suppressed},check:()=>service('assert',{lease:work.lease}),
      consume:processor,
    });
    const summary = {executionMode:persistent?'GMAIL_PERSISTENT_MANUAL':'GMAIL_RETRIEVAL_ONLY',counts:result.counts,error:result.error,backlog:result.backlog,failures:result.failures,unresolved:result.unresolved};
    await service('finish',{lease:work.lease,continuation:result.continuation,result:summary});
    return {...summary,backlogCountKnown:false,requiresScanMoreApproval:result.backlog};
  },
}));
