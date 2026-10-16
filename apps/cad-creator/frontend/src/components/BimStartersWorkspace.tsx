import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type SourceObject = { name: string; label: string; type: string; visible: boolean; inPreview: boolean; parents: string[]; children: string[] };
type Starter = {
  id: string; title: string; objectCount: number; meshCount: number;
  sourceSha256: string; workingExists?: boolean; objects?: SourceObject[];
};
const asset = (id: string, kind: 'preview' | 'thumbnail' | 'source' | 'working') =>
  `/api/cad/bim-starters/${encodeURIComponent(id)}/file/${kind}`;

function BimViewport({ id, version, focused, hidden, isolated, onPick }: {
  id: string; version: string; focused: string | null;
  hidden: string[]; isolated: string | null; onPick: (name: string | null) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const objectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const markerRef = useRef<THREE.BoxHelper | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const visibilityRef = useRef({ hidden, isolated });
  visibilityRef.current = { hidden, isolated };
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setLoadError('');
    objectsRef.current.clear();
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#111722');
    scene.add(new THREE.HemisphereLight(0xf8fafc, 0x364152, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.65);
    sun.position.set(20, 35, 25);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(mount.clientWidth || 400, mount.clientHeight || 500);
    mount.appendChild(renderer.domElement);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.minDistance = 0.1;
    orbit.maxDistance = 2000;
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects([...objectsRef.current.values()], true)[0];
      let node: THREE.Object3D | null = hit?.object ?? null;
      while (node && !node.userData?.freecadName) node = node.parent;
      onPick(node?.userData?.freecadName ?? null);
    };
    const down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => { down.x = e.clientX; down.y = e.clientY; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) pick(e);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    let alive = true;
    let preview: THREE.Object3D | null = null;
    new GLTFLoader().load(asset(id, 'preview') + '?v=' + encodeURIComponent(version), (gltf) => {
      if (!alive) return;
      preview = gltf.scene;
      scene.add(preview);
      preview.traverse((node) => {
        if (node.userData?.freecadName) objectsRef.current.set(node.userData.freecadName as string, node);
      });
      const state = visibilityRef.current;
      for (const [name, object] of objectsRef.current) {
        object.visible = !state.hidden.includes(name) && (!state.isolated || state.isolated === name);
      }
      const bounds = new THREE.Box3().setFromObject(preview);
      if (!bounds.isEmpty()) {
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const distance = Math.max(size.length() * 1.3, 1);
        camera.position.copy(center.clone().add(new THREE.Vector3(distance * 0.8, distance * 0.55, distance * 0.8)));
        camera.near = Math.max(distance / 10000, 0.005);
        camera.far = distance * 20;
        camera.updateProjectionMatrix();
        orbit.target.copy(center);
        orbit.maxDistance = distance * 6;
        orbit.update();
      }
    }, undefined, () => { if (alive) setLoadError('The 3D preview could not load. The original FreeCAD file is still available.'); });
    const resize = new ResizeObserver(() => {
      if (!alive) return;
      const width = Math.max(1, mount.clientWidth), height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resize.observe(mount);
    let frame = 0;
    const tick = () => {
      if (!alive) return;
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      orbit.update();
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      orbit.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      if (preview) {
        preview.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        });
      }
      if (markerRef.current) scene.remove(markerRef.current);
      renderer.dispose();
      renderer.domElement.remove();
      objectsRef.current.clear();
      sceneRef.current = null;
    };
  }, [id, version, onPick]);

  useEffect(() => {
    for (const [name, object] of objectsRef.current) {
      object.visible = !hidden.includes(name) && (!isolated || isolated === name);
    }
  }, [id, hidden, isolated]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (markerRef.current) {
      scene.remove(markerRef.current);
      markerRef.current.geometry.dispose();
      markerRef.current.material.dispose();
      markerRef.current = null;
    }
    const target = focused ? objectsRef.current.get(focused) : null;
    if (!target) return;
    const box = new THREE.BoxHelper(target, 0xf2c66b);
    scene.add(box);
    markerRef.current = box;
  }, [focused, id]);

  return <div className="relative h-full w-full" ref={mountRef}>
    {loadError && <div role="alert" className="absolute left-4 top-4 z-10 rounded bg-slate-900 p-3 text-sm text-rose-300">{loadError}</div>}
    <div className="pointer-events-none absolute bottom-4 left-4 rounded bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300">
      Drag to orbit · Scroll to zoom · Click an element to inspect
    </div>
  </div>;
}

export function BimStartersWorkspace({ onReturn }: { onReturn: () => void }) {
  const [starters, setStarters] = useState<Starter[]>([]);
  const [active, setActive] = useState<Starter | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [isolated, setIsolated] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [nativeStatus, setNativeStatus] = useState('');
  const [previewVersion, setPreviewVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/cad/bim-starters', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok || !r.headers.get('content-type')?.includes('application/json')) {
          throw new Error('Native BIM library requires the local CAD runtime. Open standalone CAD Creator on this machine.');
        }
        return r.json();
      })
      .then((data) => { if (!Array.isArray(data.starters)) throw new Error('Native BIM library response is invalid.'); setStarters(data.starters); })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  const open = async (id: string) => {
    setError('');
    setSelected(null);
    setHidden([]);
    setIsolated(null);
    const response = await fetch('/api/cad/bim-starters/' + encodeURIComponent(id));
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      setError('Cannot read this BIM starter from the local CAD runtime.');
      return;
    }
    const body = await response.json();
    setActive(body.starter);
  };
  const handlePick = useCallback((name: string | null) => setSelected(name), []);
  const objects = active?.objects?.filter((item) =>
    (item.label + ' ' + item.name + ' ' + item.type).toLowerCase().includes(query.toLowerCase())
  ) ?? [];
  const item = active?.objects?.find((o) => o.name === selected);
  const openNative = async () => {
    if (!active) return;
    setNativeStatus('');
    try {
      const r = await fetch('/api/cad/bim-starters/' + encodeURIComponent(active.id) + '/open-native', { method: 'POST' });
      const body = await r.json();
      if (!r.ok || body.ok !== true) throw new Error(body.error ?? 'FreeCAD launch failed');
      setActive((current) => current ? { ...current, workingExists: true } : current);
      setNativeStatus('Opened native working copy in FreeCAD.');
    } catch (e) {
      setNativeStatus(e instanceof Error ? e.message : 'FreeCAD launch unavailable');
    }
  };
  const refreshPreview = async () => {
    if (!active || refreshing) return;
    setRefreshing(true);
    setNativeStatus('');
    try {
      const response = await fetch('/api/cad/bim-starters/' + encodeURIComponent(active.id) + '/refresh-preview', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'bim_preview_refresh_failed');
      setActive(result.starter);
      setSelected(null);
      setPreviewVersion((n) => n + 1);
      setNativeStatus('Refreshed 3D derivative from the FreeCAD working copy.');
    } catch (e) {
      setNativeStatus(e instanceof Error ? e.message : '3D preview refresh unavailable');
    } finally {
      setRefreshing(false);
    }
  };
  return <div className="flex h-full min-h-0 w-full flex-col bg-[#10141d] text-slate-100">
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-xs">
      <button onClick={onReturn} className="rounded border border-white/20 px-3 py-1 hover:bg-white/10">Return to CAD canvas</button>
      {active && <button onClick={() => { setActive(null); setSelected(null); }} className="rounded border border-white/20 px-3 py-1">BIM Library</button>}
      <span className="font-semibold">{active ? active.title : 'Native BIM Starter Library'}</span>
      {active && <span className="text-slate-400">{active.objectCount} original objects · {active.meshCount} preview meshes</span>}
    </div>
    {error && <div role="alert" className="p-4 text-sm text-amber-300">{error}</div>}
    {!active ? <div className="grid flex-1 content-start gap-4 overflow-y-auto p-5 sm:grid-cols-2">
      {starters.map((starter) => <button key={starter.id} aria-label={`Open ${starter.title} FreeCAD project`} onClick={() => void open(starter.id)}
        className="overflow-hidden rounded-lg border border-white/15 bg-slate-900 text-left hover:border-amber-400/60">
        <span className="sr-only">{`Open ${starter.title} FreeCAD project`}</span>
        <img alt={starter.title + ' FreeCAD thumbnail'} src={asset(starter.id, 'thumbnail')} className="h-40 w-full object-contain bg-[#25262a]" />
        <div className="p-3"><div className="font-semibold">{starter.title}</div>
          <div className="mt-1 text-xs text-slate-400">{starter.objectCount} native FreeCAD objects · {starter.meshCount} selectable 3D parts</div>
          <div className="mt-2 text-xs text-amber-300">Open project →</div>
        </div>
      </button>)}
      {!starters.length && !error && <div className="text-sm text-slate-400">No BIM starters imported into the local CAD library.</div>}
    </div> : <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="min-h-[320px] flex-1">
        <BimViewport key={active.id + previewVersion} id={active.id} version={String(previewVersion) + active.sourceSha256}
          focused={selected} hidden={hidden} isolated={isolated} onPick={handlePick} />
      </div>
      <aside className="flex max-h-[45%] w-full shrink-0 flex-col border-t border-white/10 bg-[#161c27] md:max-h-full md:w-[280px] md:border-l md:border-t-0">
        <div className="space-y-2 border-b border-white/10 p-3 text-xs">
          <div className="font-semibold">Original FreeCAD project</div>
          <p className="text-slate-400">The browser mesh is an inspectable derivative. The source keeps the true FreeCAD assemblies, constraints, dimensions and drawings.</p>
          <button onClick={() => void openNative()} className="w-full rounded bg-amber-500 px-2 py-2 font-semibold text-slate-950">Edit working copy in FreeCAD</button>
          <button disabled={refreshing} onClick={() => void refreshPreview()} className="w-full rounded border border-amber-500/40 px-2 py-2 text-amber-200 disabled:opacity-40">{refreshing ? 'Converting model…' : 'Sync 3D after FreeCAD save'}</button>
          <a className="block rounded border border-white/20 px-2 py-2 text-center hover:bg-white/10" href={asset(active.id, 'source')}>Download preserved original .FCStd</a>
          {active.workingExists && <a className="block rounded border border-white/20 px-2 py-2 text-center hover:bg-white/10" href={asset(active.id, 'working')}>Download working copy</a>}
          {nativeStatus && <div role="status" className="text-amber-200">{nativeStatus}</div>}
        </div>
        <div className="border-b border-white/10 p-3">
          <label htmlFor="bim-object-filter" className="text-xs font-semibold">FreeCAD object tree</label>
          <input id="bim-object-filter" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Filter materials, walls, beams…" className="mt-2 w-full rounded border border-white/15 bg-slate-950 px-2 py-2 text-xs" />
        </div>
        {item && <div className="border-b border-white/10 bg-amber-400/10 p-3 text-xs">
          <div className="font-semibold text-amber-200">{item.label}</div>
          <div className="mt-1 break-all text-slate-300">{item.type}</div>
          <div className="mt-1 text-slate-400">Object: {item.name}</div>
          <div className="mt-1 text-slate-400">{item.inPreview ? 'Selectable 3D geometry' : 'Native FreeCAD-only object (not tessellated)'}</div>
          {item.inPreview && <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => setHidden((names) => names.includes(item.name) ? names : [...names, item.name])}
              className="rounded border border-amber-400/40 px-2 py-1">Hide</button>
            <button onClick={() => setIsolated((name) => name === item.name ? null : item.name)}
              className="rounded border border-amber-400/40 px-2 py-1">{isolated === item.name ? 'Exit isolate' : 'Isolate'}</button>
            <button onClick={() => { setHidden([]); setIsolated(null); }}
              className="rounded border border-white/20 px-2 py-1">Show all</button>
          </div>}
        </div>}
        <div className="border-b border-white/10 px-3 py-2 text-xs">
          <button onClick={() => { setHidden([]); setIsolated(null); }}
            className="rounded border border-white/20 px-2 py-1 hover:bg-white/10">Show all geometry</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {objects.slice(0, 500).map(o => <button key={o.name} onClick={() => setSelected(o.name)}
            className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs ${selected === o.name ? 'bg-amber-500/20 text-amber-200' : 'text-slate-300 hover:bg-white/10'}`}
            title={o.name + ' · ' + o.type}>
            <span className={o.inPreview ? '' : 'opacity-45'}>{o.label}</span>
            <span className="ml-1 text-[10px] text-slate-500">{o.type.replace(/^.*::/, '')}</span>
          </button>)}
        </div>
      </aside>
    </div>}
  </div>;
}
