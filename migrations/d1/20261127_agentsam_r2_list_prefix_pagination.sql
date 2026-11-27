-- Keep the existing agentsam_r2_list tool row; do not create an R2 object/directory inventory table.
-- The listing result is a live R2 page: objects + child prefixes + opaque cursor.
UPDATE agentsam_tools
SET description = 'List one page of objects in a single R2 bucket. Defaults to delimiter ''/'' and returns immediate child prefixes for folder navigation. Pass prefix to open a folder and pass cursor unchanged to fetch the next page. Use delimiter '''' for recursive listing. ',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"bucket":{"type":"string","description":"R2 bucket name (required)"},"prefix":{"type":"string","description":"Optional object-key prefix. Include a trailing slash when navigating a folder."},"delimiter":{"type":"string","enum":["/",""],"default":"/","description":"Use ''/'' to return immediate child folder prefixes; use an empty string to list recursively."},"limit":{"type":"integer","minimum":1,"maximum":1000,"default":100,"description":"Maximum objects and child prefixes in this page."},"cursor":{"type":"string","description":"Opaque continuation cursor from the prior page. Pass unchanged to fetch the next page."}},"required":["bucket"]}',
  output_schema = '{"type":"object","properties":{"ok":{"type":"boolean"},"bucket":{"type":"string"},"prefix":{"type":"string"},"delimiter":{"type":"string"},"objects":{"type":"array","items":{"type":"object","properties":{"key":{"type":"string"},"size":{"type":"integer"},"uploaded":{"type":["string","null"]},"etag":{"type":["string","null"]},"storage_class":{"type":["string","null"]}},"required":["key","size"],"additionalProperties":true}},"prefixes":{"type":"array","items":{"type":"string"}},"cursor":{"type":["string","null"]},"truncated":{"type":"boolean"},"error":{"type":"string"},"status":{"type":"integer"},"detail":{"type":"string"}},"additionalProperties":true}',
  handler_config = '{"operation":"r2.list","auth_source":"user_oauth","provider":"cloudflare","resource":"r2","credential_source":"user_oauth"}',
  cache_policy_json = NULL,
  updated_at = unixepoch(),
  updated_at_unix = unixepoch()
WHERE tool_key = 'agentsam_r2_list';

UPDATE agentsam_tool_cache_policy
SET cache_policy_json = NULL
WHERE tool_id = (SELECT id FROM agentsam_tools WHERE tool_key = 'agentsam_r2_list');

INSERT INTO d1_migrations (name) VALUES ('20261127_agentsam_r2_list_prefix_pagination.sql');
