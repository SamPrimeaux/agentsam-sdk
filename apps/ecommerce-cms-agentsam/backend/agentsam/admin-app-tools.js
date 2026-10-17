import { handleGrowthApi } from "../admin/growth.js";
import {
  getMailMailboxes,
  getResendStatus,
  listMailMessages,
  sendMailPreview,
} from "../admin/mail.js";

function jsonRequest(path, method, params = {}) {
  const url = new URL(path, "https://agentsam.internal");
  const upper = String(method || "GET").toUpperCase();
  if (upper === "GET") {
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return { request: new Request(url, { method: upper }), url };
  }

  return {
    request: new Request(url, {
      method: upper,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params || {}),
    }),
    url,
  };
}

function resolvePath(config = {}, params = {}) {
  let path = String(config.path_template || config.path || "");
  for (const [key, value] of Object.entries(params || {})) {
    path = path.replaceAll(`{${key}}`, encodeURIComponent(String(value ?? "")));
  }
  return path;
}

async function responsePayload(response) {
  const body = await response.clone().json().catch(async () => ({
    text: await response.text().catch(() => ""),
  }));
  return {
    ok: response.ok,
    status: response.status,
    ...body,
  };
}

export async function executeAdminAppTool(env, tool, params = {}, context = {}) {
  const user = context.user || null;
  if (!user) return { ok: false, error: "authenticated_admin_required" };

  const config = tool?.handler_config || {};
  const operation = String(config.operation || "").toLowerCase();

  if (tool?.handler_key === "growth") {
    const path = resolvePath(config, params);
    if (!path || path.includes("{")) {
      return { ok: false, error: "tool_path_parameters_missing", tool_key: tool?.tool_key };
    }
    const cleanParams = { ...params };
    delete cleanParams.campaign_id;
    const { request, url } = jsonRequest(path, config.method || "GET", cleanParams);
    return responsePayload(await handleGrowthApi(request, env, url, user));
  }

  if (tool?.handler_key === "mail") {
    switch (operation) {
      case "mailbox.list":
        return responsePayload(await getMailMailboxes(env, user));

      case "message.list": {
        const { url } = jsonRequest("/api/admin/mail/messages", "GET", params);
        return responsePayload(await listMailMessages(env, url, user));
      }

      case "email.send": {
        const { request } = jsonRequest("/api/admin/mail/send", "POST", params);
        return responsePayload(await sendMailPreview(request, env, user));
      }

      case "provider.status":
        return responsePayload(await getResendStatus(env));

      default:
        return {
          ok: false,
          error: "mail_operation_not_implemented",
          operation,
          tool_key: tool?.tool_key,
        };
    }
  }

  return {
    ok: false,
    error: "admin_app_handler_not_implemented",
    handler_key: tool?.handler_key || null,
    tool_key: tool?.tool_key,
  };
}
