import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Express, Request } from 'express';

const libraryRoot = () => path.resolve(process.env.AGENTSAM_CAD_BIM_LIBRARY || path.join(os.homedir(), '.agentsam/cad/bim-starters'));
const validId = (id: string) => /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id);
const local = (req: Request) => {
  try {
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')
      && ['localhost', '127.0.0.1', '[::1]'].includes(new URL('http://' + req.headers.host).hostname);
  } catch { return false; }
};

type Starter = {
  schema: string; id: string; title: string; sourceSha256: string;
  objectCount: number; meshCount: number; previewSourceSha256?: string; previewSha256?: string;
  objects: Array<{ name: string; label: string; type: string; visible: boolean; parents: string[]; children: string[] }>;
};
function readStarter(id: string): { starter: Starter; directory: string } | null {
  if (!validId(id)) return null;
  const directory = path.join(libraryRoot(), id);
  const file = path.join(directory, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  const starter = JSON.parse(fs.readFileSync(file, 'utf8')) as Starter;
  if (starter.schema !== 'agentsam.cad.bim-starter.v1' || starter.id !== id) return null;
  return { starter, directory };
}
export function installBimStarterRoutes(app: Express): void {
  app.get('/api/cad/bim-starters', (req, res) => {
    if (!local(req)) return res.sendStatus(403);
    const root = libraryRoot();
    const items = fs.existsSync(root)
      ? fs.readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory())
        .map((dir) => readStarter(dir.name)?.starter).filter((item): item is Starter => !!item)
        .map(({ objects: _objects, ...row }) => row)
      : [];
    res.json({ ok: true, starters: items, localOnly: true });
  });
  app.get('/api/cad/bim-starters/:id', (req, res) => {
    if (!local(req)) return res.sendStatus(403);
    const result = readStarter(req.params.id);
    if (!result) return res.sendStatus(404);
    return res.json({
      ok: true, starter: {
        ...result.starter,
        workingExists: fs.existsSync(path.join(result.directory, 'working.FCStd')),
      },
    });
  });
  app.get('/api/cad/bim-starters/:id/file/:asset', (req, res) => {
    if (!local(req)) return res.sendStatus(403);
    const entry = readStarter(req.params.id);
    const files: Record<string, string> = { preview: 'preview.glb', thumbnail: 'thumbnail.png', source: 'source.FCStd', working: 'working.FCStd' };
    const filename = files[req.params.asset];
    if (!entry || !filename) return res.sendStatus(404);
    const filepath = path.join(entry.directory, filename);
    if (!fs.existsSync(filepath)) return res.sendStatus(404);
    // Never claim a partially regenerated or tampered GLB is a valid preview.
    if (req.params.asset === 'preview' && entry.starter.previewSha256) {
      const actual = createHash('sha256').update(fs.readFileSync(filepath)).digest('hex');
      if (actual !== entry.starter.previewSha256) return res.status(409).json({ error: 'bim_preview_integrity_mismatch' });
    }
    if (req.params.asset === 'source' || req.params.asset === 'working')
      res.setHeader('Content-Disposition', 'attachment; filename="' + req.params.id + (req.params.asset === 'working' ? '-working' : '-original') + '.FCStd"');
    if (req.params.asset === 'preview') res.type('model/gltf-binary');
    if (req.params.asset === 'thumbnail') res.type('png');
    return res.sendFile(filepath);
  });
  app.post('/api/cad/bim-starters/:id/refresh-preview', (req, res) => {
    if (!local(req)) return res.status(403).json({ error: 'local_design_host_only' });
    if (req.headers.origin && req.headers.origin !== req.protocol + '://' + req.headers.host)
      return res.status(403).json({ error: 'origin_mismatch' });
    const entry = readStarter(req.params.id);
    if (!entry) return res.status(404).json({ error: 'bim_starter_not_found' });
    const working = path.join(entry.directory, 'working.FCStd');
    if (!fs.existsSync(working)) return res.status(409).json({ error: 'bim_working_copy_not_created' });
    const python = process.env.AGENTSAM_CAD_FREECAD_PYTHON ||
      '/Applications/FreeCAD.app/Contents/Resources/bin/python';
    const script = path.resolve(process.cwd(), '..', 'bin', 'freecad-bim-preview.py');
    if (!fs.existsSync(python) || !fs.existsSync(script))
      return res.status(501).json({ error: 'freecad_python_or_preview_converter_unavailable' });
    const child = spawn(python, [script, working, entry.directory, '--working'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let errorText = '';
    child.stderr.on('data', (value: Buffer) => { errorText = (errorText + String(value)).slice(-2000); });
    child.on('error', () => res.status(500).json({ error: 'freecad_preview_spawn_failed' }));
    child.on('close', (code) => {
      if (res.headersSent) return;
      if (code !== 0) return res.status(500).json({ error: 'freecad_preview_conversion_failed', detail: errorText });
      const refreshed = readStarter(req.params.id);
      res.json({ ok: true, starter: refreshed?.starter });
    });
  });
  app.post('/api/cad/bim-starters/:id/open-native', (req, res) => {
    if (!local(req)) return res.status(403).json({ error: 'local_design_host_only' });
    if (req.headers.origin && req.headers.origin !== req.protocol + '://' + req.headers.host)
      return res.status(403).json({ error: 'origin_mismatch' });
    const entry = readStarter(req.params.id);
    if (!entry) return res.status(404).json({ error: 'bim_starter_not_found' });
    if (process.platform !== 'darwin') return res.status(501).json({ error: 'freecad_native_launcher_unavailable' });
    const working = path.join(entry.directory, 'working.FCStd');
    if (!fs.existsSync(working)) fs.copyFileSync(path.join(entry.directory, 'source.FCStd'), working, fs.constants.COPYFILE_EXCL);
    const command = spawn('/usr/bin/open', ['-a', 'FreeCAD', working], { stdio: 'ignore' });
    let settled = false;
    command.on('error', () => {
      if (!settled) { settled = true; res.status(500).json({ error: 'freecad_launch_failed' }); }
    });
    command.on('close', (code) => {
      if (!settled) { settled = true; res.status(code === 0 ? 200 : 500).json(code === 0 ? { ok: true } : { error: 'freecad_launch_failed' }); }
    });
  });
}
