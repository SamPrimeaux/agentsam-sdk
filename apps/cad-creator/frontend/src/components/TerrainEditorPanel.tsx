import {useEffect,useRef,useState} from 'react';
import './terrain-editor.css';
import {addLandform,validateTerrainDocument,
  type Landform,type GroundCover,type SculptMode,type TerrainDocument} from '../lib/world-terrain';

type Props = {
  document: TerrainDocument;
  resetDocument: TerrainDocument;
  onChange(value: TerrainDocument): void;
  sculptMode: SculptMode | null;
  onSculptMode(value: SculptMode | null): void;
  brushRadius: number;
  onBrushRadius(value: number): void;
  brushStrength: number;
  onBrushStrength(value: number): void;
  onFitSite(): void;
};

function Numeric({label,value,onChange,min,max,step=1}:{
  label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number
}) {
  return <label className="cad-terrain-panel__field">
    <span>{label}</span>
    <input type="number" key={label+value} defaultValue={value} step={step} min={min} max={max}
      onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}
      onBlur={e=>{const n=e.currentTarget.valueAsNumber;const raw=e.currentTarget.value;
        if(raw!==''&&Number.isFinite(n)&&(!Number.isFinite(min)||n>=min!)&&(!Number.isFinite(max)||n<=max!)&&n!==value)onChange(n);
        else e.currentTarget.value=String(value);
      }} className="cad-terrain-panel__control" />
  </label>;
}
const covers:GroundCover[]=['woodland','meadow','rock','arid'];

export function TerrainEditorPanel({document,resetDocument,onChange,sculptMode,onSculptMode,
  brushRadius,onBrushRadius,brushStrength,onBrushStrength,onFitSite}:Props){
  const [selectedId,setSelectedId]=useState(document.landforms[0]?.id||'');
  useEffect(()=>setSelectedId(resetDocument.landforms[0]?.id||''),[resetDocument]);
  const [message,setMessage]=useState('');
  const importRef=useRef<HTMLInputElement>(null);
  const elevationRef=useRef<HTMLInputElement>(null);
  const selected=document.landforms.find(form=>form.id===selectedId)||document.landforms[0];
  const update=(delta:Partial<TerrainDocument>)=>onChange({...document,...delta});
  const updateLandform=(delta:Partial<Landform>)=>onChange({...document,
    landforms:document.landforms.map(form=>form.id===selected?.id?{...form,...delta}:form)});
  const add=(kind:'mountain'|'hill'|'valley')=>{
    const next=addLandform(document,kind);
    onChange(next);setSelectedId(next.landforms.at(-1)!.id);
  };
  const download=()=>{
    const blob=new Blob([JSON.stringify(document,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=globalThis.document.createElement('a');
    link.href=url;link.download='site-terrain.terrain.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setMessage('Terrain exported. Import this file to restore it in another session.');
  };
  const importElevation=async(file:File)=>{
    try{
      if(file.size>8_000_000)throw Error('Elevation grid exceeds 8 MB');
      const text=await file.text();
      const rows=text.trim().split(/\r?\n/).map(line=>line.split(',').map(cell=>Number(cell.trim())));
      const columns=rows[0]?.length||0;
      if(rows.length<2||rows.length>1024||columns<2||columns>1024||rows.some(row=>row.length!==columns||row.some(n=>!Number.isFinite(n)||Math.abs(n)>10000)))
        throw Error('Expected rectangular CSV grid of finite elevations in metres');
      const grid={rows:rows.length,columns,heights:rows.flat()};
      onChange(validateTerrainDocument({...document,imported:grid}));
      setMessage('Imported '+columns+' × '+grid.rows+' metric elevation samples; no georeference is implied.');
    }catch(error){setMessage('Elevation import failed: '+String(error))}
  };
  const importFile=async(file:File)=>{
    try{
      if(file.size>10_000_000)throw Error('Terrain file exceeds 10 MB');
      const next=validateTerrainDocument(JSON.parse(await file.text()));
      onChange(next);setSelectedId(next.landforms[0]?.id||'');
      setMessage('Metric terrain document imported.');
    }catch(error){setMessage('Import failed: '+String(error))}
  };
  return <aside className="cad-terrain-panel"
    aria-label="Site terrain editor">
    <header className="cad-terrain-panel__header">
      <div><h3 className="cad-terrain-panel__title">Site &amp; Terrain</h3>
      <p className="cad-terrain-panel__help">Metric landforms · editable scene geometry</p></div>
    </header>
    <div className="cad-terrain-panel__body">
      <section className="cad-terrain-panel__section">
        <div className="cad-terrain-panel__section-heading"><strong className="cad-terrain-panel__section-title">World scale</strong>
          <button type="button" onClick={onFitSite} className="cad-terrain-panel__button">Fit entire site</button></div>
        <div className="cad-terrain-panel__field-grid">
          <Numeric label="Site width (m)" value={document.width} min={20} max={20000} step={10} onChange={width=>update({width})}/>
          <Numeric label="Site depth (m)" value={document.depth} min={20} max={20000} step={10} onChange={depth=>update({depth})}/>
          <Numeric label="Protected pad (m)" value={document.protectedRadius} min={0} max={500} onChange={protectedRadius=>update({protectedRadius})}/>
          <Numeric label="Terrain detail" value={document.resolution} min={16} max={256} onChange={resolution=>update({resolution:Math.round(resolution)})}/>
        </div>
        <p className="cad-terrain-panel__help">All distances are metres. The BIM building and its internal geometry are never rescaled by these controls.</p>
      </section>
      <section className="cad-terrain-panel__section">
        <div className="cad-terrain-panel__inline-field"><strong className="cad-terrain-panel__section-title">Landforms</strong><span className="cad-terrain-panel__muted">{document.landforms.length} objects</span></div>
        <div className="cad-terrain-panel__button-grid cad-terrain-panel__button-grid--three">
          {(['mountain','hill','valley'] as const).map(kind=>
            <button type="button" key={kind} onClick={()=>add(kind)} className="cad-terrain-panel__button">+ {kind}</button>)}
        </div>
        <select aria-label="Selected landform" className="cad-terrain-panel__control" value={selected?.id||''} onChange={e=>setSelectedId(e.target.value)}>
          {document.landforms.map(form=><option value={form.id} key={form.id}>{form.id} · {form.kind}</option>)}
        </select>
        {selected&&<div className="cad-terrain-panel__field-grid">
          <Numeric label="X (m)" value={selected.x} step={1} onChange={x=>updateLandform({x})}/>
          <Numeric label="Z (m)" value={selected.z} step={1} onChange={z=>updateLandform({z})}/>
          <Numeric label="Width radius (m)" value={selected.radiusX} min={1} max={10000} onChange={radiusX=>updateLandform({radiusX})}/>
          <Numeric label="Depth radius (m)" value={selected.radiusZ} min={1} max={10000} onChange={radiusZ=>updateLandform({radiusZ})}/>
          <Numeric label="Elevation (m)" value={selected.elevation} min={-3000} max={3000} onChange={elevation=>updateLandform({elevation})}/>
          <Numeric label="Rotation (degrees)" value={selected.rotation} step={5} onChange={rotation=>updateLandform({rotation})}/>
          <Numeric label="Peak sharpness" value={selected.sharpness} min={.25} max={6} step={.1} onChange={sharpness=>updateLandform({sharpness})}/>
          <button type="button" onClick={()=>{update({landforms:document.landforms.filter(form=>form.id!==selected.id)});setSelectedId('');}}
            className="cad-terrain-panel__button is-danger">Remove landform</button>
        </div>}
      </section>
      <section className="cad-terrain-panel__section">
        <strong className="cad-terrain-panel__section-title">Sculpt on terrain</strong>
        <div className="cad-terrain-panel__button-grid cad-terrain-panel__button-grid--four">
          {(['raise','lower','flatten','smooth'] as const).map(kind=><button type="button" key={kind} aria-pressed={sculptMode===kind}
            onClick={()=>onSculptMode(sculptMode===kind?null:kind)}
            className={'cad-terrain-panel__button'+(sculptMode===kind?' is-active':'')}>{kind}</button>)}
        </div>
        <div className="cad-terrain-panel__field-grid">
          <Numeric label="Brush radius (m)" value={brushRadius} min={1} max={100} onChange={onBrushRadius}/>
          <Numeric label="Brush strength (m)" value={brushStrength} min={.01} max={50} step={.25} onChange={onBrushStrength}/>
        </div>
        <p className="cad-terrain-panel__help">Click and drag over the landscape to sculpt. Disable sculpt to inspect or orbit. Undo the latest brush using the button below.</p>
        <button type="button" disabled={!document.strokes.length} onClick={()=>update({strokes:document.strokes.slice(0,-1)})}
          className="cad-terrain-panel__button">Undo sculpt ({document.strokes.length})</button>
      </section>
      <section className="cad-terrain-panel__section">
        <strong className="cad-terrain-panel__section-title">Landscape scenery</strong>
        <label className="cad-terrain-panel__inline-field">Ground material
          <select value={document.cover} onChange={e=>update({cover:e.target.value as GroundCover})}
            className="cad-terrain-panel__control">
            {covers.map(cover=><option key={cover} value={cover}>{cover}</option>)}
          </select>
        </label>
        <div className="cad-terrain-panel__field-grid">
          <Numeric label="Tree instances" value={document.treeCount} min={0} max={2500} step={10} onChange={treeCount=>update({treeCount:Math.round(treeCount)})}/>
          <Numeric label="Rock instances" value={document.rockCount} min={0} max={2500} step={10} onChange={rockCount=>update({rockCount:Math.round(rockCount)})}/>
          <Numeric label="Tree scale" value={document.treeScale} min={.1} max={12} step={.25} onChange={treeScale=>update({treeScale})}/>
          <Numeric label="Rock scale" value={document.rockScale} min={.1} max={12} step={.25} onChange={rockScale=>update({rockScale})}/>
          <Numeric label="Scatter seed" value={document.seed} min={0} max={4294967295} onChange={seed=>update({seed:Math.round(seed)})}/>
        </div>
        <p className="cad-terrain-panel__help">Procedural proxy vegetation; not claimed as survey or aerial imagery.</p>
      </section>
      <section className="cad-terrain-panel__section">
        <strong className="cad-terrain-panel__section-title">Terrain document</strong>
        <div className="cad-terrain-panel__button-grid cad-terrain-panel__button-grid--three">
          <button type="button" onClick={download} className="cad-terrain-panel__button is-primary">Export JSON</button>
          <button type="button" onClick={()=>importRef.current?.click()} className="cad-terrain-panel__button">Import JSON</button>
          <button type="button" onClick={()=>{onChange(resetDocument);setSelectedId(resetDocument.landforms[0]?.id||'');setMessage('Restored this project’s initial terrain settings.')}}
            className="cad-terrain-panel__button">Reset</button>
        </div>
        <button type="button" onClick={()=>elevationRef.current?.click()} className="cad-terrain-panel__button is-wide">Import sampled elevation grid (.csv, metres)</button>
        <input ref={elevationRef} type="file" accept=".csv,text/csv,text/plain" className="cad-terrain-panel__hidden-input"
          onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void importElevation(file);e.currentTarget.value='';}}/>
        <input ref={importRef} type="file" accept=".json,application/json" className="cad-terrain-panel__hidden-input"
          onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void importFile(file);e.currentTarget.value='';}}/>
        <p className="cad-terrain-panel__help">Export creates a real editable project artifact. Terrain edits update the CAD project document and are saved with its next revision.</p>
        {message&&<p role="status" className="cad-terrain-panel__status">{message}</p>}
      </section>
    </div>
  </aside>;
}
