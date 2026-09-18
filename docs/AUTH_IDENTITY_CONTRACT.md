# AgentSam identity/auth configuration contract

The `agentsam-sdk` package owns the portable public configuration contract. Consuming applications implement storage, authorization, and host routes against this contract instead of defining competing environment names.

## Canonical variables

| Variable | Meaning |
| --- | --- |
| `IAM_OAUTH_ISSUER` | Canonical IAM authority/issuer for browser OAuth and platform account requests. |
| `IAM_ORIGIN` | Migration fallback for the IAM issuer. New code resolves `IAM_OAUTH_ISSUER` first. |
| `IAM_CLIENT_ID` | OAuth client id for an application using IAM identity. |
| `IAM_CLIENT_SECRET` | OAuth client secret. Keep it server-side. |
| `AGENTSAM_API_KEY` | Reusable account/delegated API credential. Raw values use the `aak_` prefix and are sent as `Authorization: Bearer …`. |
| `AGENTSAM_BRIDGE_KEY` | Infrastructure/machine integration trust. It is never a substitute for account authentication. |

The host-side durable verifier for reusable AgentSam API credentials is `agentsam_api_credentials`. The SDK defines the public credential semantics; the host owns credential issuance, hashing, storage, revocation, and authorization.

Interactive browser login is intentionally separate from `AGENTSAM_API_KEY`. The CLI stores an opaque machine-local browser session under `~/.agentsam/auth/session.json`; it does not turn that session into a reusable API key.

## Migration compatibility

The issuer resolver accepts `IAM_ORIGIN` only when `IAM_OAUTH_ISSUER` is absent. The retired `AGENTSAM_SDK_KEY`, `AGENTSAM_SDK_TOKEN`, `sdk_` bearer, and `agentsam_sdk_tokens` account-auth contract is not read by the current SDK.

Older platform-base aliases (`IAM_CORE_URL`, `AGENTSAM_CORE_URL`, `AGENTSAM_BASE_URL`) remain compatibility-only where legacy clients still consume them.

## Credential boundaries

```text
reusable account API lane
  AGENTSAM_API_KEY
    -> aak_* bearer
    -> Authorization: Bearer <aak_*>
    -> account/delegated authority
    -> agentsam_api_credentials (hashed verifier on the host)

interactive browser lane
  agentsam login
    -> opaque browser session credential
    -> ~/.agentsam/auth/session.json
    -> interactive account authority
    -> never rewritten as AGENTSAM_API_KEY

machine/infrastructure lane
  enrolled opaque machine credential / infrastructure bridge trust
    -> machine principal
    -> server resolves connection -> instance -> account
    -> never accepted as account API auth
```

Repository identity, workspace labels, terminal instance ids, and machine trust do not prove reusable account authority. Provider credentials such as `OPENAI_API_KEY`, `GEMINI_API_KEY`, `CURSOR_API_KEY`, and Cloudflare credentials are managed separately by the machine provider-credential service.
