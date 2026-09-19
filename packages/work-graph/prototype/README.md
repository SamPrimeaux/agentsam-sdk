# AgentSam Timeline Prototype

`prototype-gnantt.html` renders from the WorkGraph demo — bars, board, list, and drawer are projections, not hardcoded markup.

Flow:

```
demo-workgraph.js
        |
        v
workgraph-runtime.js / timeline-model.js
        |
        v
prototype-gnantt.html (ES module bootstrap)
```

The timeline is a projection of the graph, not the source of truth.

Supported projections:

- task timeline bars (status-colored)
- agent / human owner lanes in the sidebar
- evidence / artifact drawer data
- timeline event markers
- board + list views from the same work items

Open locally (module imports need a static server):

```bash
npx --yes serve -l 4173 .
# then http://localhost:4173/prototype-gnantt.html
```
