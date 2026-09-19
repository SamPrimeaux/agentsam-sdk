export const demoWorkGraph = {
  id: "mission_indexer_refactor",
  title: "AgentSam Repository Intelligence Upgrade",
  actors: [
    { id: "sam", type: "human", name: "Sam" },
    { id: "agent-a1", type: "agent", name: "Indexer Agent", model: "gpt-5-codex" },
    { id: "agent-a2", type: "agent", name: "Embedding Agent", model: "gpt-5-mini" }
  ],
  workItems: [
    {
      id: "repo-discovery",
      title: "Repository discovery",
      owner: "agent-a1",
      status: "complete",
      start: "2026-08-01",
      end: "2026-08-03",
      dependencies: [],
      artifacts: ["repository-manifest.json"],
      evidence: ["run_18291"]
    },
    {
      id: "ast-indexing",
      title: "AST indexing",
      owner: "agent-a1",
      status: "running",
      start: "2026-08-03",
      end: "2026-08-08",
      dependencies: ["repo-discovery"],
      artifacts: ["index-report.json"],
      evidence: ["run_18292"]
    },
    {
      id: "embedding-pipeline",
      title: "Embedding pipeline",
      owner: "agent-a2",
      status: "queued",
      start: "2026-08-07",
      end: "2026-08-12",
      dependencies: ["ast-indexing"]
    }
  ],
  timelineEvents: [
    { type: "commit", label: "Manifest commit created", timestamp: "2026-08-03T14:20" },
    { type: "test", label: "Compatibility suite passed", timestamp: "2026-08-05T09:00" },
    { type: "deploy", label: "Preview deployed", timestamp: "2026-08-08T15:30" }
  ]
};
