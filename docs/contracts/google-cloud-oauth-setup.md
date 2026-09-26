# Google Cloud OAuth setup for AgentSam

Two different Google login paths. Do not conflate them.

## Path A — CLI operator auth (`agentsam gcloud auth login`)

Wraps native **Google Cloud SDK** OAuth:

```bash
agentsam gcloud auth login
# same engine as:
gcloud auth login
```

| Piece | Value |
| --- | --- |
| Consent UI | Google’s “Google Cloud SDK wants to access your Google Account” |
| OAuth client | Google’s public SDK client (`*.apps.googleusercontent.com`) |
| Redirect | `http://localhost:8085/` (Google-controlled — **not** AgentSam) |
| Stores | gcloud user credentials / ADC on the machine |

**You do not create a Client ID for this path.** Installing `gcloud` is enough.

AgentSam cannot move that redirect to `agentsam.inneranimalmedia.com` without replacing gcloud’s client entirely. Google’s own CLI uses localhost; that is normal.

---

## Path B — AgentSam-hosted Google connection (web / Local Studio)

For **Identity login** and **provider Connections** in Local Studio, use an OAuth client **you** own, with HTTPS redirects on AgentSam hosts.

### Recommended redirect URIs

Register **both** (production + studio):

```text
https://inneranimalmedia.com/api/oauth/google/callback
https://agentsam.inneranimalmedia.com/api/oauth/google/callback
```

Authorize / start (examples):

```text
https://inneranimalmedia.com/api/oauth/google/start
https://agentsam.inneranimalmedia.com/api/oauth/google/start
```

Loopback (`http://127.0.0.1:<port>/callback`) remains correct for **native AgentSam CLI** login to InnerAnimalMedia (`iam_cli_agentsam`) — same RFC 8252 pattern as gcloud. Hosted HTTPS redirects are for browser apps and Local Studio, not a requirement to “make CLI real.”

---

## Setup checklist (Path B — your Google Cloud Console)

Project: prefer `gen-lang-client-0684066529` (InnerAnimalMedia) once billing ownership is clear.

### 1. Enable APIs

APIs & Services → Enable APIs:

- Cloud Resource Manager API  
- IAM API  
- Compute Engine API  
- (optional) Vertex AI, BigQuery, Cloud Billing API — as needed for Connections discovery  

### 2. Configure OAuth consent screen

APIs & Services → OAuth consent screen:

- User type: **External** (or Internal if Workspace-only)
- App name: `Agent Sam`
- Support email / developer contact: your IAM email
- Scopes (start minimal for login; expand for Cloud Connections):
  - `openid`
  - `email`
  - `profile`
  - For Cloud resource discovery later: add Cloud Platform scopes only when Connections needs them (`https://www.googleapis.com/auth/cloud-platform` is powerful — prefer incremental scopes)

Publishing status: **Testing** while iterating; add test users (you, Connor).

### 3. Create OAuth client

APIs & Services → Credentials → Create credentials → **OAuth client ID**:

- Application type: **Web application**
- Name: `Agent Sam Local Studio / Identity`
- Authorized JavaScript origins (if needed):
  - `https://agentsam.inneranimalmedia.com`
  - `https://inneranimalmedia.com`
- Authorized redirect URIs:
  - `https://inneranimalmedia.com/api/oauth/google/callback`
  - `https://agentsam.inneranimalmedia.com/api/oauth/google/callback`

Copy:

- Client ID → `GOOGLE_CLIENT_ID`
- Client secret → `GOOGLE_CLIENT_SECRET` (Wrangler **secret**, never frontend)

### 4. Install on AgentSam hosts

```bash
# example — production worker secrets
npx wrangler secret put GOOGLE_CLIENT_SECRET
# GOOGLE_CLIENT_ID may already be a plain var in wrangler.jsonc
```

Local Studio / SDK `.env` (server only):

```bash
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...   # server-only
```

### 5. Prove it

```bash
# Operator CLI (Path A) — Google Cloud SDK consent
agentsam gcloud auth login
agentsam google-cloud doctor

# Hosted Identity (Path B) — browser
open "https://agentsam.inneranimalmedia.com/api/oauth/google/start"
# or Local Studio Connections → Google
```

### 6. Service accounts (workload) vs your user OAuth

| Kind | Purpose |
| --- | --- |
| Your user via `gcloud auth login` | Operator / discovery / admin on the Mac |
| `agent-sam-vertex@…` etc. | Workload SAs inside the GCP project |
| `AGENTSAM_API_KEY` / `AGENTSAM_BRIDGE_KEY` | AgentSam platform — **not** Google keys |

See also: `docs/contracts/environment-vocabulary.md` and `~/.agentsam/audits/GCP-SA-DISPOSITION-2026-09-25.md`.

---

## What “agentsam.inneranimalmedia.com instead of localhost” means

| Flow | Redirect host |
| --- | --- |
| `gcloud auth login` / `agentsam gcloud auth login` | Google’s `localhost` (immutable without custom client + custom token broker) |
| `agentsam login` (InnerAnimalMedia account) | Loopback `127.0.0.1` for CLI; authorize already on `inneranimalmedia.com` |
| Local Studio / web Google connect | **`agentsam.inneranimalmedia.com` or `inneranimalmedia.com` HTTPS callbacks** ← this is where you register Client ID/secret |

Building a fully custom “AgentSam Google Cloud SDK” that uses only `agentsam.inneranimalmedia.com` redirects (no gcloud client) is a larger Connections product — token relay, refresh, and API wrappers — tracked separately from wrapping `gcloud auth login`.
