from __future__ import annotations

import asyncio
import tempfile
import unittest

from agentsam_sdk import AgentSamClient, AsyncAgentSamClient
from agentsam_sdk.procedures import ProcedureClientError


def verified_result() -> dict:
    return {
        "schema": "sam.result.v1",
        "ok": True,
        "data": {
            "schema": "inneranimalmedia.primetech.procedure-run.v1",
            "id": "repo.asset.inventory",
            "version": "0.1.0",
            "status": "completed",
            "verification": {"ok": True},
            "artifact": {"ref": "artifacts/primetech/inventory.json"},
        },
    }


class AssetProcedureApiTests(unittest.TestCase):
    def test_sync_invokes_existing_host_operation_without_paths_or_shell(self):
        calls = []
        with tempfile.TemporaryDirectory() as tmp:
            client = AgentSamClient(
                cwd=tmp,
                procedure_invoker=lambda payload: (calls.append(payload), verified_result())[1],
            )
            receipt = client.assets.inventory_native()
            self.assertEqual(receipt["status"], "completed")
        self.assertEqual(calls, [{
            "id": "repo.asset.inventory", "version": "0.1.0", "input": {},
        }])

    def test_unbound_host_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = AgentSamClient(cwd=tmp)
            with self.assertRaises(ProcedureClientError) as caught:
                client.assets.inventory_native()
        self.assertEqual(caught.exception.code, "sam_procedure_host_not_configured")

    def test_async_host_reuses_same_procedure_receipt_contract(self):
        calls = []

        async def invoke(payload):
            calls.append(payload)
            return verified_result()

        async def scenario():
            with tempfile.TemporaryDirectory() as tmp:
                client = AsyncAgentSamClient(cwd=tmp, procedure_invoker=invoke)
                result = await client.assets.ainventory_native()
                self.assertEqual(result["id"], "repo.asset.inventory")

        asyncio.run(scenario())
        self.assertEqual(calls[0]["input"], {})


if __name__ == "__main__":
    unittest.main()
