import { normalizePluginManifest } from './contracts.js';

// Curated ecommerce capabilities are part of the reusable
// ecommerce-cms-agentsam native family. FNF is the first packaged deployment;
// the handler remains an injected app adapter, never a hard-coded store.
const readSchema = {
  type: 'object', properties: {}, additionalProperties: true,
};

export const COMPLETEFUL_PLUGIN_MANIFEST = normalizePluginManifest({
  plugin_key: 'completeful',
  provider_key: 'completeful',
  plugin_kind: 'native',
  category: 'commerce',
  display_name: 'Completeful',
  short_name: 'Completeful',
  description: 'Curated ecommerce catalog, design, publishing, and order capabilities.',
  mention_aliases: ['@completeful', 'completeful'],
  transport: 'native',
  auth_type: 'api_key_secret',
  capabilities: [
    { capability_key: 'catalog.search', domain: 'commerce', verb: 'search', description: 'Search the Completeful catalog.', is_mutating: false },
    { capability_key: 'catalog.read', domain: 'commerce', verb: 'read', description: 'Read Completeful catalog records.', is_mutating: false },
    { capability_key: 'catalog.sync', domain: 'commerce', verb: 'sync', description: 'Synchronize catalog data.', is_mutating: true },
    { capability_key: 'design.create', domain: 'commerce', verb: 'create', description: 'Create a Completeful design.', is_mutating: true },
    { capability_key: 'product.publish', domain: 'commerce', verb: 'publish', description: 'Publish a product.', is_mutating: true },
    { capability_key: 'product.sync', domain: 'commerce', verb: 'sync', description: 'Synchronize a product.', is_mutating: true },
    { capability_key: 'order.quote', domain: 'commerce', verb: 'quote', description: 'Quote an order.', is_mutating: false },
    { capability_key: 'order.create', domain: 'commerce', verb: 'create', description: 'Create an order.', is_mutating: true },
  ],
  tool_lanes: ['native', 'curated'],
  metadata: { family: 'ecommerce-cms-agentsam', packaged_deployment: 'fuelnfreetime' },
  health_strategy: 'provider_probe',
  tools: [
    ['completeful_catalog_list', 'Catalog list', 'catalog.list', 'low', false],
    ['completeful_catalog_sync', 'Catalog sync', 'catalog.sync', 'medium', true],
    ['completeful_catalog_get', 'Catalog get', 'catalog.read', 'low', false],
    ['completeful_catalog_semantic_search', 'Catalog semantic search', 'catalog.search', 'low', false],
    ['completeful_design_create', 'Create design', 'design.create', 'medium', true],
    ['completeful_product_publish', 'Publish product', 'product.publish', 'high', true],
    ['completeful_product_sync', 'Product sync', 'product.sync', 'medium', true],
    ['completeful_order_quote', 'Order quote', 'order.quote', 'low', false],
    ['completeful_order_create', 'Create order', 'order.create', 'high', true],
  ].map(([tool_key, display_name, capability_key, risk_level, mutating]) => ({
    tool_key,
    tool_name: tool_key,
    display_name,
    description: tool_key === 'completeful_catalog_semantic_search'
      ? 'Hybrid Completeful catalog search using Voyage recall, lexical/taxonomy fusion, and optional reranking.'
      : `Execute the curated Completeful ${display_name.toLowerCase()} capability.`,
    tool_category: 'ecommerce-cms-agentsam',
    // The live agentsam_tools contract reserves `cms` as the native family;
    // handler_key carries the provider identity so older D1 schemas remain
    // valid while dispatch stays generic.
    handler_type: 'cms',
    handler_key: 'completeful',
    dispatch_target: 'internal',
    capability_key,
    handler_config: { family: 'ecommerce-cms-agentsam', operation: capability_key },
    input_schema: tool_key === 'completeful_catalog_semantic_search'
      ? { type: 'object', properties: { q: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 }, include: { type: 'string' } }, required: ['q'], additionalProperties: false }
      : readSchema,
    risk_level,
    requires_approval: mutating && risk_level !== 'medium',
    requires_confirmation: risk_level === 'high',
    connector_access_class: mutating ? 'write' : 'read',
    intent_tags: ['completeful', 'commerce', capability_key],
  })),
});
