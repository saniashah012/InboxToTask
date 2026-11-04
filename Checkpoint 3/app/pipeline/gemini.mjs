import { PipelineError } from './core.mjs';
import { responseConfig } from './provider-schema.mjs';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createGeminiGenerator({ apiKey, fetchImpl = fetch, sleepImpl = sleep }) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /replace_with|your_actual|your_.*key/i.test(apiKey)) throw new PipelineError('MISSING_API_KEY');
  return async ({ payload, systemPrompt, settings, schema }) => {
    if (!/^[a-z0-9.-]+$/.test(settings.model) || !['LOW', 'MEDIUM', 'HIGH'].includes(settings.thinkingLevel)
      || !Number.isInteger(settings.maxAttempts) || settings.maxAttempts < 1 || settings.maxAttempts > 3) throw new PipelineError('INVALID_MODEL_SETTINGS');
    const started = Date.now();
    for (let attempt = 1; attempt <= settings.maxAttempts; attempt++) {
      let response;
      try {
        response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(settings.timeoutMs),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
            generationConfig: { ...responseConfig(schema, settings.schemaMode),
              maxOutputTokens: settings.maxOutputTokens, thinkingConfig: { thinkingLevel: settings.thinkingLevel } },
          }),
        });
      } catch {
        // Never expose native fetch errors: they may contain request/header data.
        throw new PipelineError('NETWORK_OR_TIMEOUT');
      }
      if (!response.ok) {
        const retry = [429, 500, 502, 503, 504].includes(response.status);
        const retryAfter = response.headers.get('retry-after');
        // Whitelist diagnostic hints only. Never emit provider prose, which can
        // echo request data or credentials, even in an INVALID_ARGUMENT error.
        let detail = {};
        try {
          const errorBody = await response.json();
          const message = String(errorBody.error?.message ?? '').toLowerCase();
          detail = {
            mentionsThinking: /thinking/.test(message),
            mentionsSchema: /schema/.test(message),
            mentionsUnsupported: /not supported|unsupported|unknown name|unrecognized/.test(message),
            mentionsComplexity: /complex|nesting|too many/.test(message),
            mentionsModel: /model/.test(message),
            knownFields: ['thinkingLevel', 'thinkingConfig', 'responseJsonSchema', 'responseMimeType', 'maxOutputTokens', 'additionalProperties', 'maxItems', 'pattern']
              .filter((field) => message.includes(field.toLowerCase())),
          };
        } catch { /* No raw diagnostic fallback. */ }
        if (retry && attempt < settings.maxAttempts) {
          const seconds = retryAfter === null ? NaN : Number(retryAfter);
          if (Number.isFinite(seconds) && seconds > 30) throw new PipelineError('PROVIDER_RETRY_LATER');
          await sleepImpl(Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 1000 * 2 ** (attempt - 1));
          continue;
        }
        const error = new PipelineError(`PROVIDER_HTTP_${response.status}`);
        error.providerDiagnostic = detail;
        throw error;
      }
      let data;
      try { data = await response.json(); } catch { throw new PipelineError('INVALID_PROVIDER_RESPONSE'); }
      const usage = {
        inputTokens: data.usageMetadata?.promptTokenCount ?? null,
        cachedInputTokens: data.usageMetadata?.cachedContentTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
        thinkingTokens: data.usageMetadata?.thoughtsTokenCount ?? null,
        totalTokens: data.usageMetadata?.totalTokenCount ?? null,
      };
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') {
        const error = new PipelineError(candidate?.finishReason === 'MAX_TOKENS' ? 'OUTPUT_TRUNCATED' : 'MODEL_BLOCKED_OR_INCOMPLETE');
        error.usage = usage; throw error;
      }
      const raw = candidate.content?.parts?.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
      let value;
      try { value = JSON.parse(raw); } catch { const e = new PipelineError('INVALID_OUTPUT_JSON'); e.usage = usage; throw e; }
      return { value, attempts: attempt, usage, latencyMs: Date.now() - started,
        modelVersion: typeof data.modelVersion === 'string' && /^[a-zA-Z0-9._/-]{1,150}$/.test(data.modelVersion) ? data.modelVersion : null };
    }
  };
}
