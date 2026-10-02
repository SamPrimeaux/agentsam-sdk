from __future__ import annotations

import json
import os
import sys
import unittest

from agentsam_sdk.errors import normalize_error_reason
from agentsam_sdk.hooks import (
    HOOK_PROTOCOL_SCHEMA,
    HookDefinition,
    HookOutput,
    HookRuntime,
    command_adapter,
    normalize_event,
)


class HookContractTests(unittest.TestCase):
    def test_protocol_contract_is_canonical(self):
        self.assertEqual(HOOK_PROTOCOL_SCHEMA, "agentsam.hook.v1")
        self.assertEqual(normalize_event("onPreToolUse"), "pre_tool_use")
        self.assertEqual(HookOutput(permission_decision="allow").to_dict(), {"permission_decision": "allow"})
        self.assertEqual(HookOutput.from_value({"modified_result": None}).to_dict(), {"modified_result": None})
        self.assertEqual(HookOutput.from_value({"modified_config": {"auto_compact": False}}).to_dict(), {"modified_config": {"auto_compact": False}})
        with self.assertRaisesRegex(ValueError, "invalid_permission_decision"):
            HookOutput(permission_decision="maybe")
        self.assertEqual(normalize_error_reason("AGENTSAM_HOOK_HTTP_FAILED"), "hook_http_request_failed")
        self.assertEqual(normalize_error_reason("hook_command_invalid_json:node"), "hook_command_output_invalid")


class HookRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_composes_modified_arguments_and_context(self):
        runtime = HookRuntime()
        runtime.register("pre_tool_use", HookDefinition(
            id="first", priority=10,
            handler=lambda envelope: {
                "permission_decision": "allow",
                "modified_args": {**envelope.input["tool_args"], "first": True},
                "additional_context": "first context",
            },
        ))
        runtime.register("pre_tool_use", HookDefinition(
            id="second", priority=20,
            handler=lambda envelope: {
                "modified_args": {**envelope.input["tool_args"], "second": True},
                "additional_context": "second context",
            },
        ))
        result = await runtime.dispatch("pre_tool_use", {
            "tool_name": "read", "tool_args": {"value": 1},
        }, {"session_id": "session-test"})
        self.assertEqual(result["input"]["tool_args"], {"value": 1, "first": True, "second": True})
        self.assertEqual(result["output"]["additional_context"], "first context\n\nsecond context")
        self.assertEqual([row["hook_id"] for row in result["receipts"]], ["first", "second"])

    async def test_session_config_patches_compose(self):
        runtime = HookRuntime()
        runtime.register("session_start", HookDefinition(
            id="model", priority=10,
            handler=lambda _: {"modified_config": {"model_key": "xai:grok-4"}},
        ))
        runtime.register("session_start", HookDefinition(
            id="effort", priority=20,
            handler=lambda _: {"modified_config": {"reasoning_effort": "high"}},
        ))
        result = await runtime.dispatch("session_start", {"config": {"auto_compact": True}})
        self.assertEqual(result["input"]["config"], {
            "auto_compact": True,
            "model_key": "xai:grok-4",
            "reasoning_effort": "high",
        })

    async def test_permission_hook_fails_closed(self):
        runtime = HookRuntime()
        def broken(_):
            raise RuntimeError("policy unavailable")
        runtime.register("pre_tool_use", HookDefinition(id="policy", handler=broken))
        result = await runtime.dispatch("pre_tool_use", {"tool_name": "write", "tool_args": {}})
        self.assertEqual(result["output"]["permission_decision"], "deny")
        self.assertIn("failed closed", result["output"]["permission_decision_reason"])
        error = result["receipts"][0]["error"]
        self.assertEqual(error["error_code"], "INTERNAL")
        self.assertEqual(error["reason"], "hook_handler_failed")
        self.assertEqual(error["failure_behavior"], "fail_closed")
        self.assertEqual(error["side_effect_state"], "not_started")
        self.assertFalse(error["retryable"])

    async def test_observer_receipt_preserves_timeout_and_applied_side_effect(self):
        runtime = HookRuntime()
        def broken(_):
            raise TimeoutError("hook_lsp_timeout:rust")
        runtime.register("post_tool_use", HookDefinition(id="observer", handler=broken))
        result = await runtime.dispatch("post_tool_use", {"tool_name": "write", "tool_result": {"ok": True}})
        error = result["receipts"][0]["error"]
        self.assertEqual(error["error_code"], "DEADLINE_EXCEEDED")
        self.assertEqual(error["reason"], "hook_lsp_timeout")
        self.assertEqual(error["failure_behavior"], "fail_open")
        self.assertEqual(error["side_effect_state"], "confirmed_applied")
        self.assertFalse(error["retryable"])

    async def test_command_adapter_uses_same_wire_envelope(self):
        code = (
            "import json,sys; e=json.load(sys.stdin); "
            "print(json.dumps({'permission_decision': 'allow' if e['schema']=='agentsam.hook.v1' else 'deny'}))"
        )
        handler = command_adapter(sys.executable, ["-c", code], cwd=os.getcwd(), timeout_ms=2000)
        runtime = HookRuntime()
        runtime.register("pre_tool_use", HookDefinition(id="python", handler=handler))
        result = await runtime.dispatch("pre_tool_use", {"tool_name": "read", "tool_args": {}})
        self.assertEqual(result["output"]["permission_decision"], "allow")


if __name__ == "__main__":
    unittest.main()
