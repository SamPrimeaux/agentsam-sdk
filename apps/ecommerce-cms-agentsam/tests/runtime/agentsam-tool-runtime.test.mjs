import { __setApplicationAccountId } from "../../backend/lib/account-context.js";
__setApplicationAccountId("acct_test");
import assert from "node:assert/strict";
import test from "node:test";

import { extractToolCalls } from "../../backend/agentsam/ai-run.js";
import {
  scoreTool,
  toolsForWorkersAi,
} from "../../backend/agentsam/tools-registry.js";
import {
  executeAgentSamTool,
  isAgentSamToolExecutable,
} from "../../backend/agentsam/tool-handlers.js";
import { canAccessMailbox } from "../../backend/lib/mail-mailboxes.js";

function toolRow(overrides = {}) {
  return {
    id: "ast_test",
    tool_name: "growth_campaign_create",
    tool_key: "growth_campaign_create",
    display_name: "Create Campaign Draft",
    tool_category: "growth.campaigns",
    handler_type: "admin_api",
    handler_key: "growth",
    description: "Create a campaign draft",
    input_schema: '{"type":"object","properties":{"name":{"type":"string"}}}',
    output_schema: "{}",
    handler_config: '{"operation":"campaign.create"}',
    resource_scope_json: '{"account_id":"acct_test"}',
    operations_json: '["create"]',
    intent_tags: '["campaign"]',
    modes_json: '["agent"]',
    dispatch_target: "internal",
    risk_level: "medium",
    requires_approval: 0,
    requires_confirmation: 0,
    route_key: "growth",
    workflow_key: null,
    task_type: "growth_write",
    domain: "growth",
    capability_key: "campaign.create",
    sort_priority: 20,
    is_active: 1,
    is_degraded: 0,
    connector_access_class: "write",
    app_id: "growth",
    plugin_key: null,
    plugin_id: null,
    ...overrides,
  };
}

function envForTool(row) {
  return {
    DB: {
      prepare(sql) {
        assert.match(sql, /FROM agentsam_tools/);
        return {
          bind() {
            return {
              async first() {
                return row;
              },
            };
          },
        };
      },
    },
  };
}

test("Workers AI tool definitions come directly from selected registry schemas", () => {
  const tools = toolsForWorkersAi([
    {
      tool_key: "email_messages_list",
      display_name: "List Mailbox Messages",
      description: "Read an authorized mailbox",
      input_schema: {
        type: "object",
        properties: { mailbox: { type: "string" } },
        required: ["mailbox"],
      },
      is_active: true,
    },
  ]);

  assert.deepEqual(tools, [
    {
      name: "email_messages_list",
      description: "Read an authorized mailbox",
      parameters: {
        type: "object",
        properties: { mailbox: { type: "string" } },
        required: ["mailbox"],
      },
    },
  ]);
});

test("Workers AI tool call extraction supports native and OpenAI-compatible result shapes", () => {
  assert.deepEqual(
    extractToolCalls({
      tool_calls: [{ name: "growth_campaigns_list", arguments: { limit: 5 } }],
    }),
    [
      {
        id: "toolcall_1",
        name: "growth_campaigns_list",
        arguments: { limit: 5 },
      },
    ],
  );

  assert.deepEqual(
    extractToolCalls({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: "call_1",
                function: {
                  name: "email_messages_list",
                  arguments: '{"mailbox":"sam"}',
                },
              },
            ],
          },
        },
      ],
    }),
    [
      {
        id: "call_1",
        name: "email_messages_list",
        arguments: { mailbox: "sam" },
      },
    ],
  );
});

test("all write-class tools are confirmation-gated even when a legacy row forgot the flag", async () => {
  const row = toolRow({ connector_access_class: "write", requires_confirmation: 0 });
  assert.equal(isAgentSamToolExecutable({
    ...row,
    handler_config: { operation: "campaign.create" },
  }), true);

  const result = await executeAgentSamTool(envForTool(row), row.tool_key, { name: "Launch" }, {
    user: { id: "au_test", email: "test@example.com" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.confirmation_required, true);
  assert.equal(result.capability_key, "campaign.create");
});

test("degraded/unimplemented Completeful operations are not executable", () => {
  assert.equal(
    isAgentSamToolExecutable({
      tool_key: "completeful_product_publish",
      handler_key: "completeful",
      handler_config: { operation: "product.publish" },
    }),
    false,
  );
});

test("mailbox ACL supports personal ownership and explicitly shared mailboxes", () => {
  const sam = {
    id: "mb_sam",
    owner_user_id: "au_sam",
    owner_auth_email: "sam@example.com",
    access_json: "{}",
  };
  const payments = {
    id: "mb_payments",
    access_json: '{"roles":["owner"],"emails":["ops@example.com"]}',
  };

  assert.equal(canAccessMailbox(sam, { id: "au_sam", email: "other@example.com" }), true);
  assert.equal(canAccessMailbox(sam, { id: "au_other", email: "other@example.com" }), false);
  assert.equal(canAccessMailbox(payments, { id: "au_ops", email: "ops@example.com" }), true);
  assert.equal(canAccessMailbox(payments, { id: "au_owner", role: "owner", email: "x@example.com" }), true);
});

test("route App ownership outranks unrelated essential-tool priority", () => {
  const routeTool = {
    tool_key: "email_messages_list",
    app_id: "resend",
    intent_tags: ["email", "inbox"],
    sort_priority: 50,
  };
  const unrelated = {
    tool_key: "fnf_store_orders_list",
    intent_tags: ["orders"],
    sort_priority: 10,
  };
  const routing = {
    intent: "content",
    message: "show me my inbox",
    appId: "resend",
    routeContext: "communications.email",
  };

  assert.ok(scoreTool(routeTool, routing) > scoreTool(unrelated, routing));
});
