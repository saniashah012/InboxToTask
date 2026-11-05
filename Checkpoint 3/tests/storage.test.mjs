import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStoredProcessor, createStorageRpc } from '../app/supabase/functions/_shared/storage.mjs';
import { createFixtureHandler } from '../app/supabase/functions/_shared/fixture-handler.mjs';
import { extract, prepareInput } from '../app/pipeline/core.mjs';
import schema from '../app/prompts/extraction.schema.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/cp2-inbox.json',import.meta.url)));
const settings=JSON.parse(await readFile(new URL('../app/prompts/model-settings.json',import.meta.url)));
const systemPrompt=await readFile(new URL('../app/prompts/extraction.system.txt',import.meta.url),'utf8');
const input={...fixture.cases[0],user:fixture.user,rules:fixture.rules,analysisTime:fixture.analysisTime};
const identity={id:'11111111-1111-4111-8111-111111111111',email:fixture.user.email};

test('coordinator claims before inference and saves only validated canonical output',async()=>{
  const order=[]; let claimArgs;
  const run=createStoredProcessor({settings,systemPrompt,schema,prepareInput,
    rpc:async(name,args)=>{
      order.push(name);
      if(name==='storage_claim') { claimArgs=args; return {state:'claimed',jobId:'job',leaseToken:'lease'}; }
      assert.equal(name,'storage_finish'); assert.equal(args.p_output.status,'extracted');
      assert.equal(args.p_user_id,identity.id); assert.equal(args.p_lease,'lease');
      return {extractionId:'stored',suggestionCount:1};
    },
    extractFn:async(given)=>{
      order.push('inference');
      return extract(given,{settings,systemPrompt,generate:async()=>({usage:{totalTokens:1000},value:{
        category:'Actionable',confidence:95,evidence:{messageId:'E01',quote:'Please upload'},
        explanation:'A required response.',summary:'Upload the response.',tasks:[{
          action:'Upload response',owner:identity.email,deadline:null,condition:null,requirements:[],
          evidence:{messageId:'E01',quote:'Please upload'},
        }],waitingFor:[],suggestedFollowUps:[],uncertainties:[],
      }})});
    }});
  const result=await run(input,identity);
  assert.deepEqual(order,['storage_claim','inference','storage_finish']);
  assert.equal(result.saved,true); assert.equal(result.receipt.extractionId,'stored');
  assert.match(claimArgs.p_key,/^[0-9a-f]{64}$/);
  assert.ok(claimArgs.p_reserve>settings.maxOutputTokens);
  assert.equal(JSON.stringify(claimArgs).includes(input.message.body),false);
});

test('cache hit and denied claims invoke zero model calls',async()=>{
  for(const state of ['cached','paused','busy','suppressed','retry_later','attempt_limit','budget_deferred','provider_deferred']){
    let inference=0;
    const run=createStoredProcessor({settings,systemPrompt,schema,prepareInput,
      rpc:async()=>({state,receipt:{extractionId:'saved'}}),extractFn:async()=>{inference++;}});
    if(state==='cached') assert.equal((await run(input,identity)).modelCalls,0);
    else await assert.rejects(run(input,identity),/STORAGE_/);
    assert.equal(inference,0);
  }
});

test('content, context and effective prompt/settings changes alter reuse identity',async()=>{
  const keys=[];
  const run=(overrides={})=>createStoredProcessor({settings,systemPrompt,schema,prepareInput,...overrides,
    rpc:async(_name,args)=>{keys.push(args.p_key);return {state:'cached',receipt:{}};},extractFn:async()=>assert.fail('no inference')});
  await run()(input,identity); await run()(input,identity);
  assert.equal(keys[0],keys[1]);
  await run()({...input,message:{...input.message,body:input.message.body+' Extra detail.'}},identity);
  await run({systemPrompt:systemPrompt+' Updated instructions.'})(input,identity);
  await run({settings:{...settings,thinkingLevel:'MEDIUM'}})(input,identity);
  assert.equal(new Set(keys).size,4);
});

test('unknown save outcome never claims success and preserves a recoverable failure',async()=>{
  const calls=[];
  const run=createStoredProcessor({settings,systemPrompt,schema,prepareInput,
    rpc:async(name)=>{calls.push(name);if(name==='storage_claim')return {state:'claimed',jobId:'job',leaseToken:'lease'};
      if(name==='storage_finish')throw new Error('database unavailable');},extractFn:async()=>({status:'extracted',modelCalls:1})});
  await assert.rejects(run(input,identity),/database unavailable/);
  assert.deepEqual(calls,['storage_claim','storage_finish','storage_fail']);
});

test('oversized or excluded inputs never claim budget or invoke inference',async()=>{
  let calls=0;
  const run=createStoredProcessor({settings,systemPrompt,schema,prepareInput,
    rpc:async()=>{calls++;},extractFn:async()=>{calls++;}});
  const result=await run({...input,rules:{...input.rules,allow:{labels:[],senders:[],domains:[]}}},identity);
  assert.equal(result.saved,false); assert.equal(result.modelCalls,0); assert.equal(calls,0);
});

test('RPC transport keeps service keys server-side and sanitizes response/network failures',async()=>{
  const rpc=createStorageRpc({url:'http://localhost:54321/',serviceKey:'server-only-test',
    fetchImpl:async(url,init)=>{assert.equal(url,'http://localhost:54321/rest/v1/rpc/storage_claim');
      assert.equal(init.headers.apikey,'server-only-test');assert.equal(init.redirect,'error');return Response.json({state:'cached'});}});
  assert.equal((await rpc('storage_claim',{})).state,'cached');
  for(const failure of [async()=>Response.json({code:'PT409',message:'private provider body'},{status:409}),
    async()=>{throw new Error('private transport key');}]){
    const failing=createStorageRpc({url:'http://localhost',serviceKey:'server-only-test',fetchImpl:failure});
    await assert.rejects(failing('storage_finish',{}),(error)=> /^STORAGE_(STALE|UNAVAILABLE)$/.test(error.message));
  }
});

test('HTTP handler reports saved only after persistence and exposes fixed deferral codes',async()=>{
  const handler=createFixtureHandler({fixture,enabled:true,verifyUser:async()=>identity,
    runExtraction:async()=>({saved:true,receipt:{extractionId:'persisted'}})});
  const req=()=>new Request('http://local',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:'{"caseId":"E01"}'});
  assert.equal((await (await handler(req())).json()).saved,true);
  const deferred=createFixtureHandler({fixture,enabled:true,verifyUser:async()=>identity,
    runExtraction:async()=>{throw Object.assign(new Error('private details'),{code:'STORAGE_BUDGET'});}});
  const response=await deferred(req());assert.equal(response.status,429);
  assert.deepEqual(await response.json(),{error:'STORAGE_BUDGET'});
});
