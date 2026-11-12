import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '../app/node_modules/@electric-sql/pglite/dist/index.js';
import {STARTER_BLOCKED_WORDS,STARTER_TOPIC_WORDS} from '../app/pipeline/private-topics.mjs';

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
    const legacyUser='33333333-3333-4333-8333-333333333333',convertedUser='55555555-5555-4555-8555-555555555555';
    for(const name of (await readdir(path)).filter(n=>n.endsWith('.sql')).sort()) {
      if(name==='20261105160000_phrase_filters.sql') {
        await q('insert into auth.users values($1,$2)',[legacyUser,'legacy@example.test']);
        await q('insert into public.storage_preferences(user_id) values($1)',[legacyUser]);
        await q(`insert into public.scan_settings(user_id,consent,consent_at,disclosure_version,paused,rules)
          values($1,true,now(),'gmail-scan-v1',false,$2)`,[legacyUser,{allow:{labels:['School'],senders:[],domains:[],subjectKeywords:['assignment']},block:{labels:['Private'],senders:[],domains:[],subjectKeywords:['receipt']}}]);
      }
      if(name==='20261109200000_private_topic_words.sql') {
        await q('insert into auth.users values($1,$2)',[convertedUser,'converted@example.test']);
        await q('insert into public.storage_preferences(user_id) values($1)',[convertedUser]);
        await q(`insert into public.scan_settings(user_id,semantic_preferences) values($1,'{"include":["school"],"exclude":["health","rowing team"]}')`,[convertedUser]);
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
    assert.equal(await scalar('select count(*) from public.scan_settings where user_id=$1',[A]),0);
  });
  await t.test('semantic category names and overlapping phrases save, reload, and remove independently',async()=>{
    const saved=await save(0,rules,context,false,true,null,C,{
      include:['School','homework','my custom phrase'],
      exclude:['Financial','invoice','custom exclusion'],
    });
    assert.deepEqual(saved.semantic_preferences,{include:['school','homework','my custom phrase'],exclude:['financial','invoice','custom exclusion'],
      blockedWords:{financial:STARTER_BLOCKED_WORDS.financial,invoice:['invoice'],'custom exclusion':['custom exclusion']},
      includeWords:{school:STARTER_TOPIC_WORDS.school,homework:['homework'],'my custom phrase':['my custom phrase']}});
    const loaded=await get(C);
    assert.deepEqual(loaded.semantic_preferences,saved.semantic_preferences);

    const removedSuggestion=await save(1,rules,context,false,true,null,C,{
      include:['homework','my custom phrase'],
      exclude:['invoice','custom exclusion'],
    });
    assert.deepEqual(removedSuggestion.semantic_preferences,{
      include:['homework','my custom phrase'],
      exclude:['invoice','custom exclusion'],
      blockedWords:{invoice:['invoice'],'custom exclusion':['custom exclusion']},
      includeWords:{homework:['homework'],'my custom phrase':['my custom phrase']},
    });
    assert.deepEqual((await get(C)).semantic_preferences,removedSuggestion.semantic_preferences);

    const removedCustom=await save(2,rules,context,false,true,null,C,{
      include:['School','homework'],
      exclude:['Financial','invoice'],
    });
    assert.deepEqual(removedCustom.semantic_preferences,{
      include:['school','homework'],
      exclude:['financial','invoice'],
      blockedWords:{financial:STARTER_BLOCKED_WORDS.financial,invoice:['invoice']},
      includeWords:{school:STARTER_TOPIC_WORDS.school,homework:['homework']},
    });
    assert.deepEqual((await get(C)).semantic_preferences,removedCustom.semantic_preferences);
  });
  await t.test('private topic word lists: starter parity, conversion, round trip, carry-over and revision fencing',async()=>{
    for(const [topic,words] of Object.entries(STARTER_BLOCKED_WORDS))
      assert.deepEqual(await scalar('select private.starter_blocked_words($1)',[topic]),words,topic);
    // Saved names converted to starter lists, or the name itself, erring toward blocking.
    assert.deepEqual((await get(convertedUser)).semantic_preferences,{include:['school'],exclude:['health','rowing team'],
      blockedWords:{health:STARTER_BLOCKED_WORDS.health,'rowing team':['rowing team']},includeWords:{school:STARTER_TOPIC_WORDS.school}});
    const D='66666666-6666-4666-8666-666666666666';
    await q('insert into auth.users values($1,$2)',[D,'d@example.org']);
    assert.deepEqual((await get(D)).semantic_preferences,{include:[],exclude:[],blockedWords:{}});
    const edited=await save(0,rules,context,false,true,null,D,{include:[],exclude:[' Health ','Clubs'],
      blockedWords:{Health:[' Lab   Results ','diagnosis','DIAGNOSIS'],clubs:['chess club']}});
    assert.deepEqual(edited.semantic_preferences.blockedWords,{health:['lab results','diagnosis'],clubs:['chess club']});
    assert.deepEqual((await get(D)).semantic_preferences,edited.semantic_preferences);
    // An older client that sends names only keeps the edited lists of topics that stay excluded.
    const older=await save(1,rules,context,false,true,null,D,{include:[],exclude:['health','new topic']});
    assert.deepEqual(older.semantic_preferences.blockedWords,{health:['lab results','diagnosis'],'new topic':['new topic']});
    await as('authenticated',D,()=>assert.rejects(q('select public.scan_settings_save($1,$2,$3,false,true,null,$4)',
      [1,rules,context,{include:[],exclude:['health'],blockedWords:{health:['x']}}]),{code:'PT409'}));
    assert.deepEqual((await get(D)).semantic_preferences.blockedWords.health,['lab results','diagnosis']);
    for(const bad of [{health:[]},{health:['!!!']},{health:['a'.repeat(101)]},{health:['tab	here']},{health:'diagnosis'},
      {health:Array.from({length:101},(_,i)=>`w${i}`)}])
      await as('authenticated',D,()=>assert.rejects(q('select public.scan_settings_save($1,$2,$3,false,true,null,$4)',
        [2,rules,context,{include:[],exclude:['health'],blockedWords:bad}]),{code:'22023'},JSON.stringify(bad)));
    await as('authenticated',D,()=>assert.rejects(q('select public.scan_settings_save($1,$2,$3,false,true,null,$4)',
      [2,rules,context,{include:[],exclude:[],extra:[]}]),{code:'22023'}));
    await as('authenticated',D,()=>assert.rejects(q('select private.starter_blocked_words($1)',['health']),{code:'42501'}));
  });
  await t.test('topic-to-check word lists: starter parity, round trip, carry-over and validation',async()=>{
    for(const [topic,words] of Object.entries(STARTER_TOPIC_WORDS))
      assert.deepEqual(await scalar('select private.starter_topic_words($1)',[topic]),words,topic);
    const E='77777777-7777-4777-8777-777777777777';
    await q('insert into auth.users values($1,$2)',[E,'e@example.org']);
    const edited=await save(0,rules,context,false,true,null,E,{include:[' School ','Band'],exclude:[],
      includeWords:{School:[' Office   Hours ','syllabus','SYLLABUS'],band:['rehearsal']}});
    assert.deepEqual(edited.semantic_preferences.includeWords,{school:['office hours','syllabus'],band:['rehearsal']});
    assert.deepEqual((await get(E)).semantic_preferences,edited.semantic_preferences);
    // An older client that sends names only keeps the edited lists of topics that stay selected.
    const older=await save(1,rules,context,false,true,null,E,{include:['school','meetings'],exclude:[]});
    assert.deepEqual(older.semantic_preferences.includeWords,{school:['office hours','syllabus'],meetings:STARTER_TOPIC_WORDS.meetings});
    // Removing every topic to check removes every list, so nothing is required.
    const none=await save(2,rules,context,false,true,null,E,{include:[],exclude:[],includeWords:{school:['syllabus']}});
    assert.deepEqual(none.semantic_preferences.includeWords,{});
    for(const bad of [{school:[]},{school:['!!!']},{school:['a'.repeat(101)]},{school:'syllabus'}])
      await as('authenticated',E,()=>assert.rejects(q('select public.scan_settings_save($1,$2,$3,false,true,null,$4)',
        [3,rules,context,{include:['school'],exclude:[],includeWords:bad}]),{code:'22023'},JSON.stringify(bad)));
    await as('authenticated',E,()=>assert.rejects(q('select private.starter_topic_words($1)',['school']),{code:'42501'}));
  });
  await t.test('a topic to check stands in for a permitted sender; with neither, scans are refused',async()=>{
    const F='88888888-8888-4888-8888-888888888888';
    await q('insert into auth.users values($1,$2)',[F,'f@example.org']);
    const none={allow:{labels:[],keywords:[],senders:[],domains:[]},block:{labels:[],senders:['ads@example.org'],domains:[],subjectKeywords:[]}};
    await save(0,none,context,true,false,'gmail-scan-v1',F,{include:[],exclude:[]});
    await q('update public.storage_preferences set enabled=true where user_id=$1',[F]);
    await q("insert into private.google_connections(user_id,state,email,scopes) values($1,'connected','f@example.org',$2)",[F,JSON.stringify(['https://www.googleapis.com/auth/gmail.readonly'])]);
    const scan=()=>as('service_role',F,()=>scalar('select public.gmail_scan_service($1,$2,$3)',[F,'claim',{mode:'initial'}]));
    await assert.rejects(scan(),{code:'PT409'});
    await save(1,none,context,true,false,'gmail-scan-v1',F,{include:['school'],exclude:[]});
    const claim=await scan(); assert.equal(claim.state,'claimed');
    // A save makes unfinished work stale, so it is cleared and the next check starts fresh.
    await as('service_role',F,()=>scalar('select public.gmail_scan_service($1,$2,$3)',[F,'finish',{lease:claim.lease,continuation:{pending:['gmail1'],next:null},result:{modelCalls:0}}]));
    assert.ok(await scalar('select continuation is not null from private.gmail_scan_work where user_id=$1',[F]));
    await save(2,none,context,true,false,'gmail-scan-v1',F,{include:['school'],exclude:[]});
    assert.equal(await scalar('select continuation from private.gmail_scan_work where user_id=$1',[F]),null);
    const permitted=(from,r)=>scalar('select private.gmail_permitted($1,$2)',[{from,subject:'Hi'},r]);
    assert.equal(await permitted('anyone@example.net',none),true);
    assert.equal(await permitted('ads@example.org',none),false);
    assert.equal(await permitted('anyone@example.net',rules),false);
    assert.equal(await scalar('select private.scan_sources_ready($1,$2)',[none,{include:[],exclude:[]}]),false);
    await as('authenticated',F,()=>assert.rejects(q('select private.scan_sources_ready($1,$2)',[none,{include:[]}]),{code:'42501'}));
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
      assert.deepEqual(saved.semantic_preferences,{include:['school'],exclude:[],blockedWords:{},includeWords:{school:STARTER_TOPIC_WORDS.school}});
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
