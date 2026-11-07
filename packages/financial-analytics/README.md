# @inneranimalmedia/financial-analytics

Provider-neutral financial read models, metric presentation, and a reusable mobile-first financial connection flow. Hosts own identity, credentials, permissions, server routes, queries, and tenant policy.

## Financial connection flow

Import the component from `@inneranimalmedia/financial-analytics/ui/provider-connect` and the stylesheet from `@inneranimalmedia/financial-analytics/styles/provider-connect.css`.

```tsx
import { FinancialProviderConnectFlow } from "@inneranimalmedia/financial-analytics/ui/provider-connect";
import type { FinancialConnectionProvider } from "@inneranimalmedia/financial-analytics";
import "@inneranimalmedia/financial-analytics/styles/provider-connect.css";

// The authenticated host must fetch this catalog from its existing
// account/workspace-scoped integration registry, never from a baked-in list.
const providers: FinancialConnectionProvider[] = await financialApi.listProviders();

// Use in an existing React page:
<FinancialProviderConnectFlow
  open={connectionsOpen}
  onClose={() => setConnectionsOpen(false)}
  providers={providers}
  onAuthorize={(provider) => financialApi.beginAuthorization(provider.id)}
  onManage={(provider) => financialApi.openManagement(provider.id)}
/>;
```

**Provider-neutral**: Stripe, PayPal, and future finance integrations are examples of providers that a host can discover. The package does not pretend they exist, that they are connected, or that their OAuth/merchant agreements are identical. The host's catalog supplies status, description, user-facing permission explanations, and capability names.

**Expected host contract**: `listProviders()` returns an authenticated, workspace-scoped list of `FinancialConnectionProvider` records. `beginAuthorization(provider.id)` verifies the account/workspace and CSRF/session, creates a short-lived signed state/nonce and PKCE where supported, and returns `{ authorizationUrl: string }`. The component navigates the same browser window to the provider's HTTPS authorization page; it **never** collects API secrets or payment credentials. The host callback verifies the provider state, securely stores tokens, and refreshes the catalog before marking a provider connected. Provider availability and capabilities are server authority, not a client-side allowlist.

Status: `available` (can connect), `connected` (host confirms a link), `action_required` (needs re-authorization), `unavailable` (cannot start). The flow refuses authorization without a host callback, blocks insecure redirect schemes, and keeps errors visible; it never fabricates success.

**Mobile/accessibility**: Bottom-sheet presentation under 640px; centered dialog at larger widths; `dvh` + safe-area insets; scrollable content with a stationary action footer; 44px minimum controls; focus trap/restore; Escape and backdrop dismiss; responsive text wrapping; reduced-motion-safe transitions. No desktop-only fixed height. Host should still run real iOS Safari device tests (keyboard, orientation, address-bar expansion, VoiceOver).

## Financial metric read models

`selectFinancialMetrics(capabilities)` chooses only metrics supported by actual sources. The read model distinguishes `available`, `empty`, and `unavailable`; consumers must not turn missing financial data into zero.

The package does not assume a store, order system, payment processor, chart of accounts, or Cloudflare account. FinancialMetricDeck uses analytics-ui primitives and is presentation-only.

Cloudflare runtime counts and Workers Analytics Engine events are not invoice-aligned charges. Only a billing source that returns billed usage should expose `cloud_billing` and `cloud_billed_cost`.


## CMS billing portal embed

`CmsBillingPortalEmbed` is a small, theme-token-driven entry point to the
host's authenticated billing area. It is not a Stripe widget, does not handle
cards, and cannot be given an external or protocol-relative payment URL by
theme content.

```tsx
import { CmsBillingPortalEmbed } from
  "@inneranimalmedia/financial-analytics/ui/cms-billing-portal";
import "@inneranimalmedia/financial-analytics/styles/cms-billing-embed.css";

// The site host must verify this route is authenticated before supplying it.
<CmsBillingPortalEmbed
  billingHref={authenticatedBillingRoute}
  content={{ heading: "Billing & invoices", style: "card" }}
/>
```

The SDK Ecommerce CMS manifest exposes `customer_billing` in the existing
App Embeds catalog. Installed instances persist as page-owned sections and
blocks, with real draft settings and an inert editor preview. Hosts must still
mount the component at their published site slot and supply a verified
account route before visitors can use it. The package deliberately does
not assume every CMS host implements that route.
