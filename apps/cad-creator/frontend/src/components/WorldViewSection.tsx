import {useState} from 'react';
import {worldView, useWorldView, WORLD_ENVIRONMENT_PRESETS, type WorldViewPreset} from '../lib/world-view-store';

const VIEWS: {id: WorldViewPreset; label: string}[] = [
  {id: 'iso', label: 'Isometric'}, {id: 'plan', label: 'Top'}, {id: 'front', label: 'Front'}, {id: 'side', label: 'Side'},
];

function RangeSetting({label, value, min, max, step, unit = '', precision = 2, disabled, onChange}: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; precision?:number;
  disabled?: boolean; onChange(value: number): void;
}) {
  return <label className="cad-world-range">
    <span>{label}</span><output>{Number(value.toFixed(precision))}{unit}</output>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      aria-label={label} onChange={event => onChange(Number(event.target.value))}/>
  </label>;
}

function ColorSetting({label, value, disabled, onChange}: {
  label: string; value: string; disabled?: boolean; onChange(value: string): void;
}) {
  return <label className="cad-world-color">
    <span>{label}</span>
    <input type="color" aria-label={label} value={value} disabled={disabled}
      onChange={event => onChange(event.target.value)}/>
  </label>;
}

/** Contextual scene inspector. Every control maps to a live viewport command. */
export function WorldViewSection({family}: {family: 'camera'|'environment'|'lighting'|'rendering'}) {
  const w = useWorldView();
  const [cameraName,setCameraName]=useState('');
  if (!w.active) return <p className="cad-property-help">Open a 3D view to access viewport controls.</p>;

  const Toggle = ({pressed, disabled = false, onClick, children}: {
    pressed?: boolean; disabled?: boolean; onClick(): void; children: React.ReactNode;
  }) => <button type="button" className="cad-world-chip" aria-pressed={pressed}
    disabled={disabled || !w.ready} onClick={onClick}>{children}</button>;

  if (w.kind === 'model') return <section className="cad-world-controls" aria-label="3D view controls">
    {family==='camera' && <div className="cad-world-chip-row">
      {w.cameras.map(camera => <Toggle key={camera.id} pressed={w.cameraId===camera.id} onClick={()=>worldView.setCamera(camera.id)}>{camera.label}</Toggle>)}
    </div>}
    {family==='environment' && <Toggle pressed={w.roofVisible} onClick={worldView.toggleRoof}>Roof visible</Toggle>}
    {family==='rendering' && <Toggle onClick={worldView.capture}>Capture PNG</Toggle>}
  </section>;

  const canEdit = w.canEditScene && w.ready;
  return <section className="cad-world-controls" aria-label="Scene inspector">
    {family==='camera' && <>
      <div className="cad-world-group-body">
        <div className="cad-world-chip-row">
          <Toggle pressed={w.mode === 'orbit'} disabled={!w.ready} onClick={() => worldView.setMode('orbit')}>Orbit</Toggle>
          <Toggle pressed={w.mode === 'walk'} disabled={!w.ready} onClick={() => worldView.setMode('walk')}>Walk</Toggle>
          <Toggle disabled={!w.ready} onClick={worldView.frame}>Frame model</Toggle>
        </div>
        <div className="cad-world-chip-row" aria-label="Standard views">
          {VIEWS.map(view => <Toggle key={view.id} pressed={w.viewPreset === view.id} disabled={!w.ready}
            onClick={() => worldView.setView(view.id)}>{view.label}</Toggle>)}
        </div>
        <label className="cad-property"><span>Orbit projection</span><select value={w.projection} disabled={!canEdit||w.mode!=='orbit'}
          onChange={e=>worldView.setProjection(e.target.value as typeof w.projection)}><option value="perspective">Perspective</option><option value="orthographic">Orthographic</option></select></label>
        <RangeSetting label="Lens / field of view"  value={w.cameraFov} min={20} max={90} step={1} unit="°"
          disabled={!canEdit||!w.ready} onChange={worldView.setCameraFov}/>
        <label className="cad-property"><span>Near clip (m)</span><input type="number" min={0.001} step="any" value={w.clipNear} disabled={!canEdit} onChange={e=>worldView.setClip(e.target.valueAsNumber,w.clipFar)}/></label>
        <label className="cad-property"><span>Far clip (m)</span><input type="number" min={w.clipNear} step="any" value={w.clipFar} disabled={!canEdit} onChange={e=>worldView.setClip(w.clipNear,e.target.valueAsNumber)}/></label>
        <label className="cad-property"><span>View name</span><input value={cameraName} maxLength={96} disabled={!canEdit||w.mode!=='orbit'} onChange={e=>setCameraName(e.target.value)}/></label>
        <button type="button" disabled={!canEdit||w.mode!=='orbit'||!cameraName.trim()} onClick={()=>{worldView.saveCamera(cameraName);setCameraName('')}}>Save orbit view</button>
        {w.cameras.map(camera=><Toggle key={camera.id} pressed={w.cameraId===camera.id} onClick={()=>worldView.setCamera(camera.id)}>{camera.label}</Toggle>)}
        {w.rooms.length > 0 && <label className="cad-property"><span>Navigate to space</span>
          <select aria-label="Navigate to space" value="" disabled={!w.ready}
            onChange={event => { if (event.target.value) worldView.visitRoom(event.target.value); }}>
            <option value="">Choose a room…</option>
            {w.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}
          </select>
        </label>}
      </div>
    </>}
    {family==='environment' && <>
      <div className="cad-world-group-body">
        <div className="cad-world-chip-row">
          <Toggle pressed={w.roofVisible} disabled={!canEdit} onClick={worldView.toggleRoof}>Roof visible</Toggle>
          <Toggle pressed={w.sky} disabled={!canEdit} onClick={() => worldView.setSky(!w.sky)}>Sky visible</Toggle>
        </div>
        <p className="cad-property-help">Lighting setups update the live sky shader, sun and ambient fill.</p>
        <div className="cad-world-presets" role="group" aria-label="Environment lighting setups">
          {WORLD_ENVIRONMENT_PRESETS.map(preset=><button key={preset.id} type="button" className="cad-world-preset"
            aria-pressed={w.environmentPresetId===preset.id} title={preset.description} disabled={!canEdit||!w.ready}
            style={{background:preset.preview}} onClick={()=>worldView.setEnvironmentPreset(preset.id)}>{preset.label}</button>)}
        </div>
        <ColorSetting label="Sky / ambient color" value={w.skyColor} disabled={!canEdit||!w.ready} onChange={worldView.setSkyColor}/>
        <ColorSetting label="Ground bounce color" value={w.groundColor} disabled={!canEdit||!w.ready} onChange={worldView.setGroundColor}/>
        <RangeSetting label="Sky turbidity" value={w.skyTurbidity} min={1} max={10} step={0.1} disabled={!canEdit||!w.ready} onChange={worldView.setSkyTurbidity}/>
        <RangeSetting label="Rayleigh scattering" value={w.skyRayleigh} min={0} max={4} step={0.1} disabled={!canEdit||!w.ready} onChange={worldView.setSkyRayleigh}/>
        <RangeSetting label="Mie coefficient" value={w.skyMieCoefficient} min={0} max={0.1} step={0.001} precision={3} disabled={!canEdit||!w.ready} onChange={worldView.setSkyMieCoefficient}/>
        <RangeSetting label="Mie directionality" value={w.skyMieDirectionalG} min={0} max={1} step={0.01} disabled={!canEdit||!w.ready} onChange={worldView.setSkyMieDirectionalG}/>
      </div>
    </>}
    {family==='lighting' && <>
      <div className="cad-world-group-body">
        <RangeSetting label="Sun altitude" value={w.sunAltitude} min={0} max={90} step={1} unit="°"
          disabled={!canEdit} onChange={worldView.setSunAltitude}/>
        <RangeSetting label="Sun azimuth" value={w.sunAzimuth} min={0} max={360} step={1} unit="°"
          disabled={!canEdit} onChange={worldView.setSunAzimuth}/>
        <RangeSetting label="Sun intensity" value={w.sun} min={0} max={2} step={0.05} unit="×"
          disabled={!canEdit} onChange={worldView.setSun}/>
        <RangeSetting label="Ambient intensity" value={w.ambient} min={0} max={2} step={0.05} unit="×"
          disabled={!canEdit} onChange={worldView.setAmbient}/>
        <ColorSetting label="Sun color" value={w.sunColor} disabled={!canEdit} onChange={worldView.setSunColor}/>
      </div>
    </>}
    {family==='rendering' && <>
      <div className="cad-world-group-body">
        <div className="cad-world-chip-row">
          <Toggle pressed={w.shading === 'lit'} onClick={() => worldView.setShading('lit')}>Materials</Toggle>
          <Toggle pressed={w.shading === 'color'} onClick={() => worldView.setShading('color')}>Source colors</Toggle>
          <Toggle pressed={w.wireframe} onClick={() => worldView.toggleWireframe()}>Wireframe</Toggle>
        </div>
        <RangeSetting label="Exposure" value={w.exposure} min={0.2} max={2} step={0.02} unit="×"
          disabled={!canEdit} onChange={worldView.setExposure}/>
        <label className="cad-property"><span>Shadows</span>
          <input aria-label="Shadows" type="checkbox" checked={w.shadows} disabled={!canEdit || !w.ready}
            onChange={event => worldView.setShadows(event.target.checked)}/>
        </label>
        <label className="cad-property"><span>Shadow quality</span>
          <select aria-label="Shadow quality" value={w.shadowQuality} disabled={!canEdit || !w.ready}
            onChange={event => worldView.setShadowQuality(event.target.value as 'low'|'medium'|'high')}>
            <option value="low">Performance · 512</option>
            <option value="medium">Balanced · 1024</option>
            <option value="high">High · 2048</option>
          </select>
        </label>
        <label className="cad-property"><span>Tone mapping</span>
          <select aria-label="Tone mapping" value={w.toneMapping} disabled={!canEdit || !w.ready}
            onChange={event => worldView.setToneMapping(event.target.value as 'aces'|'reinhard'|'neutral'|'none')}>
            <option value="aces">ACES Filmic</option>
            <option value="neutral">Neutral</option>
            <option value="reinhard">Reinhard</option>
            <option value="none">None</option>
          </select>
        </label>
        <div className="cad-world-chip-row">
          <Toggle onClick={worldView.capture}>Capture PNG</Toggle>
          <Toggle disabled={!canEdit} onClick={worldView.resetLight}>Reset lighting &amp; render</Toggle>
        </div>
      </div>
    </>}
  </section>;
}
