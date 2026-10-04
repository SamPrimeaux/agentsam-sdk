---
"@inneranimalmedia/agentsam-contracts": minor
"@inneranimalmedia/agentsam-workbench": minor
---

Add the widget foundation. `@inneranimalmedia/agentsam-contracts/widgets` defines framework-neutral widget definition and ready/stale/empty/error state contracts; `@inneranimalmedia/agentsam-workbench/widgets` ships `WidgetFrame`, `useCountdown`, `CountdownWidget`, and widget styling as a packaged surface. Countdown time authority derives remaining time from an absolute deadline rather than interval ticks, so sleeping or backgrounded tabs cannot corrupt the timer. Local Studio proves the packaged widget inside a real app on its `/widgets` utilities surface.
