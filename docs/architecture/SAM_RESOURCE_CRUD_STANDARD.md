# SAM Resource Lifecycle — CRUD and Provisioning

**2026-10-17 · SAM = Systematic Autonomous Machinery**

Persistent resource packs must expose create, list, read, update and delete where
meaningful, or explicitly report unsupported / not applicable verbs. A scan,
execution command or decision is an action, not a resource; it should not receive
fictitious CRUD endpoints.

| Resource | Create | List/read | Update | Delete | Restore |
|---|---|---|---|---|---|
| Local project | project.create | project.list/project.get | project.edit | project.delete (archive) | project.restore |
| Local SQLite database | agentsam_sqlite_create | agentsam_sqlite_list/get | agentsam_sqlite_edit | agentsam_sqlite_delete (archive) | agentsam_sqlite_restore |
| Cloudflare D1 resource | agentsam_d1_create | Not certified | Not certified | Not certified | Provider-specific |
| SQL rows in existing D1 | agentsam_d1_write (INSERT) | agentsam_d1_query | agentsam_d1_write (UPDATE) | agentsam_d1_delete (SQL) | Application-owned |

SQL DELETE is **not** Cloudflare D1 resource deletion. Never confuse a
customer's local SQLite with their cloud D1 database.

## Actual implementations

Project create makes a workspace-owned projects/ID folder with
.agentsam/project.json. Project edit requires expected_revision. Delete archives
original files, requires confirm_id and revision; restore needs the returned
restore_ref. IDs reject path traversal and symlinks. project.discover remains
read-only inspection, not a second project registry.

Local SQLite create makes a real empty SQLite file at
.agentsam/databases/NAME.sqlite (mode 0600). Get/list inspect it. Edit is a
rename guarded by expected size and modification time, no active WAL/SHM, no
overwrite. Delete archives rather than erases; restore recovers original data.

Remote agentsam_d1_create becomes callable **only** when an installation
provides a trusted actor/installation context, a host authorization callback
and a provisionD1 implementation. createCloudflareD1Provisioner is the actual
Cloudflare REST POST adapter: its cloud account and token come from a trusted
customer installation credential resolver, not the model/tool input.
The default unconfigured host correctly returns unavailable.
No live remote database was created during this build.

The provider currently must be supplied by the customer installation;
production IAM MCP server provisioning registration and OAuth write scope
remains a separate integration acceptance gate.

## JavaScript usage

    import { AgentSamClient, createSamOS, createCapabilityAdapter,
      createCloudflareD1Provisioner } from "@inneranimalmedia/agentsam-sdk";
    const provisionD1 = createCloudflareD1Provisioner({
      resolveAccountForInstallation: installation =>
        installedCustomerCredentialResolver(installation),
    });
    const adapter = createCapabilityAdapter({
      projectRoot: trustedWorkspaceRoot,
      installationContext: trustedInstallationContext,
      authorizeCapability: authorizeRealHostAction,
      provisionD1,
    });
    const sam = new AgentSamClient({
      os: createSamOS(), cwd: trustedWorkspaceRoot,
      capabilityAdapter: adapter,
      authorizeCapability: authorizeRealHostAction,
    });
    await sam.projects.create({ id: "customer-app", name: "Customer App" });
    await sam.databases.sqlite.create({ name: "local_db" });
    await sam.databases.d1.create({ name: "customer-app-prod", confirm_name: "customer-app-prod" });

The host resolver, workspace root, installation context and authorization
callback above must be real installation-owned implementations. They are not
supplied automatically or inferred from an operator's account.

## Acceptance

    node --test test/registry/resource-crud.test.mjs test/registry/d1-provisioner.test.mjs
    node scripts/sam-machine/crud-smoke.mjs
    node scripts/sam-machine/crud-coverage.mjs --out /tmp/sam-crud-coverage.json
    npm run verify:registry

Keep each resource's canonical ID, owner, versioned schemas, side-effect class,
per-actor access, revision preconditions, and execution receipts.
No manifest-only tools labeled as executable; no customer access to operator D1.
