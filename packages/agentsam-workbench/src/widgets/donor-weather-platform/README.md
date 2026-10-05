# Donor Widget Platform Staging Area

This directory contains source copied from the `agentsamweatherwidget` donor for controlled migration.

It is intentionally not the canonical package API.

Do not delete donor components merely because their current data is demo-backed.

Migration strategy:

1. compare migrated component visually against donor;
2. move/refactor component into canonical `src/widgets/*`;
3. replace donor-specific contracts with AgentSam widget contracts;
4. preserve demo adapter if live adapter is not ready;
5. connect real package authority when available;
6. add tests;
7. only then remove the staged donor copy for that component.

The donor is an implementation/design reference.

The canonical end state is reusable `@inneranimalmedia/agentsam-workbench` widget infrastructure usable by Local Studio, desktop, and external SDK consumers.
