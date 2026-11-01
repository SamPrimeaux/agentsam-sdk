# AgentSam Communications

Provider-neutral, account-scoped email transport for the AgentSam SDK.

**Status: implemented portable SDK module, not a hosted delivery service.** Sender identity, brand, credentials and provider grants belong to the consuming host. Nothing in this package requires an InnerAnimalMedia account, environment variable or domain.

## Import

From the root SDK: `import { createCommunications, createResendEmailAdapter, createGmailMcpEmailAdapter, createCallbackEmailAdapter, createNotificationOutboxStore } from '@inneranimalmedia/agentsam-sdk/communications';`

When separately published: `@inneranimalmedia/agentsam-communications`.

## Providers

- **Resend** via `createResendEmailAdapter({getApiKey,fetchImpl})`. The host resolves the current account's secret; only the host selects a verified sender.
- **Gmail MCP** via `createGmailMcpEmailAdapter({sendMessage})`. The injected callback is owned by the host and its approved connected Gmail account. The SDK does not invent Gmail tool schemas, grant OAuth scopes or store tokens.
- **Any other provider** via `createCallbackEmailAdapter({id:'ses',send})`. SMTP, Postmark, SES, Graph, or other MCP-backed services may implement this contract.
- The host chooses the transport through `selectProvider`. There is **no automatic provider fallback**: changing providers after a possible send risks duplicates and unauthorized sender changes.

## Example host integration

```js
const messaging = createCommunications({
  providers: [resend, gmailMcp, other],
  authorize: ({ context, providerId, action }) =>
    hostPolicy.canSend({ principal: context.principal, accountId: context.accountId, providerId, action }),
  selectProvider: ({ context, requestedProvider }) =>
    hostConfig.selectAuthorizedEmailProvider({ accountId: context.accountId, requestedProvider }),
  resolveSender: ({ context, providerId }) =>
    hostIdentity.resolveVerifiedSenderAndBrand({ accountId: context.accountId, providerId }),
  renderTemplate: ({ templateId, data, brand, context }) =>
    hostTemplateRegistry.render({ templateId, data, brand, context }),
  outbox: createNotificationOutboxStore(db),
});
await messaging.sendEmail({
  context: { accountId: verifiedAccountId, principal, actorId },
  to: 'recipient@example.com',
  templateId: 'meeting-invitation',
  data: { meetingName, joinUrl },
  purpose: 'meet.invited',
});
```

Host code must supply the authenticated account and authorizer; don't trust a request body's account or sender ID. The brand and template are resolved through the host's existing identities and approved assets.

## Database authority and limitations

The optional outbox uses the **existing** `migrations/runtime/0010_agentsam_notifications.sql` table `notification_outbox`. It records a pending entry, claims it before delivery, and writes confirmed provider acceptance or failure. Reads and status transitions include `account_id`. Rendered content is stored in the outbox; hosts must enforce access, retention and appropriate data protection.

This initial slice delivers synchronously; it **does not implement** an automatic queue consumer, failed/unknown-delivery retry scheduler, provider webhooks, Gmail OAuth flow, in-app notification delivery, SMS, or marketing consent orchestration. A returned provider message ID proves acceptance by that provider, not inbox placement. Do not advertise those unimplemented paths as supported.

The public package is provider-neutral, and future channels can be added through the existing AgentSam notifications protocol rather than creating a second inbox authority.
