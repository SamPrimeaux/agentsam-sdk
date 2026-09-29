# ChatGPT / OpenAI Identity Harvest

## Why this is worth preserving

`app/chatgpt-auth.ts` contains the hosted ChatGPT identity pattern that motivated part of the original CMS experience.

This is valuable as a provider/adapter reference for AgentSam Identity.

It is not an OpenAI inference integration.

## Target package boundary

Primary destination concept:

`packages/identity/src/providers/openai/`

Possible exports:

- `@inneranimalmedia/agentsam-sdk/identity/providers/openai`
- hosted ChatGPT identity adapter
- partner-site Sign in with ChatGPT provider when OpenAI onboarding supports it

## Normalized identity

OpenAI/ChatGPT-specific transport details should normalize into the same external identity contract used by other AgentSam providers:

```js
{
  provider: "openai",
  subject: "<stable-provider-subject>",
  email: "...",
  emailVerified: true | false,
  name: "...",
  avatar: "...",
  username: null
}
```

The CMS should consume AgentSam identity/account context, not OpenAI headers.

## Two integration modes

### 1. ChatGPT-hosted environment

Transport-specific request metadata/headers are interpreted by a hosted adapter.

The old donor currently references:

- `oai-authenticated-user-email`
- `oai-authenticated-user-full-name`
- `oai-authenticated-user-full-name-encoding`

Treat those names as historical/reference evidence unless OpenAI documents them as a stable public contract for the target environment.

### 2. External partner website

Desired customer UX:

`Continue with ChatGPT -> OpenAI consent -> callback -> AgentSam identity/account`

Do not invent authorize/token endpoints. Keep the provider fail-closed until supported configuration is available.

## Separate identity from AI provider access

These are different capabilities:

- ChatGPT/OpenAI identity: who the person is
- OpenAI model provider: which inference credentials/capabilities AgentSam may use
- delegated OpenAI/ChatGPT capabilities: any future explicit consent for additional user-authorized resources

Signing in with ChatGPT must never be treated as permission to run paid inference or read unrelated ChatGPT data.

## Packaging rule

OpenAI should be optional just like Google, GitHub, Cloudflare, and IAM.

Example future scaffold:

```bash
agentsam identity init --providers inneranimalmedia,google,openai
```

No unused provider should be forced into a generated customer app.
