import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CAD_DOCKER_PORT = 8793;
export const DEFAULT_CAD_DOCKER_URL = `http://127.0.0.1:${DEFAULT_CAD_DOCKER_PORT}`;

function isFile(value) {
  try {
    return Boolean(value) && fs.existsSync(value) && fs.statSync(value).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves the Docker CAD service URL and authentication token.
 * Searches environment variables and local configuration token files.
 */
export function resolveDockerServiceConfig(options = {}) {
  const env = options.env || process.env;
  const rawUrl = String(
    options.serviceUrl ||
    env.AGENTSAM_CAD_SERVICE_URL ||
    DEFAULT_CAD_DOCKER_URL
  ).trim();
  const url = rawUrl.replace(/\/+$/, '');

  let token = String(
    options.token ||
    env.AGENTSAM_CAD_TOKEN ||
    ''
  ).trim();

  if (!token) {
    const cwd = options.cwd || process.cwd();
    const candidates = [
      path.join(cwd, '.agentsam/docker/cad/agentsam-cad/service.token'),
      path.join(os.homedir(), '.agentsam/docker/cad/agentsam-cad/service.token'),
      path.join(cwd, '.agentsam/docker/cad/service.token'),
      path.join(os.homedir(), '.agentsam/docker/cad/service.token'),
    ];

    for (const candidate of candidates) {
      if (isFile(candidate)) {
        try {
          const contents = fs.readFileSync(candidate, 'utf8').trim();
          if (contents) {
            token = contents;
            break;
          }
        } catch {}
      }
    }
  }

  return {
    url,
    token: token || null,
  };
}

/**
 * Quickly checks if the CAD Docker container service is running and healthy.
 */
export async function probeDockerServiceHealth(options = {}) {
  const { url, token } = resolveDockerServiceConfig(options);
  const fetchFn = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 2500;

  if (typeof fetchFn !== 'function') {
    return {
      available: false,
      url,
      error: 'fetch is not available in runtime',
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetchFn(`${url}/healthz`, {
      method: 'GET',
      headers,
      signal: controller?.signal,
    });

    if (timer) clearTimeout(timer);

    if (!res.ok) {
      return {
        available: false,
        url,
        status: `http_${res.status}`,
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    return {
      available: Boolean(data?.ok),
      url,
      service: data?.service || 'agentsam-cad',
      version: data?.version || null,
      tools: data?.tools || {},
      endpoints: data?.endpoints || {},
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    return {
      available: false,
      url,
      error: err?.message || 'Connection refused',
    };
  }
}

/**
 * Compiles OpenSCAD script using the containerized Docker CAD service.
 */
export async function executeOpenScadDocker(options = {}) {
  const { url, token } = resolveDockerServiceConfig(options);
  const fetchFn = options.fetchImpl || globalThis.fetch;
  const startTime = Date.now();
  const format = String(options.outputFormat || options.format || 'stl').toLowerCase().replace(/^\./, '');
  const filename = options.filename || `model.${format}`;
  const timeoutMs = options.timeoutMs || 30_000;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetchFn(`${url}/v1/openscad/compile`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: options.source,
        format,
        parameters: options.parameters || {},
        filename,
        timeout_seconds: Math.ceil(timeoutMs / 1000),
      }),
      signal: controller?.signal,
    });

    if (timer) clearTimeout(timer);

    const body = await res.json();
    if (!res.ok || !body?.ok) {
      throw new Error(body?.error || `Docker OpenSCAD compilation failed with HTTP ${res.status}`);
    }

    const durationMs = Date.now() - startTime;
    const base64Data = body.artifact_base64 || '';
    const buffer = Buffer.from(base64Data, 'base64');
    const isText = format === 'stl' || format === 'dxf' || format === 'svg' || format === 'scad' || format === 'csg';
    const artifactContent = isText ? buffer.toString('utf8') : base64Data;

    const mimeType =
      format === 'stl'
        ? 'model/stl'
        : format === 'dxf'
          ? 'image/vnd.dxf'
          : format === 'svg'
            ? 'image/svg+xml'
            : format === '3mf'
              ? 'model/3mf'
              : 'text/plain';

    return {
      success: true,
      engine: 'openscad-docker',
      artifactContent,
      artifactBase64: base64Data,
      mimeType,
      filename: body.filename || filename,
      outputFormat: format,
      sizeBytes: body.size_bytes || buffer.length,
      sha256: body.sha256 || null,
      durationMs,
      executionTimeMs: durationMs,
      logs: [
        `[KERNEL] AgentSam CAD Docker Service (${url})`,
        `[CONTAINER] Executed in isolated read-only debian container`,
        ...(body.logs ? String(body.logs).split(/\r?\n/).filter(Boolean) : []),
      ],
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}

/**
 * Builds precision solid geometry using FreeCAD OpenCASCADE kernel inside Docker.
 */
export async function executeFreeCadDocker(options = {}) {
  const { url, token } = resolveDockerServiceConfig(options);
  const fetchFn = options.fetchImpl || globalThis.fetch;
  const startTime = Date.now();
  const format = String(options.format || 'step').toLowerCase().replace(/^\./, '');
  const filename = options.filename || `model.${format}`;
  const timeoutMs = options.timeoutMs || 35_000;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetchFn(`${url}/v1/freecad/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operations: options.operations || options.recipe?.operations || [],
        recipe: options.recipe,
        format,
        filename,
        timeout_seconds: Math.ceil(timeoutMs / 1000),
      }),
      signal: controller?.signal,
    });

    if (timer) clearTimeout(timer);

    const body = await res.json();
    if (!res.ok || !body?.ok) {
      throw new Error(body?.error || `Docker FreeCAD execution failed with HTTP ${res.status}`);
    }

    const durationMs = Date.now() - startTime;
    const base64Data = body.artifact_base64 || '';
    const buffer = Buffer.from(base64Data, 'base64');

    return {
      ok: true,
      success: true,
      capability: 'freecad.build',
      engine: 'freecad-docker',
      format: body.format || format,
      filename: body.filename || filename,
      sizeBytes: body.size_bytes || buffer.length,
      sha256: body.sha256 || null,
      artifactBase64: base64Data,
      artifactText: format === 'step' || format === 'stp' || format === 'brep' ? buffer.toString('utf8') : undefined,
      metrics: body.metrics || {},
      durationMs,
      logs: [
        `[KERNEL] AgentSam CAD Docker Service (${url})`,
        `[CONTAINER] FreeCAD OpenCASCADE kernel execution`,
        ...(body.logs ? String(body.logs).split(/\r?\n/).filter(Boolean) : []),
      ],
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}

/**
 * Builds or renders 3D scenes using Blender inside Docker.
 */
export async function executeBlenderDocker(options = {}) {
  const { url, token } = resolveDockerServiceConfig(options);
  const fetchFn = options.fetchImpl || globalThis.fetch;
  const startTime = Date.now();
  const format = String(options.format || 'glb').toLowerCase().replace(/^\./, '');
  const operation = options.operation || 'build';
  const filename = options.filename || `model.${format}`;
  const timeoutMs = options.timeoutMs || 45_000;

  // Full operation-specific request (recipe for build; scene/camera/width/height
  // for render_preview; format/objects/collection/apply_modifiers for export;
  // {} for inspect) — falls back to the legacy recipe/operations-only shape
  // for callers that haven't been updated.
  const requestPayload = options.request
    || (options.recipe ? { recipe: options.recipe }
      : (options.operations ? { recipe: { schema_version: 1, operations: options.operations } } : {}));

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetchFn(`${url}/v1/blender/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operation,
        request: { format, ...requestPayload },
        // Base64 bytes of the source .blend when this operation edits an
        // existing file (inspect/render_preview/export/edit-build); the
        // container has no access to the caller's local filesystem.
        input_base64: options.inputBase64 || null,
        filename,
        timeout_seconds: Math.ceil(timeoutMs / 1000),
      }),
      signal: controller?.signal,
    });

    if (timer) clearTimeout(timer);

    const body = await res.json();
    if (!res.ok || !body?.ok) {
      throw new Error(body?.error || `Docker Blender execution failed with HTTP ${res.status}`);
    }

    const durationMs = Date.now() - startTime;
    const base64Data = body.artifact_base64 || '';
    const buffer = Buffer.from(base64Data, 'base64');

    return {
      ok: true,
      success: true,
      capability: `blender.${operation}`,
      engine: 'blender-docker',
      operation,
      format: body.format || format,
      filename: body.filename || filename,
      sizeBytes: body.size_bytes || buffer.length,
      sha256: body.sha256 || null,
      artifactBase64: base64Data,
      result: body.result || {},
      durationMs,
      logs: [
        `[KERNEL] AgentSam CAD Docker Service (${url})`,
        `[CONTAINER] Blender headless engine execution`,
        ...(body.logs ? String(body.logs).split(/\r?\n/).filter(Boolean) : []),
      ],
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}
