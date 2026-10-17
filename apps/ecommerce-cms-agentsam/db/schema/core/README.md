# Core identity

Applied before any app schema. `cms.sql` and every app schema reference `accounts(id)` only. No app redefines these tables.

Additive-only after v1. New needs go to `metadata_json`, `account_settings`, `account_entitlements`, or a new table. Never rename or retype a core column.

CHECKs are only for true state machines. `kind`, `plan_key`, `role`, and `purpose` stay plain TEXT and are validated against the manifest registries.
