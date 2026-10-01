# @inneranimalmedia/agentsam-goap

Portable GOAP control-plane contracts for AgentSam.

This package does not define a second GOAP database. It maps stable logical ports onto tables AgentSam already owns.

| Logical port | Existing authority |
| --- | --- |
| BlackboardStore | agentsam_workspace_state |
| GoalStore | agentsam_tickets |
| EventStore | agentsam_ticket_events |
| PlanStore | agentsam_workflows, agentsam_workflow_nodes, agentsam_workflow_edges |
| PlanRunStore | agentsam_workflow_runs |
| ActionRunStore | agentsam_executions, agentsam_execution_steps |
| ApprovalPort | agentsam_approval_queue |
| QueuePort | @inneranimalmedia/agentsam-queue-control |
| RuntimePort | agentsam.runtime.v1 / terminal runtime adapters |
| EvidencePort | evidence snapshots and execution receipts |

The core package imports no Wrangler, Cloudflare, SQLite, Postgres, Tauri, filesystem, or terminal implementation. Those are adapters.

## Frozen v1 contracts

- agentsam.blackboard.v1
- agentsam.goal.v1
- agentsam.goap.action.v1
- agentsam.goap.plan.v1
- agentsam.event.v1

Database ticket statuses stay unchanged. The package maps them to logical goal states:

- backlog -> proposed
- active -> active
- blocked -> blocked
- in_review -> verifying
- shipped -> satisfied
- abandoned -> cancelled

## Realtime and durability rule

Blackboard mutation is compare-and-swap on a monotonically increasing revision. Events are append-only and expose opaque string cursors. The adapter owns the physical cursor prefix, so callers do not depend on SQLite/D1 rowid, Postgres sequences, or a future stream backend.

Cross-store state changes must go through MutationPort. Goal activation updates blackboard revision, ticket status, and the activation event as one adapter-owned atomic operation. The D1/SQLite adapter therefore requires db.batch() for mutation operations.

The Memory adapter is the conformance/reference adapter. The D1/SQLite adapter targets the common prepare/bind/first/all/run binding shape. Local SQLite supplies a transactional batch shim; Cloudflare D1 supplies batch natively.

Portable ticket_events rows carry account_id and repository_id directly. The older platform host table does not. Set eventOwnership to ticket_join for that legacy shape; it scopes events through their owning ticket without requiring a second event table or a duplicate-column migration.
