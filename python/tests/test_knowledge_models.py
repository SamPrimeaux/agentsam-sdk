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
        query = RetrievalQuery(text="function", workspace_id="workspace")
        self.assertEqual(asyncio.run(client.retrieve(query)).hits[0].content, "code")
        self.assertEqual(asyncio.run(client.index("source")).status, "succeeded")
        self.assertEqual(Source("s", "repository", "workspace", "file:///repo").source_id, "s")


if __name__ == "__main__":
    unittest.main()
