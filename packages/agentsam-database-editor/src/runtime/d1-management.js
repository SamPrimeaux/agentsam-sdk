/**
 * D1 resource management. Hosts resolve the authenticated account and token;
 * this module never reads deployment credentials or guesses resource identity.
 */
export async function d1Request(
  token,
  accountId,
  path = "",
  init = {},
  fetchImpl = fetch,
) {
  if (!token || !/^[a-f0-9]{32}$/i.test(accountId || ""))
    throw new Error("cloudflare_account_authorization_required");
  const response = await fetchImpl(
    "https://api.cloudflare.com/client/v4/accounts/" +
      encodeURIComponent(accountId) +
      "/d1/database" +
      path,
    {
      ...init,
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        ...init.headers,
      },
    },
  );
  const body = await response.json();
  if (!response.ok || body.success === false) {
    const error = new Error(
      body.errors?.[0]?.message ||
        "Cloudflare D1 request failed (" + response.status + ")",
    );
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function listD1Resources(options) {
  const rows = [];
  for (let page = 1; ; page++) {
    const body = await d1Request(
      options.token,
      options.accountId,
      "?per_page=100&page=" + page,
      {},
      options.fetchImpl,
    );
    const batch = body.result || [];
    rows.push(...batch);
    const info = body.result_info;
    if (
      info?.total_pages != null ? page >= info.total_pages : batch.length < 100
    )
      break;
    if (page > 10000) throw new Error("d1_inventory_pagination_limit");
  }
  return rows;
}

export async function manageD1Resource(options) {
  const {
    token,
    accountId,
    action,
    input = {},
    source,
    fetchImpl = fetch,
  } = options;
  const mutating = ["create", "delete", "configure", "restore"].includes(
    action,
  );
  if (mutating && options.writable !== true)
    throw new Error("d1_write_permission_required");
  if (action === "create") {
    if (!String(input.name || "").trim())
      throw new Error("database_name_required");
    const body = { name: input.name.trim() };
    if (input.primary_location_hint) {
      if (
        !["wnam", "enam", "weur", "eeur", "apac", "oc"].includes(
          input.primary_location_hint,
        )
      )
        throw new Error("invalid_location_hint");
      body.primary_location_hint = input.primary_location_hint;
    }
    if (input.jurisdiction) {
      if (!["eu", "us", "fedramp"].includes(input.jurisdiction))
        throw new Error("invalid_jurisdiction");
      body.jurisdiction = input.jurisdiction;
    }
    return (
      await d1Request(
        token,
        accountId,
        "",
        { method: "POST", body: JSON.stringify(body) },
        fetchImpl,
      )
    ).result;
  }
  const id = source?.database_id;
  if (!/^[a-f0-9-]{36}$/i.test(id || "") || source.account_id !== accountId)
    throw new Error("d1_resource_identity_required");
  const path = "/" + encodeURIComponent(id);
  if (action === "details")
    return (await d1Request(token, accountId, path, {}, fetchImpl)).result;
  if (action === "configure") {
    if (!["auto", "disabled"].includes(input.replication))
      throw new Error("invalid_replication_mode");
    return (
      await d1Request(
        token,
        accountId,
        path,
        {
          method: "PATCH",
          body: JSON.stringify({
            read_replication: { mode: input.replication },
          }),
        },
        fetchImpl,
      )
    ).result;
  }
  if (action === "delete" || action === "restore") {
    if (
      input.confirm_name !== source.label ||
      input.destructive_confirmed !== true
    )
      throw new Error("exact_database_name_confirmation_required");
  }
  if (action === "delete")
    return (
      await d1Request(token, accountId, path, { method: "DELETE" }, fetchImpl)
    ).result;
  if (action === "bookmark" || action === "restore") {
    const query = new URLSearchParams();
    if (input.timestamp) {
      const date = new Date(input.timestamp);
      if (!Number.isFinite(date.getTime()) || date > new Date())
        throw new Error("invalid_restore_timestamp");
      query.set("timestamp", date.toISOString());
    }
    if (input.bookmark) query.set("bookmark", input.bookmark);
    if (action === "restore" && !query.size)
      throw new Error("restore_point_required");
    return (
      await d1Request(
        token,
        accountId,
        path +
          "/time_travel/" +
          (action === "restore" ? "restore" : "bookmark") +
          (query.size ? "?" + query : ""),
        { method: action === "restore" ? "POST" : "GET" },
        fetchImpl,
      )
    ).result;
  }
  throw new Error("database_management_action_unsupported");
}
