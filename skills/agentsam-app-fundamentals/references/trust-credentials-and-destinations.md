# Trust, Credentials, and Credentialed Destinations

## Trust is about execution ownership

The useful distinction is not "frontend equals UI" and "backend equals logic."
The useful distinction is who controls execution.

A browser, mobile client, or other user-controlled runtime can be inspected and
modified by that user. Treat requests from it as claims that the trusted side must
validate. Server-owned runtimes can hold privileged credentials and enforce durable
invariants, but they still must authenticate callers and apply least privilege.

## Public identifiers versus credentials

A public client/application ID tells a provider **which registered application** is
participating. It is often visible in redirect URLs or client configuration and is
not, by itself, proof of authority.

A client secret, API key, signing key, refresh token, database credential, or similar
secret is authority-bearing material. Its value belongs only in the runtime that is
allowed to use that authority. Do not confuse a secret's environment variable name
with the secret itself.

## OAuth redirect mental model

Keep the endpoints separate:

```text
/app/auth/login
  -> creates state / PKCE material as appropriate
  -> redirects browser to provider authorization endpoint

provider
  -> authenticates user + consent
  -> redirects only to registered callback

/app/auth/callback
  -> verifies state and flow binding
  -> exchanges code server-to-server when the flow requires it
  -> validates provider identity claims
  -> finds/creates local user
  -> establishes the app's own session
  -> redirects to the intended in-app destination
```

The callback is not the user's final product page. It is a security-sensitive
boundary where the external authorization flow becomes an internal authenticated
session.

For clients that cannot safely keep a static secret, use the provider's supported
public-client flow such as Authorization Code + PKCE rather than embedding a secret
in the client.

## Destination registry mindset

Treat every external system as a typed destination rather than an ad-hoc URL string.
For each destination record:

- canonical provider/service identity;
- allowed host/origin and transport;
- caller execution domain;
- public IDs versus secret credentials;
- scopes/permissions;
- redirect/callback/webhook endpoints;
- input/output schemas;
- retry, timeout, idempotency, and rate-limit behavior;
- audit/logging rules that never emit secrets;
- rotation/revocation owner.

This is the mechanism that makes `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, a
callback URI, and a login route understandable as one relationship instead of four
unrelated strings.

## Defense in depth

Think in layers, each assuming the layer before it can fail:

```text
internet
  -> edge/DDoS protection
  -> firewall/WAF/bot/rate-limit policy
  -> route/authentication
  -> authorization + ownership validation
  -> runtime schema validation
  -> least-privilege credential/service access
  -> durable audit/observability
```

A WAF can reject known-bad traffic, but it cannot know your business ownership rule.
Authentication can prove a user identity, but it does not automatically prove that
user may modify a particular record. A valid credential can authenticate a service
while still being over-privileged. Re-verify at each boundary.

## Fail fast at configuration boundaries

Validate required runtime configuration when the process/worker starts or before the
first privileged operation. Check presence, expected public/secret classification,
allowed destination, and format where the provider defines one. Never log the secret
value to explain a validation failure.
