# InnerAnimalMedia adapter (Sprint 3+)

Maps IAM D1 tables (`auth_users`, `accounts`, `account_identities`, `auth_sessions`, …)
into portable AgentSam Identity contracts.

IAM-specific behavior (tenant resolution, workspace membership, OAuth callback wiring)
stays here — not in `providers/`.
