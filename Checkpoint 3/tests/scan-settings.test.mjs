import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '../app/node_modules/@electric-sql/pglite/dist/index.js';

test('saved scanning settings: permissions, validation, revisions, and stale-work fencing',async(t)=>{
  const db=new PGlite();
  const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='44444444-4444-4444-8444-444444444444';
  const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
  const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
  const as=async(role,user,fn)=>{
    await db.exec(`set role ${role}`);
    await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user})]);
    try{return await fn();}finally{await db.exec('reset role');}
  };
  const rules={allow:{labels:[],keywords:[],senders:[' Teacher@Example.org ','teacher@example.org'],domains:[]},block:{labels:[],senders:[],domains:[],subjectKeywords:[' Newsletter ','newsletter']}};
  const context={maxMessages:0,maxAgeDays:30,maxMessageChars:12000,maxTotalChars:24000};
  const get=(user=A)=>as('authenticated',user,()=>scalar('select public.scan_settings_get()'));
  const save=(revision=0,r=rules,c=context,consent=false,paused=true,disclosure=null,user=A,semantic={include:[' School ','school'],exclude:[]})=>as('authenticated',user,()=>scalar('select public.scan_settings_save($1,$2,$3,$4,$5,$6,$7)',[revision,r,c,consent,paused,disclosure,semantic]));
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;grant usage on schema auth to anon,authenticated,service_role;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
    await q('insert into auth.users values($1,$2),($3,$4),($5,$6)',[A,'student@example.org',B,'b@example.org',C,'c@example.org']);
    const path=new URL('../app/supabase/migrations/',import.meta.url);
    const legacyUser='33333333-3333-4333-8333-333333333333';
    for(const name of (await readdir(path)).filter(n=>n.endsWith('.sql')).sort()) {
      if(name==='20261105160000_phrase_filters.sql') {
        await q('insert into auth.users values($1,$2)',[legacyUser,'legacy@example.test']);
        await q('insert into public.storage_preferences(user_id) values($1)',[legacyUser]);
        await q(`insert into public.scan_settings(user_id,consent,consent_at,disclosure_version,paused,rules)
          values($1,true,now(),'gmail-scan-v1',false,$2)`,[legacyUser,{allow:{labels:['School'],senders:[],domains:[],subjectKeywords:['assignment']},block:{labels:['Private'],senders:[],domains:[],subjectKeywords:['receipt']}}]);
      }
      if(name==='20261105200000_source_semantic_contract.sql') {
        await q("update public.scan_settings set rules=jsonb_set(rules,'{block,keywords}','[\"bank\"]'),context_limits=$1 where user_id=$2",[context,legacyUser]);
      }
      await db.exec(await readFile(new URL(name,path),'utf8'));
    }
    await t.test('obsolete permissions migrate without granting broader scope and require fresh consent',async()=>{
      const migrated=await get(legacyUser);
      assert.equal(migrated.paused,true);assert.equal(migrated.consent,false);assert.equal(migrated.revision,2);
      assert.equal(migrated.requires_review,true); assert.deepEqual(migrated.legacy_phrase_rules.block.keywords,['bank']);
      assert.deepEqual(migrated.context_limits,context);
      await as('authenticated',legacyUser,()=>assert.rejects(q('select public.scan_settings_save($1,$2,$3,false,true,null,$4)',[migrated.revision,migrated.rules,context,{include:[],exclude:[]}]),{code:'22023'}));
      assert.deepEqual(migrated.rules.allow.labels,[]);assert.deepEqual(migrated.rules.allow.keywords,[]);
      assert.deepEqual(migrated.rules.allow.subjectKeywords,[]);assert.deepEqual(migrated.rules.block.subjectKeywords,['receipt']);
      assert.equal(await scalar('select generation from public.storage_preferences where user_id=$1',[legacyUser]),3);
      await q('delete from auth.users where id=$1',[legacyUser]);
    });
    await t.test('new users default to no consent, pause, empty rules and five prior messages',async()=>{
      const settings=await get();assert.equal(settings.revision,0);assert.equal(settings.consent,false);assert.equal(settings.paused,true);
    assert.deepEqual(settings.rules.allow,{labels:[],senders:[],domains:[],subjectKeywords:[],keywords:[]});assert.equal(settings.context_limits.maxMessages,5);
    assert.equal(await scalar('select count(*) from public.scan_settings'),0);
  });
  await t.test('semantic category names and overlapping phrases save, reload, and remove independently',async()=>{
    const saved=await save(0,rules,context,false,true,null,C,{
      include:['School','homework','my custom phrase'],
      exclude:['Financial','invoice','custom exclusion'],
    });
    assert.deepEqual(saved.semantic_preferences,{include:['school','homework','my custom phrase'],exclude:['financial','invoice','custom exclusion']});
    const loaded=await get(C);
    assert.deepEqual(loaded.semantic_preferences,saved.semantic_preferences);

    const removedSuggestion=await save(1,rules,context,false,true,null,C,{
      include:['homework','my custom phrase'],
      exclude:['invoice','custom exclusion'],
    });
    assert.deepEqual(removedSuggestion.semantic_preferences,{
      include:['homework','my custom phrase'],
      exclude:['invoice','custom exclusion'],
    });
    assert.deepEqual((await get(C)).semantic_preferences,removedSuggestion.semantic_preferences);

    const removedCustom=await save(2,rules,context,false,true,null,C,{
      include:['School','homework'],
      exclude:['Financial','invoice'],
    });
    assert.deepEqual(removedCustom.semantic_preferences,{
      include:['school','homework'],
      exclude:['financial','invoice'],
    });
    assert.deepEqual((await get(C)).semantic_preferences,removedCustom.semantic_preferences);
  });
    await t.test('anonymous, owner injection and direct writes cannot bypass the RPC',async()=>{
      await as('anon',A,()=>assert.rejects(q('select public.scan_settings_get()'),{code:'42501'}));
      await as('authenticated',null,()=>assert.rejects(q('select public.scan_settings_get()'),{code:'42501'}));
      await as('authenticated',A,()=>assert.rejects(q('insert into public.scan_settings(user_id) values($1)',[B]),{code:'42501'}));
      await as('authenticated',A,()=>assert.rejects(q('select private.normalize_scan_rules($1)',[rules]),{code:'42501'}));
    });
    await t.test('saving normalizes and deduplicates, without giving consent',async()=>{
      const saved=await save();assert.equal(saved.revision,1);assert.equal(saved.consent,false);assert.equal(saved.consent_at,null);
      assert.deepEqual(saved.rules.allow.keywords,[]);assert.deepEqual(saved.rules.allow.senders,['teacher@example.org']);assert.deepEqual(saved.rules.allow.subjectKeywords,[]);
      assert.deepEqual(saved.rules.block.subjectKeywords,['newsletter']);
      assert.deepEqual(saved.semantic_preferences,{include:['school'],exclude:[]});
      assert.equal((await get()).revision,1);assert.equal((await get(B)).revision,0);
      assert.deepEqual(await as('authenticated',B,()=>q('select * from public.scan_settings')),[]);
    });
    await t.test('malformed lists, addresses, domains, unknown keys and invalid context fail closed',async()=>{
      for(const altered of [
        {...rules,allow:{...rules.allow,senders:['Teacher <teacher@example.org>']}},
        {...rules,allow:{...rules.allow,domains:['bad..example.org']}},
        {...rules,allow:{...rules.allow,labels:['School']}},
        {...rules,allow:{...rules.allow,keywords:['assignment']}},
        {...rules,allow:{...rules.allow,keywords:null}},
        {...rules,allow:{...rules.allow,keywords:Array(201).fill('x')}},
        {...rules,allow:{...rules.allow,subjectKeywords:null}},
        {...rules,allow:{...rules.allow,subjectKeywords:['  ']}},
        {...rules,allow:{...rules.allow,labels:Array(201).fill('x')}},
        {...rules,allow:{...rules.allow,subjectKeywords:['x'.repeat(255)]}},
        {...rules,user_id:B}, {...rules,allow:{...rules.allow,extra:[]}},
      ]) await assert.rejects(save(1,altered),{code:'22023'});
      for(const altered of [{...context,maxMessages:11},{...context,maxMessages:0.5},{...context,maxAgeDays:0},{...context,maxTotalChars:100},{...context,maxMessages:'1'},{...context,extra:1}])
        await assert.rejects(save(1,rules,altered),{code:'22023'});
      await assert.rejects(save(null),{code:'22023'});
      assert.equal((await get()).revision,1);
    });
    await t.test('explicit versioned consent and stale saves are enforced',async()=>{
      await assert.rejects(save(1,rules,context,true,false),{code:'22023'});
      const saved=await save(1,rules,context,true,false,'gmail-scan-v1');assert.equal(saved.consent,true);assert.ok(saved.consent_at);
      await assert.rejects(save(1),{code:'PT409'});assert.equal((await get()).revision,2);
    });
    await t.test('settings changes cancel in-flight work and preserve accepted tasks',async()=>{
      await q("insert into public.tasks(user_id,title,status) values($1,'Accepted task','pending')",[A]);
      const meta={namespace:'fixture',messageId:'E01',threadId:'thread-E01',subject:'Fictional',sender:'teacher@example.org',sentAt:'2026-10-05T12:00:00Z',model:'test-model'};
      const lease=await as('service_role',A,()=>scalar('select public.storage_claim($1,$2,$3,$4,$5)',[A,'a'.repeat(64),'b'.repeat(64),meta,1000]));
      assert.equal(lease.state,'claimed');
      const generation=await scalar('select generation from public.storage_preferences where user_id=$1',[A]);
      await save(2);
      assert.equal(await scalar('select generation from public.storage_preferences where user_id=$1',[A]),generation+1);
      await as('service_role',A,()=>assert.rejects(q('select public.storage_finish($1,$2,$3,$4,$5)',[A,lease.jobId,lease.leaseToken,{},meta]),{code:'PT409'}));
      assert.equal(await scalar('select state from private.storage_jobs where id=$1',[lease.jobId]),'cancelled');
      assert.equal(await scalar('select count(*) from public.tasks where user_id=$1',[A]),1);
      const revoked=await get();assert.equal(revoked.consent,false);assert.equal(revoked.consent_at,null);
    });
    await t.test('manual Gmail claims require saved consent, serialize, and fence changed settings/connections',async()=>{
      const scan=(action,data={},user=A)=>as('service_role',user,()=>scalar('select public.gmail_scan_service($1,$2,$3)',[user,action,data]));
      await as('authenticated',A,()=>assert.rejects(q('select public.gmail_scan_service($1,$2,$3)',[A,'claim',{mode:'initial'}]),{code:'42501'}));
      await assert.rejects(scan('claim',{mode:'initial'}),{code:'PT409'});
      await save(3,rules,context,true,false,'gmail-scan-v1');
      await q("insert into private.google_connections(user_id,state,email,scopes) values($1,'connected','student@example.org','[\"https://www.googleapis.com/auth/gmail.readonly\"]')",[A]);
      const claim=await scan('claim',{mode:'initial'}); assert.equal(claim.state,'claimed');
      assert.equal((Date.parse(claim.end)-Date.parse(claim.start))/86400000,7);
      assert.equal((await scan('claim',{mode:'initial'})).state,'busy');
      assert.equal((await scan('assert',{lease:claim.lease})).state,'current');
      await assert.rejects(scan('assert',{lease:null}),{code:'PT409'});
      await assert.rejects(scan('assert',{lease:claim.lease},B),{code:'PT409'});
      await scan('finish',{lease:claim.lease,continuation:{pending:['gmail1'],next:null},result:{modelCalls:0}});
      await q("update private.gmail_scan_work set last_started=now()-interval '2 minutes'");
      const more=await scan('claim',{mode:'more'}); assert.deepEqual(more.continuation.pending,['gmail1']);
      await q('update private.google_connections set generation=generation+1 where user_id=$1',[A]);
      await assert.rejects(scan('assert',{lease:more.lease}),{code:'PT409'});
      await q("update private.gmail_scan_work set lease_until=now()-interval '1 second',last_started=now()-interval '2 minutes'");
      await assert.rejects(scan('claim',{mode:'more'}),{code:'PT409'});
      await q('update public.storage_preferences set enabled=false where user_id=$1',[A]);
      await assert.rejects(scan('claim',{mode:'initial'}),{code:'PT409'});
      await q('update public.storage_preferences set enabled=true where user_id=$1',[A]);
      const fresh=await scan('claim',{mode:'initial'});await save(4);
      await assert.rejects(scan('assert',{lease:fresh.lease}),{code:'PT409'});
    });
    await t.test('account deletion removes saved privacy settings',async()=>{
      await q('delete from auth.users where id=$1',[A]);assert.equal(await scalar('select count(*) from public.scan_settings where user_id=$1',[A]),0);
    });
  } finally {await db.close();}
});
