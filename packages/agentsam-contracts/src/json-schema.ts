import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';

export type AgentJsonSchema = Record<string, unknown>;

export const AGENT_JSON_SCHEMA_DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema' as const;
const DRAFT_7_IDS = new Set([
  'http://json-schema.org/draft-07/schema#',
  'http://json-schema.org/draft-07/schema',
]);
const draft2020 = new Ajv2020({ allErrors: true, strict: false });
const draft7 = new Ajv({ allErrors: true, strict: false });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate an embedded JSON Schema against its declared dialect's meta-schema.
 * This checks schema structure; resolving external $refs remains the owning
 * schema-pack/publisher's responsibility.
 */
export function assertAgentJsonSchema(value: unknown, label = 'JSON Schema'): asserts value is AgentJsonSchema {
  if (!isRecord(value)) throw new TypeError(`${label} must be a JSON Schema object`);
  const dialect = value.$schema;
  const validator = dialect == null || dialect === AGENT_JSON_SCHEMA_DRAFT_2020_12
    ? draft2020
    : typeof dialect === 'string' && DRAFT_7_IDS.has(dialect)
      ? draft7
      : null;
  if (!validator) {
    throw new TypeError(`${label} declares an unsupported JSON Schema dialect: ${String(dialect)}`);
  }
  if (!validator.validateSchema(value)) {
    throw new TypeError(`${label} is not valid JSON Schema: ${validator.errorsText(validator.errors, { separator: '; ' })}`);
  }
}
