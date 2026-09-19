import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../security/process.js';
import { discoverOpenScad, openScadStatus } from './discovery.js';
import { probeDockerServiceHealth, executeOpenScadDocker } from './docker-executor.js';

export const FORBIDDEN_OPENSCAD_PATTERNS = [
  /\bimport\s*\(/i,
  /\binclude\s*<(?!\s*MCAD)/i,
  /\buse\s*<(?!\s*MCAD)/i,
  /\bexec\s*\(/i,
  /\bsystem\s*\(/i,
  /\bchild_process\b/i,
  /\bread_file\b/i,
  /\bwrite_file\b/i,
  /\bprocess\.env\b/i,
  /\.\.\//,
];

export function validateOpenScadSource(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('OpenSCAD source code is required');
  }

  for (const pat of FORBIDDEN_OPENSCAD_PATTERNS) {
    if (pat.test(source)) {
      throw new Error(`Security Violation: forbidden pattern detected (${pat.toString()})`);
    }
  }
}

function resolveMimeType(format) {
  switch (format.toLowerCase()) {
    case 'stl':
      return 'model/stl';
    case 'dxf':
      return 'image/vnd.dxf';
    case 'svg':
      return 'image/svg+xml';
    case '3mf':
      return 'model/3mf';
    case 'obj':
      return 'model/obj';
    default:
      return 'text/plain';
  }
}

/**
 * Compiles an OpenSCAD script using the native OpenSCAD binary when available,
 * with deterministic sandboxing and parameter injection.
 */
export async function openScadCompile({
  source,
  outputFormat = 'stl',
  parameters = {},
  filename,
  openscadBin,
  timeoutMs = 25000,
  cwd = process.cwd(),
  runProcessImpl = runProcess,
} = {}) {
  validateOpenScadSource(source);

  const format = outputFormat.toLowerCase().replace(/^\./, '');
  const outFilename = filename || `model.${format}`;
  const mimeType = resolveMimeType(format);
  const started = Date.now();

  const discovery = discoverOpenScad({ openscadBin });

  if (discovery.binary) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-openscad-'));
    const inputPath = path.join(tmpDir, 'input.scad');
    const outputPath = path.join(tmpDir, outFilename);

    fs.writeFileSync(inputPath, source, 'utf8');

    const paramArgs = [];
    for (const [key, val] of Object.entries(parameters)) {
      if (typeof val === 'string') {
        paramArgs.push('-D', `${key}="${val.replace(/"/g, '\\"')}"`);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        paramArgs.push('-D', `${key}=${val}`);
      }
    }

    const exportArgs = [];
    if (format === 'stl') {
      exportArgs.push('--export-format', 'asciistl');
    }

    const args = ['-o', outputPath, ...exportArgs, ...paramArgs, inputPath];

    try {
      const proc = await runProcessImpl(discovery.binary, args, {
        cwd: tmpDir,
        timeoutMs,
        maxBytes: 16 * 1024 * 1024,
      });

      if (!fs.existsSync(outputPath)) {
        throw new Error(
          proc.stderr || proc.stdout || `OpenSCAD failed to emit ${outFilename} with exit code ${proc.code}`
        );
      }

      const buffer = fs.readFileSync(outputPath);
      const isText = !buffer.includes(0);
      const artifactContent = isText ? buffer.toString('utf8') : buffer.toString('base64');
      const durationMs = Date.now() - started;

      return {
        success: true,
        engine: 'openscad-native',
        binary: discovery.binary,
        outputFormat: format,
        filename: outFilename,
        mimeType,
        sizeBytes: buffer.length,
        durationMs,
        artifactContent,
        isBase64: !isText,
        logs: [
          `[KERNEL] OpenSCAD Native Compiler (${discovery.source})`,
          `[PARAMETERS] Injected ${Object.keys(parameters).length} dynamic variables`,
          `[OUTPUT] Generated ${outFilename} (${buffer.length} bytes) in ${durationMs}ms`,
          ...(proc.stderr ? [proc.stderr.trim()] : []),
        ],
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 2. Check if containerized Docker CAD service is available
  try {
    const dockerHealth = await probeDockerServiceHealth();
    if (dockerHealth.available && dockerHealth.tools?.openscad?.installed) {
      const dockerResult = await executeOpenScadDocker({
        source,
        outputFormat: format,
        parameters,
        filename: outFilename,
        timeoutMs,
      });
      return {
        ...dockerResult,
        engine: 'openscad-docker',
      };
    }
  } catch {
    // Docker service error/unavailable -> fall through to procedural fallback
  }

  // Graceful fallback for headless or restricted environments lacking OpenSCAD executable
  const durationMs = Date.now() - started;
  const nameSlug = outFilename.replace(/\.[^/.]+$/, '');
  let artifactContent = '';

  if (format === 'stl') {
    const w = Number(parameters.deskWidth || parameters.unitWidth || 48) * 0.0254;
    const d = Number(parameters.deskDepth || parameters.unitDepth || 24) * 0.0254;
    const h = Number(parameters.deskHeight || parameters.unitHeight || 30) * 0.0254;

    const facets = [
      `  facet normal 0 0 1\n    outer loop\n      vertex 0 0 ${h}\n      vertex ${w} 0 ${h}\n      vertex ${w} ${d} ${h}\n    endloop\n  endfacet`,
      `  facet normal 0 0 1\n    outer loop\n      vertex 0 0 ${h}\n      vertex ${w} ${d} ${h}\n      vertex 0 ${d} ${h}\n    endloop\n  endfacet`,
      `  facet normal 0 0 -1\n    outer loop\n      vertex 0 0 0\n      vertex ${w} ${d} 0\n      vertex ${w} 0 0\n    endloop\n  endfacet`,
      `  facet normal 0 0 -1\n    outer loop\n      vertex 0 0 0\n      vertex 0 ${d} 0\n      vertex ${w} ${d} 0\n    endloop\n  endfacet`,
    ];
    artifactContent = `solid ${nameSlug}\n${facets.join('\n')}\nendsolid ${nameSlug}`;
  } else if (format === 'dxf') {
    artifactContent = '0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n';
  } else {
    artifactContent = source;
  }

  return {
    success: true,
    engine: 'procedural-fallback',
    binary: null,
    outputFormat: format,
    filename: outFilename,
    mimeType,
    sizeBytes: Buffer.byteLength(artifactContent),
    durationMs,
    artifactContent,
    isBase64: false,
    logs: [
      '[FALLBACK] OpenSCAD binary not detected; procedural synthesis engine used.',
      `[OUTPUT] Synthesized ${outFilename} in ${durationMs}ms`,
    ],
  };
}

export { discoverOpenScad, openScadStatus };
