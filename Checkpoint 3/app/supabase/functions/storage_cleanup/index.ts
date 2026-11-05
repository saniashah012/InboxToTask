import { createStorageRpc } from '../_shared/storage.mjs';

const rpc = createStorageRpc({ url: Deno.env.get('SUPABASE_URL'), serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
// A separate, narrowly scoped scheduler credential. Public keys and user JWTs
// do not authorize maintenance. Disabled until explicitly configured.
async function matches(value: string, expected: string) {
  const digest = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a,b] = await Promise.all([digest(value),digest(expected)]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let difference = 0;
  for (let i=0;i<aa.length;i++) difference |= aa[i]^bb[i];
  return difference===0;
}
Deno.serve(async (request) => {
  const headers = { 'Cache-Control':'no-store' };
  const secret = Deno.env.get('SCHEDULER_SECRET');
  if (Deno.env.get('ENABLE_STORAGE_CLEANUP')!=='true' || !secret || secret.length<32) {
    return Response.json({error:'CLEANUP_DISABLED'},{status:503,headers});
  }
  if (request.method!=='POST') return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405,headers});
  const token=/^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization')??'')?.[1];
  if (!token || !await matches(token,secret)) return Response.json({error:'AUTH_REQUIRED'},{status:401,headers});
  try { return Response.json(await rpc('storage_cleanup',{}),{headers}); }
  catch { return Response.json({error:'CLEANUP_FAILED'},{status:503,headers}); }
});
