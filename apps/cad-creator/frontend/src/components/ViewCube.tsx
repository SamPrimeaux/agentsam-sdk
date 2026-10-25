import {Box, Move, Rotate3d, Scale, Magnet} from 'lucide-react';
import {useWorldView, worldView} from '../lib/world-view-store';
import {setGizmo, useKit, type GizmoMode} from '../lib/sketch-kit-store';

const MODES: {id: GizmoMode; label: string; icon: typeof Move}[] = [
  {id: 'move', label: 'Move', icon: Move}, {id: 'rotate', label: 'Rotate', icon: Rotate3d}, {id: 'scale', label: 'Scale', icon: Scale},
];
const AXES = [['X', '#ef4b4b', 'M12 12 L26 12'], ['Y', '#4bd36f', 'M12 12 L12 -2'], ['Z', '#4b8bef', 'M12 12 L4 21']] as const;

/** Orientation handle plus transform-gizmo controls for any registered 3D viewport. */
export function ViewCube() {
  const w = useWorldView();
  const {gizmo} = useKit();
  if (!w.active) return null;
  const chips: {id: string; label: string; active: boolean; run(): void}[] = w.kind === 'model'
    ? [['topdown', 'Top'], ['isometric', 'Iso'], ['orbit', 'Orbit'], ['firstperson', 'Walk']].map(([id, label]) =>
        ({id, label, active: w.cameraId === id, run: () => worldView.setCamera(id)}))
    : [['plan', 'Top'], ['front', 'Front'], ['side', 'Side'], ['iso', 'Iso']].map(([id, label]) =>
        ({id, label, active: w.mode === 'orbit' && w.viewPreset === id, run: () => worldView.setView(id as 'iso' | 'plan' | 'front' | 'side')}));
  const focus = () => (w.kind === 'model' ? worldView.setCamera('isometric') : worldView.frame());
  return <div className="cad-viewcube" role="group" aria-label="View orientation and transform handles">
    <div className="cad-viewcube-row">
      <button type="button" className="cad-viewcube-icon" title="Reset to isometric" aria-label="Reset to isometric" onClick={focus}>
        <Box size={30} strokeWidth={1.4}/>
        <svg viewBox="-2 -4 32 28" width="22" height="20" aria-hidden="true">{AXES.map(([a, c, d]) => <path key={a} d={d} stroke={c} strokeWidth="2" fill="none" strokeLinecap="round"/>)}</svg>
      </button>
      <div className="cad-viewcube-chips">
        {chips.map(c => <button key={c.id} type="button" aria-pressed={c.active} disabled={!w.ready} onClick={c.run}>{c.label}</button>)}
        <button type="button" disabled={!w.ready} onClick={focus} title="Frame the model">Focus</button>
      </div>
    </div>
    <div className="cad-viewcube-row cad-gizmo" role="group" aria-label="Transform handles">
      {MODES.map(m => <button key={m.id} type="button" title={`${m.label} handle`} aria-pressed={gizmo.mode === m.id} onClick={() => setGizmo({mode: m.id})}><m.icon size={14}/></button>)}
      <button type="button" aria-pressed={gizmo.space === 'local'} title="Toggle local / world axes" onClick={() => setGizmo({space: gizmo.space === 'world' ? 'local' : 'world'})}>{gizmo.space === 'world' ? 'World' : 'Local'}</button>
      <button type="button" aria-pressed={gizmo.snap} title="Snap" onClick={() => setGizmo({snap: !gizmo.snap})}><Magnet size={14}/></button>
      <input type="number" aria-label="Snap step" title="Snap step" value={gizmo.step} min={1} onChange={e => { const v = e.currentTarget.valueAsNumber; if (Number.isFinite(v) && v > 0) setGizmo({step: v}); }}/>
    </div>
  </div>;
}
