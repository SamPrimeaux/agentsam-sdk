import asyncio
import unittest

from agentsam_sdk.cad import AsyncCadJobClient, CadJobClient, CadJobError
from agentsam_sdk.client import AgentSamClient, AsyncAgentSamClient


class CadJobClientTests(unittest.TestCase):
    def test_submit_status_wait_and_execute_use_canonical_host_operations(self):
        calls = []
        statuses = iter(("running", "completed"))

        def invoke(operation, payload):
            calls.append((operation, payload))
            if operation == "cad.job.generate":
                return {"job": {"id": "job_123", "status": "queued"}}
            if operation == "cad.job.status":
                return {"job": {"id": "job_123", "status": next(statuses)}}
            if operation == "cad.job.execute":
                return {"job": {"id": "job_123", "status": "running"}}
            raise AssertionError(operation)

        client = CadJobClient(invoke)
        handle = client.submit(
            project_id="project_1",
            workspace_id="workspace_1",
            engine="freecad",
            prompt="Build a parametric enclosure",
        )
        self.assertEqual(handle.id, "job_123")
        self.assertEqual(handle.wait(timeout=1, poll_interval=0.001)["status"], "completed")
        client.execute(project_id="project_1", workspace_id="workspace_1", job_id="job_123")
        self.assertEqual([call[0] for call in calls], [
            "cad.job.generate", "cad.job.status", "cad.job.status", "cad.job.execute",
        ])
        self.assertEqual(calls[0][1]["engine"], "freecad")

    def test_job_input_is_validated_before_host_invocation(self):
        calls = []
        client = CadJobClient(lambda op, payload: calls.append((op, payload)) or {"id": "job_1"})
        with self.assertRaisesRegex(ValueError, "engine_invalid"):
            client.submit(project_id="p", workspace_id="w", engine="unknown", prompt="Build this")
        with self.assertRaisesRegex(ValueError, "prompt_invalid"):
            client.submit(project_id="p", workspace_id="w", engine="blender", prompt="x")
        self.assertEqual(calls, [])

    def test_host_errors_are_preserved(self):
        client = CadJobClient(lambda op, payload: {
            "ok": False, "error": {"code": "cad_permission_denied", "message": "Not authorized"},
        })
        with self.assertRaises(CadJobError) as caught:
            client.submit(project_id="p1", workspace_id="w1", engine="blender", prompt="Build a room")
        self.assertEqual(caught.exception.code, "cad_permission_denied")

    def test_async_facade_uses_threaded_sync_invoker(self):
        client = CadJobClient(lambda op, payload: {"id": "job_123", "status": "queued"})
        async_client = AsyncCadJobClient(client)
        handle = asyncio.run(async_client.submit(
            project_id="project_1", workspace_id="workspace_1",
            engine="openscad", prompt="Build a bracket",
        ))
        self.assertEqual(handle.id, "job_123")

    def test_agent_sam_client_binds_jobs_only_to_the_supplied_host(self):
        calls = []
        def invoke(operation, payload):
            calls.append((operation, payload))
            return {"job_id": "job_host", "status": "queued"}

        client = AgentSamClient(cad_job_invoker=invoke)
        handle = client.cad_jobs.submit(
            project_id="project_1", workspace_id="workspace_1",
            engine="freecad", prompt="Build a verified enclosure",
        )
        self.assertEqual(handle.id, "job_host")
        self.assertEqual(calls[0][0], "cad.job.generate")

        unbound = AgentSamClient()
        with self.assertRaises(CadJobError) as caught:
            unbound.cad_jobs.submit(
                project_id="project_1", workspace_id="workspace_1",
                engine="blender", prompt="Build a verified enclosure",
            )
        self.assertEqual(caught.exception.code, "cad_job_host_not_configured")

    def test_async_agent_sam_client_exposes_nonblocking_host_jobs(self):
        calls = []
        def invoke(operation, payload):
            calls.append(operation)
            return {"job_id": "job_async", "status": "queued"}

        client = AsyncAgentSamClient(cad_job_invoker=invoke)
        handle = asyncio.run(client.cad_jobs.submit(
            project_id="project_1", workspace_id="workspace_1",
            engine="openscad", prompt="Build a verified bracket",
        ))
        self.assertEqual(handle.id, "job_async")
        self.assertEqual(calls, ["cad.job.generate"])


if __name__ == "__main__":
    unittest.main()
