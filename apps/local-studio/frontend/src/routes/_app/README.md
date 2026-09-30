# `_app` vs `(apps)` route ownership

Generated `src/routeTree.gen.ts` mounts **live** Studio surfaces from `routes/(apps)/*`.

| Path | Status |
| --- | --- |
| `routes/(apps)/*` | **Live** public routes (`/cms`, `/artifacts`, `/projects`, …) |
| `routes/_app/*` | **Superseded donors** — keep for reference; do not add new product code |

When retiring a `_app` file, leave a short superseded stub (`export {}`) rather than deleting blindly until desktop/docs references are audited.
