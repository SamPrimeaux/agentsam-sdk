import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { evidenceError } from './contract.js';

const run = promisify(execFile);
const ENGINES = new Set(['CYCLES', 'BLENDER_WORKBENCH']);
const MODEL_EXT = new Set(['glb', 'gltf', 'blend']);

export const BLENDER_RENDER_SCRIPT = String.raw`import bpy, json, sys
from mathutils import Vector
args = json.loads(sys.argv[sys.argv.index("--") + 1])
model = args["model"]
if model.rsplit(".", 1)[-1].lower() == "blend":
    bpy.ops.wm.open_mainfile(filepath=model)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=model)
scene = bpy.context.scene
cam_data = bpy.data.cameras.new("EvidenceCamera")
cam_data.lens = float(args["lens"])
cam = bpy.data.objects.new("EvidenceCamera", cam_data)
scene.collection.objects.link(cam)
cam.location = Vector(args["location"])
cam.rotation_euler = (Vector(args["target"]) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
if not any(o.type == "LIGHT" for o in scene.objects):
    sun = bpy.data.objects.new("EvidenceSun", bpy.data.lights.new("EvidenceSun", "SUN"))
    sun.rotation_euler = (0.9, 0.2, 0.8)
    scene.collection.objects.link(sun)
scene.render.engine = args["engine"]
scene.render.resolution_x = int(args["size"][0])
scene.render.resolution_y = int(args["size"][1])
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = args["out"]
if args["engine"] == "CYCLES":
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(args["samples"])
bpy.ops.render.render(write_still=True)
`;

/** Render with a Blender binary on this machine. Container or hosted execution plugs in the same `exec` shape. */
export function createLocalBlenderExec({ binary = 'blender', timeoutMs = 180000 } = {}) {
  return async ({ args }) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'evidence-blender-'));
    try {
      const script = path.join(dir, 'render.py');
      const out = path.join(dir, 'out.png');
      await writeFile(script, BLENDER_RENDER_SCRIPT);
      await run(binary, ['-b', '--factory-startup', '--python', script, '--', JSON.stringify({ ...args, out })], { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
      return await readFile(out);
    } finally { await rm(dir, { recursive: true, force: true }); }
  };
}

const vec3 = (value, fallback) => {
  const v = value ?? fallback;
  if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) throw evidenceError('evidence_source_invalid', 'vector');
  return v;
};

/**
 * source: { kind: 'blender-camera', model, camera: { location, target?, lens? }, size?, engine?, samples? }
 * The model must live under a readable root; the camera is explicit, so every render is reproducible.
 */
export function createBlenderSource({ exec, readableRoots = [] } = {}) {
  if (typeof exec !== 'function') throw evidenceError('evidence_driver_unavailable', 'blender');
  return async ({ source }) => {
    if (typeof source.model !== 'string' || !path.isAbsolute(source.model) || !MODEL_EXT.has(path.extname(source.model).slice(1).toLowerCase())) {
      throw evidenceError('evidence_source_invalid', 'model');
    }
    const real = await realpath(source.model);
    const roots = await Promise.all(readableRoots.map((root) => realpath(root)));
    if (!roots.some((root) => real === root || real.startsWith(root + path.sep))) throw evidenceError('evidence_source_outside_readable_roots');
    const size = source.size ?? [1600, 1000];
    if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => Number.isInteger(n) && n >= 64 && n <= 4096)) throw evidenceError('evidence_source_invalid', 'size');
    const engine = source.engine ?? 'CYCLES';
    if (!ENGINES.has(engine)) throw evidenceError('evidence_source_invalid', 'engine');
    const samples = Math.min(Math.max(Number(source.samples ?? 32), 1), 512);
    const camera = source.camera ?? {};
    const args = {
      model: real, location: vec3(camera.location), target: vec3(camera.target, [0, 0, 0]),
      lens: Number.isFinite(camera.lens) ? camera.lens : 35, size, engine, samples,
    };
    const bytes = await exec({ args });
    return { bytes, ext: 'png', meta: { engine, size, samples, camera: { location: args.location, target: args.target, lens: args.lens } } };
  };
}
