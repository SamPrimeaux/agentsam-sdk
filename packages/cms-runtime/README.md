# @inneranimalmedia/cms-runtime

Portable CMS runtime distributed from the AgentSam SDK monorepo.

It initializes a project-relative, self-describing SQLite CMS runtime with:
- canonical `cms_sites`, `cms_pages`, `cms_sections`, `cms_blocks`, revisions, publications, and assets;
- runtime/capability/table catalogs;
- discoverable CMS tool contracts;
- reusable human/agent workflow skills;
- explicit `local_authority` vs `local_working_copy` semantics.

## Install

```bash
npm install -D @inneranimalmedia/cms-runtime

npx cms-runtime init --project my-site
npx cms-runtime doctor
npx cms-runtime tools
npx cms-runtime skills
```

The package creates only project-relative state:

```text
.agentsam/cms.sqlite
.agentsam/cms-content/
.agentsam/cms/runtime.json
```

No AgentSam SDK checkout path is required or persisted.

`doctor` verifies SQLite integrity and reports content counts, runtime mode, tool count, and skill count. `tools` and `skills` are read directly from the runtime database.

The SQLite schema is exported as `@inneranimalmedia/cms-runtime/sqlite-schema`; the portable package manifest schema is exported as `@inneranimalmedia/cms-runtime/manifest-schema`.
