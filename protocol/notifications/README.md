# AgentSam notifications protocol

Portable spine for user-visible notices and multi-channel delivery.

## Authority

| Layer | Owner |
|---|---|
| SQL baseline | `migrations/runtime/0010_agentsam_notifications.sql` |
| Inbox rows | `notifications` |
| Delivery / retry queue | `notification_outbox` |
| Web Push device endpoints | `agentsam_hook` (`handler_type = web_push`) — not duplicated here |
| Approval decisions | `agentsam_approval_queue` — not duplicated here |
| iMessage Mac poll/token state | host adapter (may thin into outbox later) |

Shared hosts (Inner Animal Media) map `account_id` / `recipient_id` to `accounts.id`. Local Studio reads inbox history from `notifications` for the verified session account.

## Ownership

- **`notification_outbox.account_id`** — whose ledger / project owns the send (agency, platform, workspace owner).
- **`notification_outbox.recipient_account_id`** — who should receive it when different (client, teammate). `NULL` = same as `account_id`.
- **`notifications.recipient_id`** — inbox subject (`accounts.id` when `recipient_type` is `user` / `account`).

Do not reintroduce `tenant_id` / `workspace_id` on these tables.

## Channels

| Channel | Inbox (`notifications`) | Outbox | Transport |
|---|---|---|---|
| `in_app` | yes | no | Local Studio / dashboard menu |
| `email` | optional mirror | yes | Resend / mail worker |
| `push` | yes | optional | VAPID via `agentsam_hook` web_push |
| `imessage` | yes | yes | Mac Messages daemon |
| `system` / `sms` / `webhook` | host-defined | yes | host adapters |

## Write pattern

1. Insert inbox row in `notifications` when the user should see history.
2. Insert `notification_outbox` when a delivery adapter must run (email, imessage, …).
3. Adapter updates outbox `status` / `attempts` / `last_error`.
4. Approvals: keep decision SSOT on `agentsam_approval_queue`; outbox only carries the ask/notify.

## Relation to hooks

`migrations/runtime/0005_agentsam_hooks.sql` is the portable automation registry (`owner_id` + `scope_*`). Hooks are not the notification inbox. Hosts may map `owner_id` → `accounts.id`. IAM’s legacy `agentsam_hook.tenant_id` shape should migrate toward that portable contract without collapsing hooks into outbox.
