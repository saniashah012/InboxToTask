const problem = (code) => Object.assign(new Error(code), { code });
const bytes = (value) => new TextEncoder().encode(value).byteLength;
async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Never pass a privileged database key to the browser. No native/provider prose
// is logged or included in exceptions from this transport.
export function createStorageRpc({ url, serviceKey, fetchImpl = fetch }) {
  return async (name, args) => {
    if (!url || !serviceKey) throw problem('STORAGE_NOT_CONFIGURED');
    let response;
    try {
      response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json' }, body: JSON.stringify(args),
        signal: AbortSignal.timeout(15000), redirect: 'error',
      });
    } catch { throw problem('STORAGE_UNAVAILABLE'); }
    if (!response.ok) {
      let code;
      try { code = (await response.json()).code; } catch { /* sanitized below */ }
      throw problem(code === 'PT409' ? 'STORAGE_STALE' : 'STORAGE_UNAVAILABLE');
    }
    try { return response.status === 204 ? null : await response.json(); }
    catch { throw problem('STORAGE_UNAVAILABLE'); }
  };
}

export function createStoredProcessor({ rpc, extractFn, prepareInput, settings, systemPrompt, schema }) {
  return async (input, identity) => {
    if (!identity?.id) throw problem('STORAGE_NOT_CONFIGURED');
    const prepared = prepareInput(input, settings.contextLimits);
    if (prepared.status !== 'prepared') return { ...prepared, modelCalls: 0, saved: false };
    const config = { settings, systemPrompt, schema };
    const configKey = await hash(config);
    // Content/context and effective settings are hashed transiently, never saved
    // as a raw inbox cache. User scoping is enforced separately in SQL.
    const key = await hash({ payload: prepared.payload, configKey });
    const meta = { namespace: 'fixture', messageId: input.message.id,
      threadId: input.message.threadId, subject: input.message.subject,
      sender: input.message.from, sentAt: input.message.sentAt,
      analysisTime: input.analysisTime, version: settings.version, model: settings.model };
    // A conservative byte-based reservation, not a provider tokenizer reading.
    // Unknown-cost failures keep it reserved; successful usage reconciles it.
    const reserve = bytes(JSON.stringify(prepared.payload)) + bytes(systemPrompt)
      + bytes(JSON.stringify(schema)) + settings.maxOutputTokens;
    if (reserve > 150000) throw problem('STORAGE_INPUT_TOO_LARGE');
    const claim = await rpc('storage_claim', { p_user_id: identity.id, p_key: key,
      p_config: configKey, p_meta: meta, p_reserve: reserve });
    if (claim.state === 'cached') return { messageId: input.message.id, saved: true,
      reused: true, modelCalls: 0, receipt: claim.receipt };
    const denied = { busy: 'STORAGE_BUSY', paused: 'STORAGE_PAUSED', suppressed: 'STORAGE_SUPPRESSED',
      budget_deferred: 'STORAGE_BUDGET', provider_deferred: 'STORAGE_PROVIDER_LIMIT', retry_later: 'STORAGE_RETRY_LATER', attempt_limit: 'STORAGE_ATTEMPT_LIMIT' };
    if (claim.state !== 'claimed') throw problem(denied[claim.state] ?? 'STORAGE_UNAVAILABLE');
    const lease = { p_user_id: identity.id, p_job_id: claim.jobId, p_lease: claim.leaseToken };
    let output;
    try {
      output = await extractFn(input);
      const receipt = await rpc('storage_finish', { ...lease, p_output: output, p_meta: meta });
      // Return identifiers, not a second durable copy of all evidence/model text.
      return { messageId: input.message.id, saved: true, reused: false,
        modelCalls: output.modelCalls, receipt };
    } catch (error) {
      try { await rpc('storage_fail', { ...lease,
        p_code: error?.code === 'PROVIDER_HTTP_429' ? 'rate_limited' : 'unavailable' }); }
      catch { /* Expiring leases allow recovery when failure bookkeeping fails. */ }
      throw error;
    }
  };
}
