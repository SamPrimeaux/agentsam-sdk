from agentsam_sdk.knowledge import RetrievalQuery

def test_retrieval_query_defaults():
    query = RetrievalQuery(text="where is auth scoped?", workspace_id="ws_test")
    assert query.top_k == 12
    assert query.require_current_ref is True
