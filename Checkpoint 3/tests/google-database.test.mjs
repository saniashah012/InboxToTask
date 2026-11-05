import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../app/node_modules/@electric-sql/pglite/dist/index.js';

test('Google SQL grants, isolation, single-use state, refresh leases and disconnect fencing',async(t)=>{
  const db=new PGlite();
  const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
  const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
  const rpc=async(user,action,data={})=>(await q('select public.google_connection_service($1,$2,$3) as result',[user,action,data]))[0].result;
  const as=async(role,user,fn)=>{
    await db.exec(`set role ${role}`);await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user})]);
    try{return await fn();}finally{await db.exec('reset role');}
  };
  const stateHash='a'.repeat(64);
  const start=()=>rpc(A,'start',{hash:stateHash,email:'student@example.org',verifier:'encrypted-verifier'});
  const finish=(generation)=>rpc(A,'finish',{generation,email:'student@example.org',subject:'12345',credentials:'encrypted-credentials',scopes:['https://www.googleapis.com/auth/gmail.readonly'],expiresAt:'2020-01-01T00:00:00Z'});
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema private;grant usage on schema private to authenticated,service_role;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
    await q('insert into auth.users values($1,$2),($3,$4)',[A,'student@example.org',B,'b@example.org']);
    await db.exec(await readFile(new URL('../app/supabase/migrations/20261105060000_google_connections.sql',import.meta.url),'utf8'));
    await t.test('service credentials and state cannot be read by browser roles',async()=>{
      for(const role of ['anon','authenticated']){
        await as(role,A,()=>assert.rejects(q('select * from private.google_connections'),{code:'42501'}));
        await as(role,A,()=>assert.rejects(q('select * from private.google_oauth_states'),{code:'42501'}));
        await as(role,A,()=>assert.rejects(rpc(A,'start',{}),{code:'42501'}));
      }
      await as('anon',A,()=>assert.rejects(q('select public.google_connection_status()'),{code:'42501'}));
    });
    await t.test('owner state is single use, bounded, and expires',async()=>{
      assert.equal((await as('service_role',A,start)).state,'started');
      assert.equal((await start()).state,'busy');
      const pending=await rpc(null,'consume',{hash:stateHash});assert.equal(pending.userId,A);assert.equal(pending.generation,1);
      assert.equal((await rpc(null,'consume',{hash:stateHash})).state,'invalid_state');
      await q("update private.google_connections set last_started_at=now()-interval '1 minute'");
      await start();await q("update private.google_oauth_states set expires_at=now()-interval '1 second'");
      assert.equal((await rpc(null,'consume',{hash:stateHash})).state,'invalid_state');
    });
    await t.test('NULL generation and wrong email cannot finish a connection',async()=>{
      assert.equal((await finish(null)).state,'stale');
      assert.equal((await rpc(A,'finish',{generation:2,email:'b@example.org'})).state,'account_mismatch');
      assert.equal((await finish(2)).state,'connected');
      const safe=await as('authenticated',A,()=>q('select public.google_connection_status() as result'));
      assert.equal(safe[0].result.state,'connected');assert.equal(safe[0].result.scanningEnabled,false);
      assert.ok(!JSON.stringify(safe).includes('encrypted-credentials'));
      const other=await as('authenticated',B,()=>q('select public.google_connection_status() as result'));
      assert.equal(other[0].result.state,'disconnected');assert.ok(!JSON.stringify(other).includes('student@example.org'));
    });
    await t.test('refresh claims serialize and reject NULL/wrong leases',async()=>{
      const claim=await rpc(A,'refresh_claim');assert.equal(claim.state,'refresh');
      assert.equal((await rpc(A,'refresh_claim')).state,'busy');
      assert.equal((await rpc(A,'refresh_finish',{generation:2,lease:null})).state,'stale');
      assert.equal((await rpc(A,'refresh_finish',{generation:2,lease:claim.lease,credentials:'refreshed',expiresAt:'2099-01-01T00:00:00Z'})).state,'ready');
      assert.equal((await rpc(A,'refresh_claim')).state,'ready');
    });
    await t.test('disconnect invalidates pending callbacks and refreshes before revocation',async()=>{
      await q("update private.google_connections set last_started_at=now()-interval '1 minute'");
      await start(); const pending=await rpc(null,'consume',{hash:stateHash});
      await q("update private.google_connections set expires_at='2020-01-01'");const claim=await rpc(A,'refresh_claim');
      const stop=await rpc(A,'disconnect');assert.equal(stop.state,'disconnecting');
      assert.equal((await finish(pending.generation)).state,'stale');
      assert.equal((await rpc(A,'refresh_finish',{generation:claim.generation,lease:claim.lease})).state,'stale');
      assert.equal((await start()).state,'disconnecting');assert.equal((await rpc(A,'refresh_claim')).state,'disconnecting');
      assert.equal((await rpc(A,'disconnect_finish',{generation:null})).state,'stale');
      assert.equal((await rpc(A,'disconnect_finish',{generation:stop.generation})).state,'disconnected');
      const row=(await q('select credentials,email,subject from private.google_connections'))[0];
      assert.deepEqual(row,{credentials:null,email:null,subject:null});
    });
    await t.test('account deletion cascades private state and credentials',async()=>{
      await q('delete from auth.users where id=$1',[A]);
      assert.equal((await q('select * from private.google_connections')).length,0);
      assert.equal((await q('select * from private.google_oauth_states')).length,0);
    });
  } finally { await db.close(); }
});
