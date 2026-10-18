import { createHash, randomUUID } from "node:crypto";
import { lintGeneratedBlock, nsForms, resolveUidToken } from "../../frontend/static/js/generation-namespace.mjs";

const TABLES = {
  artifacts: "cms_artifacts",
  blocks: "cms_section_blocks",
  revisions: "cms_revisions",
  sections: "cms_page_sections",
};

function hashManifest(manifest) {
  return createHash("sha256").update(JSON.stringify(manifest || {})).digest("hex");
}

function selection(manifest) {
  const generation = (manifest && manifest.generation) || {};
  return {
    capability: generation.capability || "code.generate",
    provider: generation.provider || "",
    model: generation.model || "",
    namespace: "agentsam",
  };
}

export function createSqlStore(db) {
  return {
    async first(sql, params = []) { return db.prepare(sql).get(...params) || null; },
    async all(sql, params = []) { return db.prepare(sql).all(...params); },
    async run(sql, params = []) { return db.prepare(sql).run(...params); },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(db.prepare(statement.sql).run(...(statement.params || [])));
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}


export function createD1Store(db) {
  return {
    async first(sql, params = []) { return db.prepare(sql).bind(...params).first(); },
    async all(sql, params = []) { const result = await db.prepare(sql).bind(...params).all(); return result.results || []; },
    async run(sql, params = []) { return db.prepare(sql).bind(...params).run(); },
    async batch(statements) {
      return db.batch(statements.map((statement) => db.prepare(statement.sql).bind(...(statement.params || []))));
    },
  };
}
export function createMemoryObjectStore() {
  const objects = new Map();
  return {
    objects,
    failNext: false,
    async put(key, body) {
      if (this.failNext) {
        this.failNext = false;
        throw new Error("object store failed");
      }
      objects.set(key, body);
      return { key };
    },
    async get(key) { return objects.get(key) || null; },
  };
}

export async function ensureBlockTree(sql) {
  const info = await sql.all("PRAGMA table_info(" + TABLES.blocks + ")");
  const names = new Set(info.map((row) => row.name));
  if (!names.has("parent_block_id")) await sql.run("ALTER TABLE " + TABLES.blocks + " ADD COLUMN parent_block_id TEXT");
  if (!names.has("artifact_id")) await sql.run("ALTER TABLE " + TABLES.blocks + " ADD COLUMN artifact_id TEXT");
  return { skipped: names.has("parent_block_id") && names.has("artifact_id") };
}

export function createGeneratedBlockRepository(sql, objects, options = {}) {
  const DEFAULT_MAX_DEPTH = 2;
  const maxDepth = (manifest) => {
    const configured = manifest && manifest.cms && manifest.cms.blocks && manifest.cms.blocks.maxDepth;
    const value = Number(configured == null ? DEFAULT_MAX_DEPTH : configured);
    return Number.isFinite(value) ? value : DEFAULT_MAX_DEPTH;
  };
  async function blockRow(accountId, blockId) {
    return sql.first("SELECT * FROM " + TABLES.blocks + " WHERE account_id = ? AND id = ?", [accountId, blockId]);
  }
  async function assertAccount(accountId, sectionId, parentId) {
    const section = await sql.first("SELECT id, account_id FROM " + TABLES.sections + " WHERE id = ?", [sectionId]);
    if (!section || section.account_id !== accountId) return { ok: false, status: 403, error: "cross-account refused" };
    if (parentId) {
      const parent = await blockRow(accountId, parentId);
      if (!parent || parent.section_id !== sectionId) throw Object.assign(new Error("parent refused"), { status: 403 });
    }
  }
  async function depthOf(accountId, parentId) {
    let depth = 1;
    let current = parentId;
    const seen = new Set();
    while (current) {
      if (seen.has(current)) throw Object.assign(new Error("cycle refused"), { status: 409 });
      seen.add(current);
      depth += 1;
      const row = await blockRow(accountId, current);
      current = row && row.parent_block_id;
    }
    return depth;
  }
  return {
    async saveGenerated(input) {
      const picked = selection(input.manifest);
      const canonical = input.manifest && input.manifest.canonical;
      const definition = input.manifest && input.manifest.definition;
      const semanticType = String(
        (definition && definition.type) || input.blockType || input.blockKey || input.blockId || "generated-block"
      ).trim();
      if (!/^[a-z][a-z0-9-]{1,63}$/.test(semanticType)) {
        return { ok: false, status: 422, error: "invalid generated semantic type", written: false };
      }
      const account = await assertAccount(input.accountId, input.sectionId, input.parentBlockId);
      if (account && account.ok === false) return account;
      const blockKey=String(input.blockKey || input.instanceId || input.blockId || semanticType);
      const prior=await sql.first("SELECT id FROM " + TABLES.blocks + " WHERE account_id = ? AND section_id = ? AND block_key = ?",
        [input.accountId, input.sectionId, blockKey]);
      const blockId=prior?.id || input.instanceId || input.blockId || ("cmsb_" + randomUUID().replace(/-/g, "").slice(0, 16));
      const owner=await blockRow(input.accountId,blockId);
      if(owner && (owner.section_id!==input.sectionId || owner.block_key!==blockKey))return {ok:false,status:409,error:"placed block instance belongs to another section"};
      const stableCanonical=canonical && {...canonical};
      // Convert historical block_key wrappers once; canonical artifact remains
      // reusable as __UID__ even when placed repeatedly across sections.
      if(stableCanonical){
        const from='data-agentsam-block="'+blockKey+'"';
        if(stableCanonical.html?.includes(from)){
          stableCanonical.html=stableCanonical.html.replaceAll(from,'data-agentsam-block="__UID__"');
          stableCanonical.css=String(stableCanonical.css||'').replaceAll(from,'data-agentsam-block="__UID__"');
        }
        const forms=nsForms(blockId,"agentsam");
        const wrapper='data-agentsam-block="__UID__"';
        const placed='data-agentsam-block="'+forms.blockId+'"';
        const resolved={
          html:resolveUidToken(String(stableCanonical.html||'').replaceAll(wrapper,placed),blockId,"agentsam"),
          css:resolveUidToken(String(stableCanonical.css||'').replaceAll(wrapper,placed),blockId,"agentsam"),
          js:resolveUidToken(stableCanonical.js||'',blockId,"agentsam"),
        };
        const lint=lintGeneratedBlock(resolved,forms);
        if(!lint.ok)return {ok:false,status:422,error:lint.violations.join('; '),written:false};
      }
      const depth = await depthOf(input.accountId, input.parentBlockId);
      if (depth > maxDepth(input.manifest)) return { ok: false, status: 422, error: "depth cap" };
      const digest = hashManifest(stableCanonical || input.manifest);
      const hash16 = digest.slice(0, 16);
      const key = "cms/artifacts/block/" + hash16 + "/manifest.json";
      await objects.put(key, JSON.stringify(stableCanonical || input.manifest));
      const supplied = input.provenance || {};
      const promptHash = supplied.prompt_hash || supplied.promptHash || digest.slice(0, 8);
      const createdAt = supplied.created_at || supplied.createdAt || new Date().toISOString();
      const provenance = {
        generator: supplied.generator || "agentsam",
        namespace: "agentsam",
        generation_id: supplied.generation_id || supplied.generationId || "",
        source_agent: supplied.source_agent || supplied.sourceAgent || "agentsam",
        capability: picked.capability,
        provider: supplied.provider || picked.provider,
        model: supplied.model || picked.model,
        prompt_hash: promptHash,
        source_ref: supplied.source_ref || supplied.sourceRef || "",
        normalized_by: supplied.normalized_by || supplied.normalizedBy || "agentsam.theme-authoring.v1",
        created_at: createdAt,
        // Compatibility aliases for older receipts/readers.
        promptHash,
        createdAt,
      };
      try {
        await sql.batch([
          { sql: "INSERT INTO " + TABLES.artifacts + " (id, account_id, artifact_key, artifact_type, version, r2_prefix, manifest_r2_key, content_hash, content_mode, status, source_kind, source_ref, metadata_json) VALUES (?, ?, ?, 'embed', '1', ?, ?, ?, 'component', 'ready', 'generator', ?, ?) ON CONFLICT(account_id, artifact_key, version) DO UPDATE SET manifest_r2_key = excluded.manifest_r2_key, content_hash = excluded.content_hash, source_ref = excluded.source_ref, metadata_json = excluded.metadata_json", params: ["cmsa_" + hash16, input.accountId, "block/" + hash16, "cms/artifacts/block/" + hash16 + "/", key, digest, picked.capability, JSON.stringify(provenance)] },
          { sql: "INSERT INTO " + TABLES.blocks + " (id, account_id, section_id, parent_block_id, block_key, block_type, sort_order, status, content_json, artifact_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?) ON CONFLICT(section_id, block_key) DO UPDATE SET block_type = excluded.block_type, content_json = excluded.content_json, artifact_id = excluded.artifact_id, metadata_json = excluded.metadata_json, parent_block_id = excluded.parent_block_id, updated_at = datetime('now')", params: [blockId, input.accountId, input.sectionId, input.parentBlockId || null, blockKey, semanticType, input.index || 0, JSON.stringify(input.settingsValues || {}), "cmsa_" + hash16, JSON.stringify({ generated: true, definition: definition || { type: semanticType }, provenance })] },
          { sql: "INSERT INTO " + TABLES.revisions + " (account_id, entity_type, entity_id, revision_number, revision_kind, content_hash, snapshot_json, metadata_json) SELECT ?, 'block', ?, COALESCE(MAX(revision_number), 0) + 1, 'draft', ?, ?, ? FROM " + TABLES.revisions + " WHERE account_id = ? AND entity_type = 'block' AND entity_id = ?", params: [input.accountId, blockId, digest, JSON.stringify({ artifactId: "cmsa_" + hash16, settings: input.settingsValues || {}, canonical: stableCanonical }), JSON.stringify(provenance), input.accountId, blockId] },
        ]);
      } catch (error) {
        return { ok: false, status: 500, error: error.message, orphan: key };
      }
      return { ok: true, blockId, instanceId:blockId, artifactId: "cmsa_" + hash16, key };
    },
    loadBlock(accountId, blockId) { return blockRow(accountId, blockId); },
    async loadBlockTree(accountId, sectionId) {
      const rows = await sql.all("SELECT * FROM " + TABLES.blocks + " WHERE account_id = ? AND section_id = ? ORDER BY sort_order, id", [accountId, sectionId]);
      return rows;
    },
    async moveBlock(accountId, blockId, newParentId, index) {
      const block = await blockRow(accountId, blockId);
      if (!block) return { ok: false, status: 404 };
      if (newParentId) {
        let current = newParentId;
        while (current) {
          if (current === blockId) return { ok: false, status: 409, error: "cycle refused" };
          const parent = await blockRow(accountId, current);
          if (!parent || parent.section_id !== block.section_id) return { ok: false, status: 403 };
          current = parent.parent_block_id;
        }
      }
      const depth = await depthOf(accountId, newParentId);
      if (depth > maxDepth(options.manifest)) return { ok: false, status: 422, error: "depth cap" };
      await sql.run("UPDATE " + TABLES.blocks + " SET parent_block_id = ?, sort_order = ? WHERE account_id = ? AND id = ?", [newParentId || null, index || 0, accountId, blockId]);
      return { ok: true };
    },
    writeRevision(accountId, entityType, entityId, snapshot) {
      return sql.run("INSERT INTO " + TABLES.revisions + " (account_id, entity_type, entity_id, revision_number, snapshot_json) SELECT ?, ?, ?, COALESCE(MAX(revision_number), 0) + 1, ? FROM " + TABLES.revisions + " WHERE account_id = ? AND entity_type = ? AND entity_id = ?", [accountId, entityType, entityId, JSON.stringify(snapshot), accountId, entityType, entityId]);
    },
    async listProvenance(accountId) {
      return sql.all("SELECT metadata_json FROM " + TABLES.artifacts + " WHERE account_id = ? AND source_kind = 'generator'", [accountId]);
    },
    async restoreRevision(accountId, blockId, revisionNumber) {
      const revision = await sql.first("SELECT snapshot_json FROM " + TABLES.revisions + " WHERE account_id = ? AND entity_type = 'block' AND entity_id = ? AND revision_number = ?", [accountId, blockId, revisionNumber]);
      if (!revision) return { ok: false, status: 404 };
      const snapshot = JSON.parse(revision.snapshot_json);
      await sql.run("UPDATE " + TABLES.blocks + " SET artifact_id = ?, content_json = ? WHERE account_id = ? AND id = ?", [snapshot.artifactId, JSON.stringify(snapshot.settings || {}), accountId, blockId]);
      return { ok: true, snapshot };
    },
    async saveSectionDraft(accountId, sectionId) {
      const tree = await this.loadBlockTree(accountId, sectionId);
      await this.writeRevision(accountId, "section", sectionId, { blocks: tree.map((row) => ({ id: row.id, parent_block_id: row.parent_block_id, sort_order: row.sort_order, content_json: row.content_json, artifact_id: row.artifact_id })) });
      return { ok: true };
    },
    async restoreSectionSnapshot(accountId, sectionId, revisionNumber) {
      const revision = await sql.first("SELECT snapshot_json FROM " + TABLES.revisions + " WHERE account_id = ? AND entity_type = 'section' AND entity_id = ? AND revision_number = ?", [accountId, sectionId, revisionNumber]);
      if (!revision) return { ok: false, status: 404 };
      const snapshot = JSON.parse(revision.snapshot_json);
      await sql.batch(snapshot.blocks.map((row) => ({ sql: "UPDATE " + TABLES.blocks + " SET parent_block_id = ?, sort_order = ?, content_json = ?, artifact_id = ? WHERE account_id = ? AND id = ?", params: [row.parent_block_id, row.sort_order, row.content_json, row.artifact_id, accountId, row.id] })));
      return { ok: true };
    },
    async releaseBuild(accountId, sectionId) {
      const rows = await this.loadBlockTree(accountId, sectionId);
      const output = [];
      for (const row of rows) {
        if (!row.artifact_id) continue;
        const artifact = await sql.first("SELECT manifest_r2_key FROM " + TABLES.artifacts + " WHERE id = ? AND account_id = ?", [row.artifact_id, accountId]);
        if (!artifact?.manifest_r2_key) return { ok: false, error: "artifact manifest missing" };
        const raw = await objects.get(artifact.manifest_r2_key);
        const canonical = JSON.parse(raw);
        const wrapper='data-agentsam-block="__UID__"';
        const placed='data-agentsam-block="'+nsForms(row.id).blockId+'"';
        const resolved = {
          html: resolveUidToken(String(canonical.html || "").replaceAll(wrapper,placed), row.id),
          css: resolveUidToken(String(canonical.css || "").replaceAll(wrapper,placed), row.id),
          js: resolveUidToken(canonical.js || "", row.id),
        };
        const lint = lintGeneratedBlock(resolved, nsForms(row.id));
        if (!lint.ok) return { ok: false, error: lint.violations.join("; ") };
        output.push(resolved);
      }
      const text = JSON.stringify(output);
      return { ok: !text.includes("__UID__"), output };
    },
  };
}
