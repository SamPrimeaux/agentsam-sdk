# Storefront identity and access

## Separate access modes

The CMS exposes two distinct identity concerns. They must not share credentials or be presented as the same setting.

### Store password protection

This is one merchant-managed password for the whole storefront. The merchant owns the password and can set, change, disable, or remove it from Online Store → Preferences → Store access.

- The plaintext password is accepted only by the authenticated merchant preferences write.
- cms_sites.settings_json.store stores only the Identity password hash and salt.
- Password hashing and verification use @inneranimalmedia/agentsam-sdk/identity/core/password-crypto.
- The storefront entry page is rendered by @inneranimalmedia/agentsam-sdk/identity/frontend/auth-portal/store-access.
- Successful entry receives a Secure, HttpOnly, SameSite=Lax, __Host- cookie.
- The access grant is bound to the CMS site and current password credential; changing or removing the password invalidates earlier grants.
- Storefront pages and public data APIs are gated server-side. Admin routes remain available.
- Protected sites are excluded from public sitemap output and search indexing.

Existing CMS PBKDF2 hashes remain verifiable by the Identity password verifier. New passwords use the Identity package's 256-bit salt format.

### Customer accounts and B2B access

Customer sign-in is a different system: each customer has their own identity, password, profile, and store membership. It must use the reusable Identity login, registration, recovery, and session flows—not the merchant's shared store password.

Do not directly mount either existing Identity adapter for storefront customers:

- The IAM compatibility adapter reads the platform's shared accounts, auth_users, and auth_sessions records.
- The portable D1 adapter uses its own identity schema but does not currently scope users by cms_sites.id.

Using either adapter unchanged for merchant storefront customers would create the wrong identity boundary. Before enabling customer login or the B2B-only switch, add a site/tenant-scoped Identity persistence adapter and membership/approval model. The Identity service and portal remain reusable; the CMS host owns site resolution, customer membership, persistence and authorization.

## Current implementation boundary

Implemented:
- Merchant-managed shared password lifecycle.
- Identity-owned password hashing and verification.
- Identity-owned site-bound access grant primitives.
- Identity-owned shared-password portal renderer.
- Site isolation, credential rotation and expiry tests.

Not yet implemented:
- Storefront customer registration/login/recovery using site-scoped customer identities.
- Customer approval and B2B membership authorization.
- Brute-force rate limiting for shared-password submissions.
- Production-grade grant signing: current grants derive their HMAC key from the stored password hash and salt. Move this to a server-only signing secret resolved through the packaged Vault/Identity boundary, or opaque server-side sessions in host-owned storage, before public launch. A database reader could otherwise mint a grant.

Do not describe the customer-account or B2B settings as active until those pieces are implemented and verified.
