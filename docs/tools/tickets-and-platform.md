# Tickets & Platform

The ticket lifecycle (create/get/list/set-status/add-note), plus platform-level admin: MCP audit log, ship-check, checkout-root pin/get/clear, ping.

**13 tools** in this domain.

## `platform` (4)

- **`agentsam_checkout_root_clear`** (Checkout root clear) — Clear the sticky checkout_root pin for this MCP session. _never used_
- **`agentsam_checkout_root_get`** (Checkout root get) — Return the sticky checkout_root for this MCP session (if pinned). _never used_
- **`agentsam_checkout_root_pin`** (Checkout root pin) — Pin absolute checkout_root for this MCP session (sticky). Dual-agent worktrees: pass absolute worktree path once so relative fs/terminal paths resolve there — never silent operator main. _never used_
- **`agentsam_ping`** (Ping) — Liveness ping. Returns MCP server version and whether D1 is bound. No workspace or tenant identity. No side effects.

## `platform.audit` (1)

- **`agentsam_mcp_audit`** (MCP Audit Log) — Read recent MCP tool calls for your connected account. Scoped by auth user, not workspace. _never used_

## `platform.ship` (2)

- **`agentsam_d1_validate_migration`** (D1 Validate Migration (dry-run)) — When editing or reviewing a migration SQL file, statically validate it (memory_id, destructive DDL, conflict targets) before apply. Pass sql, files[], or GitHub paths[]. _never used_
- **`agentsam_ship_check`** (Ship Check (dual-repo migrations)) — When preparing deploy:full or ship:remote, run preflight across BOTH monorepo and MCP migrations trees vs d1_migrations ledger, with static SQL validation on pending files. _never used_

## `tickets` (6)

- **`agentsam_ticket`** (Ticket) — Platform tickets — one tool for list/get/create/set_status/add_note. Pass operation. Reads need ticket.read; create/add_note need ticket.write; set_status needs ticket.status. _never used_
- **`agentsam_ticket_add_note`** (Ticket Add Note) — Append a note and/or attach visual proof to a platform ticket. Note optional when attachment fields present. _never used_
- **`agentsam_ticket_create`** (Ticket Create) — Create a platform engineering ticket. Pass dedup_key to avoid double-create on retry. _never used_
- **`agentsam_ticket_get`** (Ticket Get) — Get one platform ticket by id. _never used_
- **`agentsam_ticket_list`** (Ticket List) — List platform engineering tickets (agentsam_tickets). Filters: status, project, subsystem, priority. _never used_
- **`agentsam_ticket_set_status`** (Ticket Set Status) — Set ticket status (server enforces status_reason for blocked/abandoned). _never used_
