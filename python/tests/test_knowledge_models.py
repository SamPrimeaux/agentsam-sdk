"""Recovered transport contracts stay usable without provider dependencies."""
import asyncio
import unittest
from agentsam_sdk.knowledge import KnowledgeClient, RetrievalQuery, Source


class KnowledgeContractsTest(unittest.TestCase):
    def test_transport_roundtrip(self):
        class Transport:
            async def request(self, operation, payload):
                if operation == "knowledge.index":
                    return {"run_id": "run", "source_id": payload["source_id"], "status": "succeeded"}
                return {"query_id": "query", "hits": [{"chunk_id": "chunk", "content": "code", "score": 1, "lane": "code"}]}
        client = KnowledgeClient(Transport())
        query = RetrievalQuery(text="function")
        self.assertEqual(asyncio.run(client.retrieve(query)).hits[0].content, "code")
        self.assertEqual(asyncio.run(client.index("source")).status, "succeeded")
        self.assertEqual(Source("s", "repository", "file:///repo").source_id, "s")

    def test_workspace_is_optional_compatibility_metadata(self):
        query = RetrievalQuery(text="function", workspace_id="legacy-workspace")
        self.assertEqual(query.workspace_id, "legacy-workspace")


if __name__ == "__main__":
    unittest.main()
