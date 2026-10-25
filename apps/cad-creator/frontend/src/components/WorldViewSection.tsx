import {worldView, useWorldView, type WorldViewPreset} from '../lib/world-view-store';

const VIEWS: {id: WorldViewPreset; label: string}[] = [
  {id: 'iso', label: 'Isometric'}, {id: 'plan', label: 'Top'}, {id: 'front', label: 'Front'}, {id: 'side', label: 'Side'},
];

/** Camera, environment, rooms and capture for the live world viewport. Renders nothing without one. */
export function WorldViewSection() {
  const w = useWorldView();
  if (!w.active) return null;
  if (w.kind === 'model') return <section className="cad-world-controls" aria-label="3D view">
    <h4>Camera</h4>
    <div className="cad-world-chip-row">
      {w.cameras.map(c => <button key={c.id} type="button" className="cad-world-chip" aria-pressed={w.cameraId === c.id}
        onClick={() => worldView.setCamera(c.id)}>{c.label}</button>)}
    </div>
    <h4>View</h4>
    <div className="cad-world-chip-row">
      <button type="button" className="cad-world-chip" aria-pressed={w.roofVisible} onClick={worldView.toggleRoof}>Roof {w.roofVisible ? 'on' : 'off'}</button>
      <button type="button" className="cad-world-chip" onClick={worldView.capture}>Snapshot PNG</button>
    </div>
  </section>;
  const Toggle = ({pressed, onClick, children}: {pressed?: boolean; onClick(): void; children: React.ReactNode}) =>
    <button type="button" className="cad-world-chip" aria-pressed={pressed} disabled={!w.ready} onClick={onClick}>{children}</button>;
  return <section className="cad-world-controls" aria-label="World view">
    <h4>Camera</h4>
    <div className="cad-world-chip-row">
      <Toggle pressed={w.mode === 'orbit'} onClick={() => worldView.setMode('orbit')}>Orbit</Toggle>
      <Toggle pressed={w.mode === 'walk'} onClick={() => worldView.setMode('walk')}>Walk</Toggle>
      <Toggle onClick={worldView.frame}>Frame model</Toggle>
    </div>
    <div className="cad-world-chip-row" aria-label="Architectural views">
      {VIEWS.map(v => <Toggle key={v.id} pressed={w.viewPreset === v.id} onClick={() => worldView.setView(v.id)}>{v.label}</Toggle>)}
    </div>
    <h4>Environment</h4>
    <div className="cad-world-chip-row">
      <Toggle pressed={w.roofVisible} onClick={worldView.toggleRoof}>Roof {w.roofVisible ? 'on' : 'off'}</Toggle>
      <Toggle pressed={w.daylight} onClick={worldView.toggleDaylight}>{w.daylight ? 'Daylight' : 'Evening'}</Toggle>
      <Toggle pressed={w.wireframe} onClick={worldView.toggleWireframe}>Wireframe</Toggle>
    </div>
    {w.rooms.length > 0 && <label className="cad-property"><span>Room</span>
      <select aria-label="Visit room" value="" disabled={!w.ready} onChange={e => { if (e.target.value) worldView.visitRoom(e.target.value); }}>
        <option value="">Walk to room…</option>{w.rooms.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select></label>}
    <h4>Site</h4>
    <div className="cad-world-chip-row">
      {w.canEditSite && <Toggle pressed={w.siteOpen} onClick={worldView.toggleSite}>Terrain &amp; scenery</Toggle>}
      <Toggle onClick={worldView.capture}>Capture PNG</Toggle>
    </div>
  </section>;
}
