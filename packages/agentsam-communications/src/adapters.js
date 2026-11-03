/** Provider adapters never own OAuth flows or sender authorization. Host injects those. */
function validEmail(message) {
  return Boolean(message && message.from && Array.isArray(message.to) && message.to.length &&
    message.subject && (message.html || message.text));
}
function providerResult(result) {
  if (result?.ok === false) return { ok: false, code: result.code || 'provider_rejected', retryable: result.retryable === true };
  const id = result?.id || result?.messageId || null;
  return id ? { ok: true, id: String(id) } :
    { ok: false, code: 'provider_delivery_unconfirmed', retryable: false };
}

/**
 * Host supplies per-account key and the configured fetch. No env or account IDs in SDK.
 * Resend sends only through a host-authorized, verified sender.
 */
export function createResendEmailAdapter({ getApiKey, fetchImpl = fetch } = {}) {
  if (typeof getApiKey !== 'function' || typeof fetchImpl !== 'function') {
    throw new TypeError('resend_requires_key_resolver_and_fetch');
  }
  return Object.freeze({
    id: 'resend', channel: 'email',
    async send({ message, context }) {
      if (!validEmail(message)) throw new TypeError('invalid_email_message');
      const key = await getApiKey({ context });
      if (!key) return { ok: false, code: 'provider_not_connected', retryable: false };
      const payload = {
        from: message.from, to: message.to, subject: message.subject,
        ...(message.html ? { html: message.html } : {}),
        ...(message.text ? { text: message.text } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      };
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        return { ok: false, code: 'provider_http_' + response.status,
          retryable: response.status === 429 || response.status >= 500 };
      }
      const result = await response.json().catch(() => null);
      return providerResult(result);
    },
  });
}

/**
 * Gmail MCP adapter for a host-authorized connector. The host provides a send
 * callback bound to a specific authenticated Gmail connection. This SDK does
 * not acquire tokens, invoke arbitrary MCP tools, or simulate a connected account.
 */
export function createGmailMcpEmailAdapter({ sendMessage } = {}) {
  if (typeof sendMessage !== 'function') throw new TypeError('gmail_mcp_send_callback_required');
  return Object.freeze({
    id: 'gmail-mcp', channel: 'email',
    async send({ message, context, meta }) {
      if (!validEmail(message)) throw new TypeError('invalid_email_message');
      const result = await sendMessage({ context, message, purpose: meta?.purpose || null });
      return providerResult(result);
    },
  });
}

/** SMTP, SES, Postmark, Graph, custom MCP, etc. use this same adapter contract. */
export function createCallbackEmailAdapter({ id, send } = {}) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-_]{1,63}$/i.test(id) ||
      typeof send !== 'function' || id === 'resend' || id === 'gmail-mcp') {
    throw new TypeError('invalid_custom_email_adapter');
  }
  return Object.freeze({
    id, channel: 'email',
    async send({ message, context, meta }) {
      if (!validEmail(message)) throw new TypeError('invalid_email_message');
      return providerResult(await send({ message, context, meta }));
    },
  });
}
