# Google Cloud OAuth setup for AgentSam

Two different Google login paths. Do not conflate them.

## Path A — CLI operator auth

### Default: Agent Sam hosted Google (`agentsam gcloud auth login`)

```bash
agentsam gcloud auth login
```

**Desktop PKCE (`--desktop`):** loopback using `GOOGLE_DESKTOP_CLIENT_ID` (Console type
**Desktop app**, no secret). Some Google Auth Platform Desktop clients still return
`client_secret is missing` on token exchange even though Console shows Type=Desktop —
that is a Google classification quirk, not something AgentSam can invent a secret for.

**Default CLI path (recommended):** Studio Web OAuth broker — uses `GOOGLE_CLIENT_ID` +
Worker `GOOGLE_CLIENT_SECRET`, then hands tokens to the CLI over loopback.

Uses the **same** Authorized redirect URI as Studio login (no extra Console URI):

```text
https://agentsam.inneranimalmedia.com/api/oauth/google/callback
```

CLI broker states are prefixed `cli_` so the Worker can share that path with identity login.

```bash
agentsam gcloud auth login              # Studio Web broker (default)
agentsam gcloud auth login --desktop    # native Desktop PKCE
```

### Hosted identity (`agentsam gcloud auth login --web`)

Shows the live start URL and waits for **Enter** to open the system browser:

```text
https://agentsam.inneranimalmedia.com/api/oauth/google/start
```

Consent branding: **Continue to Agent Sam** (your `GOOGLE_CLIENT_ID`).

| Piece | Value |
| --- | --- |
| Consent UI | Your OAuth app name (Agent Sam / Local Studio) |
| OAuth client | Your Web client (`GOOGLE_CLIENT_ID` + Worker `GOOGLE_CLIENT_SECRET`) |
| Redirect | `https://agentsam.inneranimalmedia.com/api/oauth/google/callback` |

### Optional: Google Cloud SDK (`agentsam gcloud auth login --sdk`)

Wraps native **Google Cloud SDK** OAuth when you need ADC / `gcloud` CLI identity on the machine:

```bash
agentsam gcloud auth login --sdk
# same engine as:
gcloud auth login
```

| Piece | Value |
| --- | --- |
| Consent UI | Google’s “Google Cloud SDK wants to access your Google Account” |
| OAuth client | Google’s public SDK client (`*.apps.googleusercontent.com`) |
| Redirect | `http://localhost:8085/` (Google-controlled — **not** AgentSam) |
| Stores | gcloud user credentials / ADC on the machine |

**You do not create a Client ID for the `--sdk` path.** Installing `gcloud` is enough.

---

## Path B — AgentSam-hosted Google connection (web / Local Studio)

For **Identity login** and **provider Connections** in Local Studio / AgentSam web, use an OAuth client **you** own, with HTTPS redirects on the **AgentSam** host.

### Primary redirect (AgentSam)

```text
https://agentsam.inneranimalmedia.com/api/oauth/google/callback
```

Start / authorize:

```text
https://agentsam.inneranimalmedia.com/api/oauth/google/start
```

### Secondary (InnerAnimalMedia dashboard only)

`https://inneranimalmedia.com/api/oauth/google/callback` is the **IAM worker/app** Google login — not AgentSam Local Studio. Register it only if the dashboard product still needs Google Connect there. Do **not** point AgentSam Connections at the IAM callback.

| Product surface | Callback |
| --- | --- |
| AgentSam / Local Studio | `https://agentsam.inneranimalmedia.com/api/oauth/google/callback` |
| InnerAnimalMedia dashboard | `https://inneranimalmedia.com/api/oauth/google/callback` |
| AgentSam CLI (`agentsam login`) | Loopback `http://127.0.0.1:<port>/callback` (RFC 8252) |
| `agentsam gcloud auth login` | Google SDK `http://localhost:8085/` (Path A) |

Loopback remains correct for **native AgentSam CLI** login when the shell
has the same OAuth client the Worker uses (`IAM_CLIENT_ID=iam_agentsam_sdk_web`
on Local Studio Production) — RFC 8252 PKCE. Do not invent alternate client ids.
Hosted HTTPS redirects are for browser apps and Local Studio.

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
  - `https://inneranimalmedia.com` (only if IAM dashboard shares the client)
- Authorized redirect URIs (AgentSam-first):
  - `https://agentsam.inneranimalmedia.com/api/oauth/google/callback` ← **required for AgentSam**
  - `https://inneranimalmedia.com/api/oauth/google/callback` ← optional IAM dashboard only

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
| AgentSam / Local Studio Google connect | **`https://agentsam.inneranimalmedia.com/api/oauth/google/callback`** |
| IAM dashboard Google connect | `https://inneranimalmedia.com/api/oauth/google/callback` (separate product) |

Building a fully custom “AgentSam Google Cloud SDK” that uses only `agentsam.inneranimalmedia.com` redirects (no gcloud client) is a larger Connections product — token relay, refresh, and API wrappers — tracked separately from wrapping `gcloud auth login`.
