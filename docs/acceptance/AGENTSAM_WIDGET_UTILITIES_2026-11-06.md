# AgentSam Widget WIP graduation — working utilities acceptance

Status: **source and local packed-consumer accepted; public npm 2.6.14 not published**.
Source: recovered intentional Clock and Calculator behavior from `feat/widget-platform-donor-graduation-20261005`, reconciled against the canonical `packages/agentsam-workbench/src/widgets` implementation.

## Implemented, not scaffolded

- `ClockWidget`: actual client device time, live seconds, user-switchable 12/24-hour display, validated IANA timezone selector, DST-correct UTC offset, date/daytime and world glance. No fake `09:41` time is shown as live.
- `CalculatorWidget`: live pointer + keyboard controls, parentheses, arithmetic, remainder operator, backspace/clear, actual session calculation history and reuse. Bounded parser; no `eval`, `new Function`, or arbitrary code execution. Division by zero and invalid input are explicit errors.
- Canonical widget registry and `BuiltinWidget` dispatch now recognize four **real** renderers: Queue Depth, Countdown, Clock and Calculator. Exactly 18 remaining concepts are still preview-only, not falsely marked runnable.
- Existing `Settings → Customize → Widgets` remains configuration authority; selected installed widgets render **actual controls** in its preview; card clock shows actual device time. Existing visibility preference still works. Existing `/widgets` route now mounts the reusable `WidgetUtilitiesPage` instead of redirecting away from Settings’ own Open widget action.
- The only runtime owner is `@inneranimalmedia/agentsam-workbench/widgets`. Existing Local Studio and Settings consume its packaged export; no duplicate widget app, database, fake approval queue, or second plugin registry.
- Responsive widget CSS uses existing semantic theme variables; browser smoke includes real interactions.

## Executed release evidence

- `npm --prefix packages/agentsam-workbench test`: **26 passed, 0 failed**, including DST, unsafe expressions and SSR rendering.
- `npm --prefix packages/agentsam-settings test`: **8 passed, 0 failed**.
- `node --test apps/local-studio/scripts/moviemode-integration.test.mjs apps/local-studio/scripts/side-stage-tab-identity.test.mjs`: **9 passed**, including real widget route contract; corrected an obsolete hardcoded-media-stage assertion to current registry behavior.
- `npm --prefix apps/local-studio run build:desktop`: production desktop bundle passed, with widget CSS included. `npm --prefix apps/local-studio run smoke:desktop`: mounted actual Local Studio using headless Chrome.
- `npm run smoke:widgets:browser`: headless Chrome actually changed timezone to UTC, toggled 12/24-hour mode, calculated 7 × 8 = 56 and inspected its real history; **PASS**. The test bundles exactly one React instance to avoid false development-environment duplicate-React failures.
- Restored, corrected and ran the original donor `scripts/verify-widget-platform.mjs` as `npm run verify:widgets:portable`: built first-party dependencies, packed Workbench + Contracts + Loading Scene into .tgz files, installed those tarballs into a separate temporary consumer and executed `examples/widget-consumer/src/smoke.mjs` using only `@inneranimalmedia/agentsam-workbench/widgets`. **PASS**. Wired into `verify:release`.
- `npm run release:train:check`: 2.6.14 source package graph aligned (65 public packages), **PASS**.

## Intentionally not accepted / next work

- npm registry still serves 2.6.13; local npm authentication returned `E401`. These changes are **not** published 2.6.14 and not verified as a publicly installable npm release.
- Donor branch retains approvals, telemetry, runtime status, jobs, gestures, haptics and other components. They are not functional without account-authorized data adapters. Do not import their mock activities/approval actions into production; graduate each against the actual authorities separately. Keep the donor branch available until that work is accepted.
- Widgets visibility is still device-local preferences; account-scoped D1 widget installations and layout persistence remain distinct later integration gates. This slice does not pretend to complete them.
- The shared `agentsam-sdk` customer-key/OAuth and public signed desktop release blockers from the main program are unaffected.

## Manual verification

From a source checkout with installed dependencies: `npm run launch`, open Settings → Customize → Widgets, select Clock/Calculator and interact with live controls. Open the widget to navigate to the working utility presentation. `npm run verify:widgets:portable` verifies that these are packaged, portable artifacts rather than UI-only fixtures.
