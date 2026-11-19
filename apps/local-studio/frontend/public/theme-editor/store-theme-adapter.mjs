function humanize(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function fieldType(path, value) {
  const leaf = String(path.split(".").at(-1) || "").toLowerCase();
  const full = path.toLowerCase();
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (/href$|url$/.test(leaf) && !/media|image|video/.test(full)) return "link";
  if (/video/.test(full) && /key$|url$|src$|media/.test(leaf)) return "video";
  if (/(media|image|poster|before|after)/.test(full) && /(key|url|src|media|image|poster|before|after)$/.test(leaf)) return "media";
  if (/body|description|caption|quote|answer|intro|copy|note/.test(leaf) || String(value ?? "").length > 110) return "textarea";
  return "text";
}

function collectFields(value, prefix = "", out = [], depth = 0) {
  if (depth > 5 || value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFields(item, prefix ? `${prefix}.${index}` : String(index), out, depth + 1));
    return out;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("__")) continue;
      collectFields(child, prefix ? `${prefix}.${key}` : key, out, depth + 1);
    }
    return out;
  }
  if (!prefix) return out;
  out.push({
    key: prefix,
    label: humanize(prefix.split(".").filter((part) => !/^\d+$/.test(part)).slice(-2).join(" ")),
    type: fieldType(prefix, value),
  });
  return out;
}

function schemaForSection(section) {
  return {
    key: section.key,
    label: section.name || humanize(section.preset || section.type || section.key),
    fields: collectFields(section.content || {}),
    settings: [
      {
        key: "__layout.width",
        label: "Content width",
        type: "select",
        group: "Layout",
        options: ["full", "max", "wide", "content", "reading"].map((value) => ({ value, label: humanize(value) })),
      },
      {
        key: "__layout.bleed",
        label: "Bleed",
        type: "select",
        group: "Layout",
        options: ["none", "background", "media"].map((value) => ({ value, label: humanize(value) })),
      },
      {
        key: "__layout.spacing.block",
        label: "Section spacing",
        type: "select",
        group: "Spacing",
        options: ["none", "sm", "md", "lg"].map((value) => ({ value, label: humanize(value) })),
      },
    ],
    blocks: [],
    capabilities: {
      reorder: false,
      duplicate: false,
      remove: false,
      visibility: false,
    },
  };
}

async function responseJson(response) {
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data || {};
}

export function createStoreThemeWorkspaceAdapter(options = {}) {
  const theme = String(options.theme || "revise");
  const versions = new Map();
  const pageCache = new Map();
  const base = `/api/admin/store/themes/${encodeURIComponent(theme)}`;

  async function listPages() {
    const data = await responseJson(await fetch(`${base}/pages`, { credentials: "include" }));
    return data.pages || [];
  }

  async function getPage(slug) {
    const data = await responseJson(await fetch(`${base}/pages/${encodeURIComponent(slug)}`, { credentials: "include" }));
    const page = data.page;
    if (page) {
      versions.set(slug, Number(page.version || 1));
      pageCache.set(slug, structuredClone(page));
    }
    return page;
  }

  return {
    capabilities: {
      publish: false,
      structure: false,
      media: true,
      layout: true,
    },

    async getRegistry() {
      const pageRefs = await listPages();
      const loaded = await Promise.all(pageRefs.map((page) => getPage(page.slug)));
      const pages = {};
      loaded.filter(Boolean).forEach((page) => {
        pages[page.slug] = {
          title: page.title,
          route: page.route,
          sections: Object.fromEntries((page.sections || []).map((section) => [section.key, schemaForSection(section)])),
        };
      });
      return { pages };
    },

    listPages,
    getPage,

    async getThemeIdentity() {
      try {
        const data = await responseJson(await fetch(`${base}`, { credentials: "include" }));
        const themeRecord = data.theme || data;
        if (themeRecord && (themeRecord.name || themeRecord.state || themeRecord.status)) {
          return {
            name: themeRecord.name || theme,
            status: themeRecord.state || themeRecord.status || "",
          };
        }
      } catch {}
      const store = await responseJson(await fetch("/api/admin/store", { credentials: "include" }));
      const active = store.active_theme || null;
      return {
        name: active?.name || theme,
        status: active?.state || active?.status || "",
      };
    },


    async saveDraft(slug, sectionKey, content) {
      const currentVersion = versions.get(slug) || 1;
      const data = await responseJson(await fetch(`${base}/pages/${encodeURIComponent(slug)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_version: currentVersion,
          sections: [{ key: sectionKey, content }],
        }),
      }));
      const page = data.page;
      if (page) {
        versions.set(slug, Number(page.version || currentVersion + 1));
        pageCache.set(slug, structuredClone(page));
      }
      return {
        version: page?.version || currentVersion + 1,
        updated_at: page?.updated_at || null,
      };
    },

    async setSectionVisibility(slug, sectionKey, enabled) {
      const page = pageCache.get(slug) || await getPage(slug);
      const section = page?.sections?.find((item) => item.key === sectionKey);
      if (!section) throw new Error("theme_section_not_found");
      section.content ||= {};
      section.content.__editor ||= { templateKey: section.preset || section.type || section.key, blocks: [] };
      section.content.__editor.visibility = { enabled: Boolean(enabled) };
      const currentVersion = versions.get(slug) || Number(page.version || 1);
      const data = await responseJson(await fetch(`${base}/pages/${encodeURIComponent(slug)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_version: currentVersion,
          sections: [{ key: sectionKey, content: section.content }],
        }),
      }));
      if (data.page) {
        versions.set(slug, Number(data.page.version || currentVersion + 1));
        pageCache.set(slug, structuredClone(data.page));
      }
      return {};
    },

    async resolvePreview(slug, draft) {
      const response = await fetch(`${base}/preview?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "text/html" },
        body: JSON.stringify({
          sections: (draft?.sections || []).map((section) => ({ key: section.key, content: section.content })),
        }),
      });
      if (!response.ok) throw new Error((await response.text()) || `Preview failed (${response.status})`);
      return { html: await response.text() };
    },

    async uploadMedia(files) {
      const form = new FormData();
      [...(files || [])].forEach((file) => form.append("files", file));
      form.append("prefix", "uploads/theme-editor/");
      const data = await responseJson(await fetch("/api/admin/media", {
        method: "POST",
        credentials: "include",
        body: form,
      }));
      return data.assets || [];
    },

    async listMedia() {
      const data = await responseJson(await fetch("/api/admin/media?view=all", { credentials: "include" }));
      return data.assets || [];
    },
  };
}
