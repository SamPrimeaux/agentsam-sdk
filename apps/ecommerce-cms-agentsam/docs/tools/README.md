# AgentSam tool normalization (first slice)

This is **product-owned** code for `apps/ecommerce-cms-agentsam`. FuelNFreetime is the
first merchant installation, not an app-level namespace.

- Stable internal operation IDs are domain-first, e.g. `commerce.orders.list`.
- The stored `capability_key` remains the permission authority (no new D1 tables).
- Each provider receives an explicit safe wire name (`commerce_orders_list`);
  **never** parse underscores back into dotted operation names.
- Existing `fnf_*` IDs remain aliases to their existing handlers. Do not update
  live `agentsam_tools` or policy rows until a reviewed migration + rollback.
- Operator-only raw D1, Worker deploy, bridge, GitHub, documentation and R2
  operations must never be part of a customer's default tools.
- The product's own typed registry is deliberately **not** wired to the live chat
  executor yet. The existing `agentsam_tools` registry, handler gates and account
  permissions remain authoritative. Do not expose these new descriptors directly
  to a model before integrating account, actor, role and capability authorization.

## Checks

`npm run typecheck:tools --prefix apps/ecommerce-cms-agentsam` runs strict
TypeScript type checking (Node's native TS loader only strips types).
`npm run test:tools --prefix apps/ecommerce-cms-agentsam` verifies mapping,
alias compatibility, operator exclusion and handler existence.

Next phases: reconcile merchant-account context and persisted capability grants,
wire the kernel through the existing execution guard, make seed updates + D1
migration scripts reviewable, then migrate remaining media/workflow verbs.
No SDK runtime imports or new database authority.
