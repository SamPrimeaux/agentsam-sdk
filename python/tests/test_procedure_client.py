from __future__ import annotations

import asyncio
import tempfile
import unittest

from agentsam_sdk import AgentSamClient, AsyncAgentSamClient, SamClientError
from agentsam_sdk.procedures import ProcedureClient, ProcedureClientError


def procedure_result():
    return {
        "schema": "sam.result.v1",
        "operation": "primetech.procedure.run",
        "ok": True,
        "data": {
            "schema": "inneranimalmedia.primetech.procedure-run.v1",
            "id": "repo.asset.inventory",
            "version": "0.1.0",
            "status": "completed",
            "verification": {"kind": "output_schema", "ok": True},
            "artifact": {"ref": "artifacts/primetech/inventory.json", "sha256": "a" * 64, "bytes": 12},
        },
    }


class ProcedureClientTests(unittest.TestCase):
    def test_sync_client_delegates_only_to_injected_host_operation(self):
        calls = []
        def invoke(payload):
            calls.append(payload)
            return procedure_result()
        with tempfile.TemporaryDirectory() as tmp:
            client = AgentSamClient(cwd=tmp, procedure_invoker=invoke)
            result = client.procedures.run("repo.asset.inventory", "0.1.0", {})
            self.assertEqual(result["id"], "repo.asset.inventory")
            self.assertEqual(calls, [{"id": "repo.asset.inventory", "version": "0.1.0", "input": {}}])
            raw = client.invoke("primetech.procedure.run", {"id": "repo.asset.inventory", "version": "0.1.0", "input": {}})
            self.assertEqual(raw["operation"], "primetech.procedure.run")

    def test_no_host_binding_fails_closed_without_node_bridge(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = AgentSamClient(cwd=tmp, node="/missing/node", bridge="/missing/stdio.mjs")
            with self.assertRaises(SamClientError) as caught:
                client.invoke("primetech.procedure.run", {"id": "repo.asset.inventory", "version": "0.1.0", "input": {}})
            self.assertEqual(caught.exception.code, "sam_procedure_host_not_configured")
            with self.assertRaises(ProcedureClientError) as caught:
                client.procedures.run("repo.asset.inventory", "0.1.0", {})
            self.assertEqual(caught.exception.code, "sam_procedure_host_not_configured")

    def test_async_client_supports_async_host_binding(self):
        calls = []
        async def invoke(payload):
            await asyncio.sleep(0)
            calls.append(payload)
            return procedure_result()
        async def scenario():
            with tempfile.TemporaryDirectory() as tmp:
                client = AsyncAgentSamClient(cwd=tmp, procedure_invoker=invoke)
                result = await client.procedures.arun("repo.asset.inventory", "0.1.0", {})
                self.assertEqual(result["status"], "completed")
                raw = await client.invoke("primetech.procedure.run", {"id": "repo.asset.inventory", "version": "0.1.0", "input": {}})
                self.assertTrue(raw["ok"])
        asyncio.run(scenario())
        self.assertEqual(len(calls), 2)

    def test_invalid_version_and_failed_verification_are_rejected(self):
        client = ProcedureClient(lambda _: procedure_result())
        with self.assertRaises(ProcedureClientError) as caught:
            client.run("repo.asset.inventory", "latest", {})
        self.assertEqual(caught.exception.code, "primetech_procedure_version_invalid")
        failed = procedure_result()
        failed["data"]["verification"]["ok"] = False
        with self.assertRaises(ProcedureClientError) as caught:
            ProcedureClient(lambda _: failed).run("repo.asset.inventory", "0.1.0", {})
        self.assertEqual(caught.exception.code, "primetech_procedure_verification_failed")


if __name__ == "__main__":
    unittest.main()
