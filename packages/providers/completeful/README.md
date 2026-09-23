# @inneranimalmedia/agentsam-provider-completeful

Portable Completeful provider mechanics for AgentSam.

This package is deliberately **not** a Fuel & Free Time data layer. It owns provider HTTP behavior, provider tool definitions/execution, structured provider errors, webhook signature verification, and normalized Completeful event envelopes.

The host owns:

- resolving `completeful.api_key` to a real secret such as Fuel & Free Time's `CAPP_KEY`;
- account/shop configuration and authorization;
- D1/R2 catalog mirrors and curation;
- business workflows such as `fnf.order.sync`;
- mapping provider events like `completeful.order.created` into domain events such as `commerce.order.created`;
- execution receipts, queues, hook persistence, approvals and UI.

## First slice

The initial read-first tool surface is:

- `completeful.shop.list`
- `completeful.shop.get`
- `completeful.catalog.list`
- `completeful.catalog.get`
- `completeful.catalog.semantic`
- `completeful.order.get`
- `completeful.webhook.list`

Write tools will be added only with explicit side-effect/idempotency metadata and fail-closed mutation authority. The Completeful pinned OpenAPI contract remains under `apps/ecommerce-cms-agentsam/providers/completeful/reference/`.
