# AgentSam identity/auth configuration contract

The `agentsam-sdk` package owns the portable public configuration contract. Consuming applications implement storage, authorization, and host routes against this contract instead of defining competing environment names.

## Canonical variables

| Variable | Meaning |
| --- | --- |
| `IAM_ORIGIN` | Canonical IAM authority and browser/OAuth/API origin. |
| `IAM_CLIENT_ID` | OAuth client id for an application using IAM identity. |
| `IAM_CLIENT_SECRET` | OAuth client secret. Keep it server-side. |
| `AGENTSAM_SDK_KEY` | Account/delegated SDK bearer. Raw values use the `sdk_` prefix and are sent as `Authorization: Bearer …`. |
| `AGENTSAM_BRIDGE_KEY` | Machine/integration credential. It is never a substitute for user SDK authentication. |

The host-side durable verifier for SDK credentials is `agentsam_sdk_tokens`. The SDK defines the public credential semantics; the host owns the database and authorization implementation.

`AGENTSAM_BRIDGE_KEY` remains the direct machine-secret environment variable. A host may additionally resolve a hashed credential from `agentsam_sdk_tokens` when that row has `token_type='integration'`. That does not turn the bridge credential into user authentication.

## Migration compatibility

The current migration window accepts two deprecated read fallbacks:

```text
IAM_ORIGIN
  fallback: IAM_OAUTH_ISSUER

AGENTSAM_SDK_KEY
  fallback: AGENTSAM_SDK_TOKEN
```

Canonical names always win when both are present. New scaffolds, docs, and writes emit only the canonical names. Compatibility aliases are intentionally not a permanent parallel configuration surface.

Older platform-base aliases (`IAM_CORE_URL`, `AGENTSAM_CORE_URL`, `AGENTSAM_BASE_URL`) are compatibility-only. SDK clients prefer `IAM_ORIGIN`.

## Credential boundaries

```text
human/account SDK lane
  AGENTSAM_SDK_KEY
    -> sdk_* bearer
    -> Authorization: Bearer <sdk_*>
    -> account/delegated authority
    -> agentsam_sdk_tokens

machine/integration lane
  AGENTSAM_BRIDGE_KEY
    -> machine principal
    -> no user/workspace identity injection
    -> host env secret OR agentsam_sdk_tokens(token_type='integration')
```

Browser OAuth uses `IAM_ORIGIN` together with `IAM_CLIENT_ID` and `IAM_CLIENT_SECRET`. Repository identity, workspace labels, or machine trust do not prove account authority.
