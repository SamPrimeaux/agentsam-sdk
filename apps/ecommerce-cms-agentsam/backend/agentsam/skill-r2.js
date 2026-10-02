/**
 * Load agentsam_skill bodies from R2 (WEBSITE_ASSETS / agentsam/skills/…).
 * D1 holds registry metadata only when retrieval_strategy = 'r2'.
 */

const R2_PREFIX = "agentsam/skills";

function parseMetadata(row) {
  try {
    const raw = row?.metadata_json;
    if (!raw) return {};
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function normalizeR2Key(path) {
  const fp = String(path || "")
    .trim()
    .replace(/^\/+/, "");
  if (!fp) return "";
  if (fp.startsWith(`${R2_PREFIX}/`)) return fp;
  if (fp.startsWith("skills/")) return `agentsam/${fp}`;
  return `${R2_PREFIX}/${fp}`;
}

export function skillMainR2Key(row) {
  const meta = parseMetadata(row);
  const fromMeta = meta.r2_skill_key || meta.r2_key;
  if (fromMeta) return normalizeR2Key(fromMeta);
  return normalizeR2Key(row?.file_path);
}

export function skillFileR2Key(filePath) {
  return normalizeR2Key(filePath);
}

async function readR2Text(env, key) {
  const binding = env.WEBSITE_ASSETS;
  if (!binding?.get || !key) return null;
  try {
    const obj = await binding.get(key);
    if (!obj) return null;
    const text = await obj.text();
    return text?.trim() ? text : null;
  } catch (err) {
    console.warn("[agentsam-skill-r2] fetch failed", key, err?.message ?? err);
    return null;
  }
}

/**
 * @param {object} env
 * @param {object} row agentsam_skill row
 * @returns {Promise<object>} row with content_markdown when available
 */
export async function hydrateSkillRowFromR2(env, row) {
  if (!row) return row;
  const strategy = String(row.retrieval_strategy || "db").toLowerCase();
  if (strategy === "none") return { ...row, content_markdown: "" };
  if (strategy === "db") {
    return { ...row, content_markdown: row.content_markdown || "" };
  }

  const key = skillMainR2Key(row);
  const text = key ? await readR2Text(env, key) : null;
  return { ...row, content_markdown: text || "" };
}

/**
 * @param {object} env
 * @param {object} row
 * @param {object[]} files agentsam_skill_file rows
 */
export async function hydrateSkillWithFiles(env, row, files = []) {
  const hydrated = await hydrateSkillRowFromR2(env, row);
  if (!files.length) return hydrated;

  const referenceBlocks = [];
  for (const file of files) {
    if (file.role === "readme") continue;
    const key = skillFileR2Key(file.file_path);
    const text = await readR2Text(env, key);
    if (text) {
      referenceBlocks.push(`### ${file.file_path}\n\n${text}`);
    }
  }

  if (referenceBlocks.length) {
    hydrated.reference_markdown = referenceBlocks.join("\n\n---\n\n");
  }
  return hydrated;
}

/**
 * @param {object} env
 * @param {object[]} rows
 */
export async function hydrateSkillsFromR2(env, rows) {
  if (!rows?.length) return rows || [];
  return Promise.all(rows.map((row) => hydrateSkillRowFromR2(env, row)));
}
