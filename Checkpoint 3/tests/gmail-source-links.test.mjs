import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '../app/node_modules/@electric-sql/pglite/dist/index.js';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const fields={action:'Submit report',requirements:[],condition:null,deadline:null};

test('task source links survive expiry, stay owner-only, and hide deleted sources',async()=>{
 const db=new PGlite();
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const links=async(tasks,user=A,role='authenticated')=>{
  await db.exec(`set role ${role}`);await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(user?{sub:user}:{})]);
  try{return (await q('select public.gmail_task_source_links($1::uuid[]) r',[tasks]))[0].r;}finally{await db.exec('reset role');}
 };
 // Seeds rows directly: this covers the read contract, not the scan pipeline.
 const source=async(user,message,metadata=null,namespace='gmail')=>(await q(
  `insert into public.storage_sources(user_id,namespace,connection_key,message_id,thread_id,subject,sender,sent_at,permission_metadata)
   values($1,$2,'sub',$3,'thread1',$4,'teacher@example.org','2026-11-01T12:00:00Z',$5) returning id`,
  [user,namespace,message,`Subject ${message}`,metadata&&JSON.stringify(metadata)]))[0].id;
 const extraction=async(user,src,key)=>(await q(
  `insert into public.storage_extractions(user_id,source_id,extraction_key,config_key,version,model,analysis_time,category,classification_confidence,needs_review,warnings)
   values($1,$2,$3,$3,'v','m',now(),'Actionable',90,false,'[]') returning id`,[user,src,key.repeat(64)]))[0].id;
 const evidence=async(user,ext,message)=>(await q(
  `insert into public.storage_evidence(user_id,extraction_id,message_id,quote) values($1,$2,$3,'Fictional quote.') returning id`,[user,ext,message]))[0].id;
 const task=async(user,ext,ev,index=0)=>{
  const suggestion=(await q(`insert into public.storage_suggestions(user_id,extraction_id,item_index,fields,evidence_id,state) values($1,$2,$3,$4,$5,'approved') returning id`,[user,ext,index,JSON.stringify(fields),ev]))[0].id;
  const id=(await q(`insert into public.tasks(user_id,title,status,accepted_fields,origin_suggestion_id) values($1,'Submit report','approved',$2,$3) returning id`,[user,JSON.stringify(fields),suggestion]))[0].id;
  await q('insert into public.storage_task_sources(user_id,task_id,suggestion_id) values($1,$2,$3)',[user,id,suggestion]);
  return id;
 };
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to anon,authenticated,service_role;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
  await q('insert into auth.users values($1,$2),($3,$4)',[A,'student@example.org',B,'other@example.org']);
  const path=new URL('../app/supabase/migrations/',import.meta.url);
  for(const name of (await readdir(path)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,path),'utf8'));

  const srcOne=await source(A,'original'),extOne=await extraction(A,srcOne,'a'),evOne=await evidence(A,extOne,'original');
  const first=await task(A,extOne,evOne);
  const [created]=await links([first]);
  assert.equal(created.role,'created');assert.equal(created.messageId,'original');assert.equal(created.threadId,'thread1');
  assert.equal(created.earlierMessage,false);assert.equal(created.sender,'teacher@example.org');assert.equal(created.quote,'Fictional quote.');

  // An approved update stays linked after the proposal and its excerpt expire.
  const srcTwo=await source(A,'update'),extTwo=await extraction(A,srcTwo,'b'),evTwo=await evidence(A,extTwo,'update');
  await q(`insert into public.gmail_task_changes(user_id,extraction_id,evidence_id,target_task_id,expected_revision,kind,changed_fields,reason,state,expires_at)
   values($1,$2,$3,$4,0,'edit','["deadline"]','Fictional.','approved',now()-interval '1 day')`,[A,extTwo,evTwo,first]);
  await q(`update public.storage_evidence set expires_at=now()-interval '1 day' where id=$1`,[evTwo]);
  await q(`update public.storage_suggestions set expires_at=now()-interval '1 day' where extraction_id=$1`,[extOne]);
  const expired=await links([first]);
  assert.deepEqual(expired.map(l=>l.role).sort(),['created','updated']);
  const updated=expired.find(l=>l.role==='updated');
  assert.equal(updated.messageId,'update');assert.equal(updated.quote,null,'expired quote is not returned');

  // A quote from an earlier message uses that message's details, not the scanned one's.
  const earlier={id:'earlier',threadId:'thread1',from:'advisor@example.org',subject:'Earlier subject',sentAt:'2026-10-20T12:00:00.000Z',labels:[]};
  const srcThree=await source(A,'latest',[earlier]),extThree=await extraction(A,srcThree,'c'),evThree=await evidence(A,extThree,'earlier');
  const second=await task(A,extThree,evThree);
  const [cited]=await links([second]);
  assert.equal(cited.messageId,'earlier');assert.equal(cited.earlierMessage,true);assert.equal(cited.sender,'advisor@example.org');
  assert.equal(cited.subject,'Earlier subject');assert.equal(cited.sentAt,earlier.sentAt);

  // When a re-scan or deletion removed that metadata, the link falls back to the scanned message.
  await q(`update public.storage_sources set permission_metadata='[]' where id=$1`,[srcThree]);
  const [fallback]=await links([second]);
  assert.equal(fallback.messageId,'latest');assert.equal(fallback.earlierMessage,false);assert.equal(fallback.sender,'teacher@example.org');

  // Another user and anonymous callers get nothing; fixture rows never produce Gmail links.
  assert.deepEqual(await links([first],B),[]);
  await assert.rejects(links([first],null),{code:'42501'});
  await assert.rejects(links([first],A,'anon'),{code:'42501'});
  const srcFixture=await source(A,'E01',null,'fixture'),extFixture=await extraction(A,srcFixture,'d'),evFixture=await evidence(A,extFixture,'E01');
  assert.deepEqual(await links([await task(A,extFixture,evFixture)]),[]);
  await assert.rejects(links(Array.from({length:201},()=>first)),{code:'22023'});

  // A deleted source disappears, while the accepted task keeps its other link.
  await q(`update public.storage_sources set deleted_at=now() where id=$1`,[srcOne]);
  assert.deepEqual((await links([first])).map(l=>l.role),['updated']);
  await q(`update public.tasks set deleted_at=now() where id=$1`,[first]);
  assert.deepEqual(await links([first]),[]);
 }finally{await db.close();}
});
