// Canonical JSON contract and strict backend validator. provider-schema.mjs
// derives the less restrictive OpenAPI provider representation when selected.
const text = (maxLength = 500) => ({ type: 'string', minLength: 1, maxLength });
const nullable = (schema) => ({ ...schema, type: [schema.type, 'null'] });
const list = (items, maxItems = 20) => ({ type: 'array', items, maxItems });
const object = (properties) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const evidence = object({ messageId: text(100), quote: text(600) });
const deadline = nullable(object({
  date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  time: nullable({ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
  timeZone: text(80),
  wording: text(250),
  boundary: { type: 'string', enum: ['by', 'before', 'on', 'unspecified'] },
}));

export default object({
  category: { type: 'string', enum: ['Actionable', 'Passive'] },
  confidence: { type: 'integer', minimum: 0, maximum: 100 },
  evidence,
  explanation: text(350),
  summary: text(500),
  tasks: list(object({
    action: text(350), owner: text(254), deadline,
    condition: nullable(text(350)),
    requirements: list(text(250), 12),
    evidence,
  })),
  waitingFor: list(object({ action: text(350), owner: text(254), promisedDeadline: deadline, evidence })),
  suggestedFollowUps: list(object({
    action: text(350), recipient: text(254), waitingForIndex: { type: 'integer', minimum: 0 },
    rationale: text(350), evidence,
  })),
  uncertainties: list(text(250), 12),
});
