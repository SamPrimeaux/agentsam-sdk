# AgentSam Work product extraction

## Product boundary

AgentSam Work is a **private monorepo workspace package**, not a separately
published product package. It is reusable UI/runtime contract code consumed by
Local Studio and can later be composed into other AgentSam apps.

```
packages/agentsam-work
  contracts       normalized Work view/runtime models
  frontend        shell, mini navigation, right rail, surfaces
  client          transport adapter
  fixtures        production-shaped localhost data

apps/local-studio
  frontend        route composition + LocalStudio WorkHost
  backend/server/work
                  authenticated provider/storage adapters
```

The package is intentionally parallel to `@inneranimalmedia/agentsam-settings`:
presentation/contracts are reusable; Local Studio remains the first host and
owns backend authority.

## Donor material

The current InnerAnimalMedia dashboard remains a donor, not a dependency.

The extraction studied:

- `CollaborateWorkShell.tsx`
- `CollaboratePageRail.tsx`
- `collaborateRailNav.ts`
- `shellNav.ts`
- `LaunchDeskPage.tsx`
- `CollaborateTasksPanel.tsx`
- `MailPage.tsx`
- `api/tickets.ts`
- `api/projects.ts`
- calendar/mail/Gmail OAuth backend modules

The useful product grammar is retained:

- one Work mini navigation family;
- optional narrow right utility rail;
- Calendar/Tickets/Mail as one Work workbench;
- ticket `surface` separates engineering/platform tickets from Collaborate
  tickets without duplicating the ticket runtime;
- Artifacts and Projects share the same Work chrome;
- Projects keep their card-grid information architecture;
- project detail keeps its main AgentSam composer plus the quick-stats and
  project-context rail.

Dashboard-specific route prefixes, workspace navigation infrastructure, and
host-specific CSS are not imported into the package.

## Flat route contract

```
/collaborate
/collaborate?seg=tickets
/mail
/artifacts
/artifacts/tickets
/artifacts/tickets/:ticketId
/projects
/projects/:projectId
```

`seg=tasks` may remain a compatibility alias at a host boundary, but reusable
links emit `seg=tickets`.

## Theme contract

The default theme intentionally follows the simple Google Workspace/Cloud
visual grammar visible in the donor Work pages: bright canvas, subtle blue
selection, compact rows, restrained borders, little shadow, and rounded
controls.

It is not hard-coded as brand authority. Work surfaces consume semantic
`--agentsam-work-*` CSS variables. `applyWorkThemeTokens()` lets Local
Studio project a Settings → Themes selection into the Work package without
making Work import Settings.

## Backend extraction order

1. Keep all routes on the production-shaped fixture host until the UI shell is
   approved.
2. Implement read-only Local Studio adapters for projects, artifacts, tickets,
   calendar, and mail.
3. Switch Local Studio from `createFixtureWorkHost` to the HTTP host.
4. Add mutations (ticket CRUD, calendar CRUD, mail actions/compose) behind the
   same adapters.
5. Normalize Gmail OAuth return paths to flat `/mail`.
6. Only then evaluate database migrations; do not reshape live D1 just to
   satisfy the frontend scaffold.
