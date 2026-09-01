# AgentSam Mini

Create a small local gadget, page, or data prototype with one command:

```bash
agentsam mini focus-timer --open
agentsam mini landing --template page
agentsam mini json-viewer --template data
```

The default `gadget` starter is a working focus timer. `page` offers an editable headline preview; `data` accepts and filters JSON entirely in the browser. These are ordinary HTML, CSS, and JavaScript files, with no dependency install, framework, AI call, credential setup, or container.

## Files and preview lifecycle

`agentsam mini <name>` creates a **new** directory under the current directory and immediately previews it. Existing directories are refused, never overwritten. Use a lowercase name with letters, numbers, and hyphens. `preview` and `templates` are command names.

Each project contains `mini.json`, `README.md`, and `public/{index.html,style.css,app.js}`. Edit the public files and refresh your browser to see changes. The generated mini has no npm dependency on the unreleased SDK version. The SDK command supplies the preview server; `public/` can also be served by any static host later.

```bash
agentsam mini timer --write-only
agentsam mini preview ./timer --open
agentsam mini preview ./timer --port 8080 --timeout 300
agentsam mini templates
agentsam mini --help
```

- `--write-only` creates files and exits without starting a preview.
- A preview listens on **127.0.0.1** and selects a free port unless `--port` is supplied.
- It runs in the foreground and stops on **Ctrl+C**, **SIGTERM**, or its **20-minute default timeout**. `--timeout` accepts 1–86400 seconds.
- Stopping closes active HTTP connections and the listening socket. Project files remain for reuse; no daemon, restart policy, container, or cloud resource is created.
- Only `public/` is served. Dotfiles, outside symlinks, and requests with non-local Host/Origin headers are rejected. This is a local development preview, not a production server or a sandbox for untrusted code.
- Multiple minis can be previewed in separate terminals; automatic ports avoid conflicts. `--open` is optional.

`agentsam init` still creates the full local agent project with SQLite and runtime adapters. Mini is the smaller static-prototype path; it does not add an AI backend or publish anything.
