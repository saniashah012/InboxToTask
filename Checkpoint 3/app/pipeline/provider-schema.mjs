// Adapter for responseSchema (OpenAPI-style Schema), NOT responseJsonSchema.
// Keep strict extraction.schema.mjs unchanged for backend validation.
export function toGeminiSchema(schema) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const nonNull = types.filter((type) => type !== 'null');
  if (nonNull.length !== 1 || !['object', 'array', 'string', 'integer', 'number', 'boolean'].includes(nonNull[0])) {
    throw new Error('UNSUPPORTED_PROVIDER_SCHEMA_TYPE');
  }
  const out = { type: nonNull[0].toUpperCase() };
  if (types.includes('null')) out.nullable = true;
  if (schema.enum) out.enum = [...schema.enum];
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)]));
  }
  if (schema.required) out.required = [...schema.required];
  if (schema.items) out.items = toGeminiSchema(schema.items);
  // Bounds, patterns and additionalProperties remain enforced by the backend.
  return out;
}

export function responseConfig(schema, mode = 'json-schema') {
  if (mode === 'openapi') return { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) };
  if (mode === 'json-schema') return { responseMimeType: 'application/json', responseJsonSchema: schema };
  throw new Error('INVALID_SCHEMA_MODE');
}
