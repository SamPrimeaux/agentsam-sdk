import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function loadSharp(injected) {
  if (injected) return injected;
  try {
    const mod = await import("sharp");
    return mod.default || mod;
  } catch (error) {
    const wrapped = new Error(
      "Raster-to-vector tracing requires the optional 'sharp' runtime dependency.",
    );
    wrapped.code = "sharp_unavailable";
    wrapped.cause = error;
    throw wrapped;
  }
}

async function commandAvailable(command) {
  try {
    await execFileAsync(command, ["--version"], { timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

export async function detectNodeTransformCapabilities() {
  let rasterNormalizer = false;
  let svgNormalizer = false;
  try {
    await import("sharp");
    rasterNormalizer = true;
  } catch {}
  try {
    await import("svgo");
    svgNormalizer = true;
  } catch {}

  const [potrace, vtracer, inkscape] = await Promise.all([
    commandAvailable("potrace"),
    commandAvailable("vtracer"),
    commandAvailable("inkscape"),
  ]);

  return Object.freeze({
    raster_normalizer: rasterNormalizer,
    format_converter: rasterNormalizer,
    vector_rasterizer: rasterNormalizer,
    vector_tracer: potrace || vtracer,
    svg_normalizer: svgNormalizer,
    vector_normalizer: svgNormalizer,
    text_outliner: inkscape,
    tools: Object.freeze({ potrace, vtracer, inkscape, svgo: svgNormalizer }),
  });
}

function occupancyIou(a, b) {
  const length = Math.min(a.length, b.length);
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < length; i += 1) {
    const left = a[i] < 128;
    const right = b[i] < 128;
    if (left && right) intersection += 1;
    if (left || right) union += 1;
  }
  return union === 0 ? 1 : intersection / union;
}

async function rasterMask(sharp, input, width, height, threshold) {
  const { data } = await sharp(input, { failOn: "warning" })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .threshold(threshold)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

export async function traceRasterToSvg(
  input,
  {
    tracer = "auto",
    threshold = 190,
    turdSize = 2,
    sharp: injectedSharp,
  } = {},
) {
  const sharp = await loadSharp(injectedSharp);
  const metadata = await sharp(input, { failOn: "warning" }).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    const error = new Error("Raster dimensions are required before tracing.");
    error.code = "raster_dimensions_missing";
    throw error;
  }

  const potraceAvailable = await commandAvailable("potrace");
  const vtracerAvailable = await commandAvailable("vtracer");
  let selected = tracer;
  if (selected === "auto") {
    selected = vtracerAvailable ? "vtracer" : potraceAvailable ? "potrace" : null;
  }
  if (selected === "vtracer" && !vtracerAvailable) selected = null;
  if (selected === "potrace" && !potraceAvailable) selected = null;
  if (!selected) {
    const error = new Error("No supported vector tracer is installed (vtracer or potrace).");
    error.code = "vector_tracer_unavailable";
    throw error;
  }

  const dir = await mkdtemp(join(tmpdir(), "agentsam-vectorize-"));
  try {
    const inputPath = join(dir, "source.png");
    const outputPath = join(dir, "output.svg");
    await writeFile(inputPath, Buffer.from(input));

    if (selected === "vtracer") {
      await execFileAsync(
        "vtracer",
        [
          "--input",
          inputPath,
          "--output",
          outputPath,
          "--colormode",
          "binary",
        ],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
      );
    } else {
      const pgmPath = join(dir, "source.pgm");
      const { data } = await sharp(input, { failOn: "warning" })
        .rotate()
        .flatten({ background: "#ffffff" })
        .grayscale()
        .threshold(threshold)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const header = Buffer.from(`P5\n${width} ${height}\n255\n`);
      await writeFile(pgmPath, Buffer.concat([header, data]));
      await execFileAsync(
        "potrace",
        [
          pgmPath,
          "--svg",
          "--output",
          outputPath,
          "--turdsize",
          String(Math.max(0, Number(turdSize) || 0)),
        ],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
      );
    }

    const svg = await readFile(outputPath, "utf8");
    const sourceMask = await rasterMask(sharp, input, width, height, threshold);
    const tracedMask = await rasterMask(
      sharp,
      Buffer.from(svg),
      width,
      height,
      threshold,
    );
    const boundaryIntegrity = occupancyIou(sourceMask, tracedMask);

    return Object.freeze({
      svg,
      tracer: selected,
      descriptor: Object.freeze({
        format: "svg",
        mediaKind: "vector",
        widthPx: width,
        heightPx: height,
        contentWidthPx: width,
        contentHeightPx: height,
        colorMode: "monochrome",
        hasGradients: false,
        hasOpenPaths: false,
        hasLiveText: false,
        hasExplicitViewBox: /\bviewBox\s*=/.test(svg),
        boundaryIntegrity,
      }),
      metrics: Object.freeze({
        boundaryIntegrity,
        width,
        height,
      }),
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Dependency-free SVG normalization for icon and manufacturing workflows.
 * It standardizes the SVG viewport and root stroke contract without rewriting
 * path data. It intentionally does not trace raster artwork or outline fonts.
 */
export function normalizeSvgMarkup(
  svg,
  {
    width = 24,
    height = 24,
    viewBox,
    stroke = "currentColor",
    strokeWidth = 2,
    fill = "none",
    iconId,
    semanticId,
  } = {},
) {
  const source = String(svg ?? "").trim();
  const openingMatch = source.match(/<svg\b[^>]*>/i);
  const opening = openingMatch?.[0];
  const prefix = openingMatch ? source.slice(0, openingMatch.index).trim() : "";
  if (!opening || !/<\/svg>\s*$/i.test(source) || (prefix && !/^<\?xml\b[^?]*\?>$/i.test(prefix))) {
    const error = new Error("SVG normalization requires one complete <svg> root.");
    error.code = "svg_root_invalid";
    throw error;
  }
  if (/<\s*(?:script|foreignObject|iframe|object|embed)\b/i.test(source)
      || /\bon[a-z]+\s*=/i.test(source)
      || /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|javascript:|data:text\/html)/i.test(source)) {
    const error = new Error("SVG contains active or external content and cannot be normalized as a trusted icon.");
    error.code = "svg_active_content";
    throw error;
  }
  if (/<text\b/i.test(source)) {
    const error = new Error("SVG contains live text; outline it with an approved font-aware workflow before manufacturing.");
    error.code = "svg_live_text";
    throw error;
  }

  const attr = (name) => {
    const match = opening.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
    return match?.[1] ?? null;
  };
  const resolvedViewBox = String(viewBox || attr("viewBox") || "").trim();
  const numbers = resolvedViewBox.split(/[\s,]+/).map(Number);
  if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n)) || numbers[2] <= 0 || numbers[3] <= 0) {
    const error = new Error("SVG requires a finite, positive four-number viewBox.");
    error.code = "svg_viewbox_invalid";
    throw error;
  }
  const numericStroke = Number(strokeWidth);
  if (!Number.isFinite(numericStroke) || numericStroke < 1 || numericStroke > 3) {
    const error = new Error("Icon stroke width must be between 1 and 3 units for a 24-unit icon grid.");
    error.code = "svg_stroke_width_invalid";
    throw error;
  }
  const idAttrs = [
    iconId ? `id="icon-${String(iconId).replace(/[^a-zA-Z0-9_-]/g, "-")}"` : "",
    semanticId ? `data-semantic="${String(semanticId).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"` : "",
  ].filter(Boolean).join(" ");
  const normalizedRoot = `<svg xmlns="http://www.w3.org/2000/svg" width="${Number(width)}" height="${Number(height)}" viewBox="${resolvedViewBox}" fill="${fill}" stroke="${stroke}" stroke-width="${numericStroke}" stroke-linecap="round" stroke-linejoin="round"${idAttrs ? ` ${idAttrs}` : ""}>`;
  const inner = source.slice(openingMatch.index + opening.length).replace(/<\/svg>\s*$/i, "").trim();
  if (!/<(?:path|line|polyline|polygon|circle|rect|ellipse)\b/i.test(inner)) {
    const error = new Error("SVG contains no supported visible geometry.");
    error.code = "svg_geometry_missing";
    throw error;
  }
  const normalized = `<?xml version="1.0" encoding="UTF-8"?>\n${normalizedRoot}${inner}</svg>\n`;
  return Object.freeze({
    svg: normalized,
    hasExplicitViewBox: true,
    hasLiveText: false,
    pathCount: (inner.match(/<(?:path|line|polyline|polygon|circle|rect|ellipse)\b/gi) || []).length,
    viewBox: resolvedViewBox,
    width: Number(width),
    height: Number(height),
    strokeWidth: numericStroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  });
}

export async function normalizeSvgWithSvgo(
  svg,
  { multipass = true } = {},
) {
  let optimize;
  try {
    ({ optimize } = await import("svgo"));
  } catch (error) {
    const wrapped = new Error(
      "SVG normalization requires the optional 'svgo' runtime dependency.",
    );
    wrapped.code = "svgo_unavailable";
    wrapped.cause = error;
    throw wrapped;
  }

  const result = optimize(String(svg), {
    multipass,
    plugins: [
      "preset-default",
      "removeDimensions",
      {
        name: "removeAttrs",
        params: { attrs: "(data-name|data-layer|xml:space)" },
      },
    ],
  });

  return Object.freeze({
    svg: result.data,
    hasExplicitViewBox: /\bviewBox\s*=/.test(result.data),
    hasLiveText: /<text\b/i.test(result.data),
    note:
      "SVGO normalizes SVG structure but does not outline live fonts. Use a font-aware outliner for <text> elements.",
  });
}
