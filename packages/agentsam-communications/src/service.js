/**
 * Portable communications runtime. No credential storage, owner identity,
 * platform-wide defaults, or provider-specific behavior belongs here.
 */
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(code);
  return value.trim();
}
function recipientAddresses(value) {
  const addresses = Array.isArray(value) ? value : [value];
  if (!addresses.length || addresses.length > 50 ||
      addresses.some(value => typeof value !== 'string' || !EMAIL.test(value.trim()))) {
    throw new TypeError('invalid_email_recipients');
  }
  return addresses.map(value => value.trim());
}
function normalizeResult(result, id) {
  if (!result || result.ok !== true || typeof result.id !== 'string' || !result.id.trim()) {
    return { ok: false, code: result?.code || 'provider_delivery_unconfirmed',
      retryable: result?.retryable === true, provider: id };
  }
  return { ok: true, id: result.id, provider: id };
}
function publicFailure(error) {
  // Provider exceptions can contain private headers or payloads: never return their messages.
  return { ok: false, code: 'provider_transport_failed', retryable: false };
}

/**
 * @param {{
 *   providers: Array<{id:string,channel:string,send:function}>,
 *   authorize: function,
 *   resolveSender: function,
 *   selectProvider?: function,
 *   renderTemplate?: function,
 *   outbox?: {enqueue:function,start:function,complete:function},
 * }} options
 */
export function createCommunications(options = {}) {
  if (typeof options.authorize !== 'function') throw new TypeError('authorize_callback_required');
  if (typeof options.resolveSender !== 'function') throw new TypeError('resolve_sender_callback_required');
  const providers = new Map();
  for (const provider of options.providers || []) {
    if (!provider?.id || provider.channel !== 'email' || typeof provider.send !== 'function' ||
        providers.has(provider.id)) throw new TypeError('invalid_or_duplicate_email_provider');
    providers.set(provider.id, provider);
  }

  async function sendEmail(input) {
    const context = input?.context;
    const accountId = required(context?.accountId, 'account_id_required');
    const to = recipientAddresses(input?.to);
    const requestedProvider = input?.providerId || null;
    const providerId = options.selectProvider
      ? await options.selectProvider({ channel: 'email', context, to, requestedProvider, purpose: input?.purpose || null })
      : requestedProvider || (providers.size === 1 ? providers.keys().next().value : null);
    if (!providerId || !providers.has(providerId)) return { ok: false, code: 'provider_not_configured' };
    const provider = providers.get(providerId);

    const granted = await options.authorize({
      action: 'communications.email.send', context, accountId, to,
      providerId, purpose: input?.purpose || null,
    });
    if (granted !== true && granted?.allowed !== true) {
      return { ok: false, code: 'send_not_authorized' };
    }

    const sender = await options.resolveSender({ context, providerId, to });
    const from = required(sender?.from, 'verified_sender_required');
    let body;
    if (input.templateId) {
      if (typeof options.renderTemplate !== 'function') return { ok: false, code: 'template_renderer_not_configured' };
      body = await options.renderTemplate({
        templateId: input.templateId, data: input.data || {}, brand: sender.brand || null, context,
      });
    } else {
      body = input;
    }
    const subject = required(body?.subject, 'email_subject_required');
    if (!body?.html && !body?.text) throw new TypeError('email_body_required');

    const message = {
      from, to, subject, html: typeof body.html === 'string' ? body.html : undefined,
      text: typeof body.text === 'string' ? body.text : undefined,
      replyTo: sender.replyTo || null,
    };
    const meta = {
      accountId, recipientAccountId: input.recipientAccountId || null,
      providerId, purpose: input.purpose || null, sourceId: input.sourceId || null,
      createdBy: context.actorId || 'system',
    };

    let outboxId = null;
    if (options.outbox) {
      outboxId = await options.outbox.enqueue({ meta, message });
      const claimed = await options.outbox.start({ id: outboxId, accountId });
      if (!claimed) return { ok: false, code: 'outbox_not_claimed', outboxId };
    }
    let response;
    try {
      response = normalizeResult(await provider.send({ message, context, meta }), providerId);
    } catch (error) {
      response = publicFailure(error);
    }
    if (outboxId) {
      try {
        await options.outbox.complete({
          id: outboxId, accountId, ok: response.ok,
          providerMessageId: response.id || null, errorCode: response.code || null,
        });
      } catch {
        // A provider might already have accepted this email. Never invite blind retry
        // because the local receipt write failed.
        return { ...response, outboxId, channel: 'email', receiptPersisted: false,
          ledgerError: 'outbox_completion_failed' };
      }
    }
    return { ...response, outboxId, channel: 'email', receiptPersisted: Boolean(outboxId) };
  }

  return Object.freeze({
    providers: () => [...providers.keys()],
    sendEmail,
  });
}
