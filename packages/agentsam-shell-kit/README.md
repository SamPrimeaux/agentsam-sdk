# `@inneranimalmedia/agentsam-shell-kit`

> The work surface, unified.

Private **npm workspace** package under `@inneranimalmedia/agentsam-sdk`.
Not published separately yet (`private: true`).

WIP name `@agentsam/shell-kit` was folded here under the Inner Animal Media org scope.

## Status

| Area | State |
|------|--------|
| `shell/` (Breadcrumb, surfaceRegistry) | Present |
| `tickets/` / `verify/` / `tokens/` | Planned — do not invent stubs at import time |

## Usage (local workspace)

```tsx
import { Breadcrumb } from '@inneranimalmedia/agentsam-shell-kit';
```

When this surface is ready for consumers, drop `private`, bump, and publish
from `packages/agentsam-shell-kit` (or re-export from the root SDK).
