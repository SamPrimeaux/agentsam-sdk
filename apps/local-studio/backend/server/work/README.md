# Local Studio Work backend boundary

This directory is the host implementation boundary for the private reusable
`@inneranimalmedia/agentsam-work` workspace package.

The React package owns normalized Work presentation and contracts. Local Studio
owns authentication, account authority, HTTP, Cloudflare bindings, D1, Gmail,
Google Calendar, R2, local-device access, and provider-specific behavior.

## Donor → Local Studio adapters

| Product capability | InnerAnimalMedia donor | Local Studio target |
| --- | --- | --- |
| Tickets | `/api/tickets*`, `agentsam_tickets`, `agentsam_ticket_events` | `WorkTicketsAdapter`; preserve `surface=platform|collaborate` |
| Calendar | `/api/calendar*`, `src/api/calendar.js` | `WorkCalendarAdapter` |
| Mail | `/api/mail*`, `src/api/mail.js` | `WorkMailAdapter` |
| Gmail OAuth | `backend/http/oauth/integrations/gmail-connect.js` | Local Studio identity/integration adapter with flat `/mail` return path |
| Artifacts | `/api/artifacts*` | `WorkArtifactsAdapter` |
| Projects | `/api/projects*` | `WorkProjectsAdapter` |
| Ticket analytics | `/api/tickets/analytics` | `WorkAnalyticsAdapter` |

## Data sources already in the donor

- Tickets: `agentsam_tickets`, `agentsam_ticket_events`
- Calendar: `calendar_events`, `calendar_working_hours`,
  `calendar_booking_pages`
- Mail: `email_logs`, `email_attachments`, `email_templates`,
  `email_labels`, `user_oauth_tokens`

No migration is required for the localhost UI scaffold. The first production
wire-up should implement read adapters against the existing normalized sources,
then replace the fixture WorkHost in Local Studio one capability at a time.

## Authority

Every adapter receives `WorkRequestContext.accountId` derived from the
validated Local Studio session. UI query strings may select a project, source,
folder, or ticket surface, but may not supply or override account authority.

## Route policy

Product routes are flat:

- `/collaborate`
- `/collaborate?seg=tickets`
- `/mail`
- `/artifacts`
- `/artifacts/tickets`
- `/artifacts/tickets/:ticketId`
- `/projects`
- `/projects/:projectId`

Do not reintroduce `/dashboard` into reusable Work contracts.
