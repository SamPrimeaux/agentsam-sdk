import {useRef,useState} from 'react';
import {addLandform,createTerrainDocument,validateTerrainDocument,
  type Landform,type GroundCover,type SculptMode,type TerrainDocument} from '../lib/world-terrain';

type Props = {
  document: TerrainDocument;
  onChange(value: TerrainDocument): void;
  sculptMode: SculptMode | null;
  onSculptMode(value: SculptMode | null): void;
  brushRadius: number;
  onBrushRadius(value: number): void;
  brushStrength: number;
  onBrushStrength(value: number): void;
  onClose(): void;
  onFitSite(): void;
};

function Numeric({label,value,onChange,min,max,step=1}:{
  label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number
}) {
  return <label className="flex min-w-0 flex-col gap-1 text-[length:var(--text-sm)] text-slate-300">
    <span>{label}</span>
    <input type="number" value={value} step={step} min={min} max={max}
      onChange={e=>{const n=e.currentTarget.valueAsNumber;
        if(Number.isFinite(n)&&(!Number.isFinite(min)||n>=min!)&&(!Number.isFinite(max)||n<=max!))onChange(n);}}
      className="min-w-0 w-full rounded border border-white/20 bg-slate-900 px-2 py-1.5 text-xs text-slate-100" />
  </label>;
}
const covers:GroundCover[]=['woodland','meadow','rock','arid'];

export function TerrainEditorPanel({document,onChange,sculptMode,onSculptMode,
  brushRadius,onBrushRadius,brushStrength,onBrushStrength,onClose,onFitSite}:Props){
  const [selectedId,setSelectedId]=useState(document.landforms[0]?.id||'');
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
  return <aside className="pointer-events-auto absolute right-3 top-16 z-30 flex max-h-[calc(100%-7rem)] w-[min(345px,calc(100vw-5rem))] flex-col rounded-xl border border-white/20 bg-[#101a2b]/95 text-slate-100 shadow-2xl backdrop-blur-md"
    aria-label="Site terrain editor">
    <header className="flex items-center justify-between border-b border-white/15 px-3 py-2">
      <div><h3 className="font-semibold text-sm">Site &amp; Terrain</h3>
      <p className="text-[length:var(--text-xs)] text-slate-400">Metric landforms · editable scene geometry</p></div>
      <button type="button" onClick={onClose} aria-label="Close terrain tools" className="rounded p-2 hover:bg-white/10">×</button>
    </header>
    <div className="space-y-3 overflow-auto px-3 py-3 text-xs">
      <section className="space-y-2">
        <div className="flex justify-between items-center gap-2"><strong className="text-slate-200">World scale</strong>
          <button type="button" onClick={onFitSite} className="rounded border border-white/20 px-2 py-1.5 hover:bg-white/10">Fit entire site</button></div>
        <div className="grid grid-cols-2 gap-2">
          <Numeric label="Site width (m)" value={document.width} min={20} max={20000} step={10} onChange={width=>update({width})}/>
          <Numeric label="Site depth (m)" value={document.depth} min={20} max={20000} step={10} onChange={depth=>update({depth})}/>
          <Numeric label="Protected pad (m)" value={document.protectedRadius} min={0} max={500} onChange={protectedRadius=>update({protectedRadius})}/>
          <Numeric label="Terrain detail" value={document.resolution} min={16} max={256} onChange={resolution=>update({resolution:Math.round(resolution)})}/>
        </div>
        <p className="text-[length:var(--text-xs)] text-slate-400">All distances are metres. The BIM building and its internal geometry are never rescaled by these controls.</p>
      </section>
      <section className="space-y-2 border-t border-white/15 pt-3">
        <div className="flex items-center justify-between gap-2"><strong>Landforms</strong><span className="text-slate-400">{document.landforms.length} objects</span></div>
        <div className="grid grid-cols-3 gap-1">
          {(['mountain','hill','valley'] as const).map(kind=>
            <button type="button" key={kind} onClick={()=>add(kind)} className="rounded border border-white/20 px-2 py-1.5 capitalize hover:bg-sky-700/50">+ {kind}</button>)}
        </div>
        <select aria-label="Selected landform" className="w-full rounded border border-white/20 bg-slate-900 px-2 py-2" value={selected?.id||''} onChange={e=>setSelectedId(e.target.value)}>
          {document.landforms.map(form=><option value={form.id} key={form.id}>{form.id} · {form.kind}</option>)}
        </select>
        {selected&&<div className="grid grid-cols-2 gap-2">
          <Numeric label="X (m)" value={selected.x} step={1} onChange={x=>updateLandform({x})}/>
          <Numeric label="Z (m)" value={selected.z} step={1} onChange={z=>updateLandform({z})}/>
          <Numeric label="Width radius (m)" value={selected.radiusX} min={1} max={10000} onChange={radiusX=>updateLandform({radiusX})}/>
          <Numeric label="Depth radius (m)" value={selected.radiusZ} min={1} max={10000} onChange={radiusZ=>updateLandform({radiusZ})}/>
          <Numeric label="Elevation (m)" value={selected.elevation} min={-3000} max={3000} onChange={elevation=>updateLandform({elevation})}/>
          <Numeric label="Rotation (degrees)" value={selected.rotation} step={5} onChange={rotation=>updateLandform({rotation})}/>
          <Numeric label="Peak sharpness" value={selected.sharpness} min={.25} max={6} step={.1} onChange={sharpness=>updateLandform({sharpness})}/>
          <button type="button" onClick={()=>{update({landforms:document.landforms.filter(form=>form.id!==selected.id)});setSelectedId('');}}
            className="self-end rounded border border-rose-400/40 px-2 py-1.5 text-rose-200 hover:bg-rose-500/20">Remove landform</button>
        </div>}
      </section>
      <section className="space-y-2 border-t border-white/15 pt-3">
        <strong>Sculpt on terrain</strong>
        <div className="grid grid-cols-4 gap-1">
          {(['raise','lower','flatten','smooth'] as const).map(kind=><button type="button" key={kind} aria-pressed={sculptMode===kind}
            onClick={()=>onSculptMode(sculptMode===kind?null:kind)}
            className={'rounded border px-1 py-1.5 capitalize '+(sculptMode===kind?'border-sky-400 bg-sky-700':'border-white/20 hover:bg-white/10')}>{kind}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Numeric label="Brush radius (m)" value={brushRadius} min={1} max={100} onChange={onBrushRadius}/>
          <Numeric label="Brush strength (m)" value={brushStrength} min={.01} max={50} step={.25} onChange={onBrushStrength}/>
        </div>
        <p className="text-[length:var(--text-xs)] text-slate-400">Click and drag over the landscape to sculpt. Disable sculpt to inspect or orbit. Undo the latest brush using the button below.</p>
        <button type="button" disabled={!document.strokes.length} onClick={()=>update({strokes:document.strokes.slice(0,-1)})}
          className="rounded border border-white/20 px-2 py-1.5 disabled:opacity-40">Undo sculpt ({document.strokes.length})</button>
      </section>
      <section className="space-y-2 border-t border-white/15 pt-3">
        <strong>Landscape scenery</strong>
        <label className="flex items-center justify-between gap-2">Ground material
          <select value={document.cover} onChange={e=>update({cover:e.target.value as GroundCover})}
            className="rounded border border-white/20 bg-slate-900 px-2 py-1.5">
            {covers.map(cover=><option key={cover} value={cover}>{cover}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Numeric label="Tree instances" value={document.treeCount} min={0} max={2500} step={10} onChange={treeCount=>update({treeCount:Math.round(treeCount)})}/>
          <Numeric label="Rock instances" value={document.rockCount} min={0} max={2500} step={10} onChange={rockCount=>update({rockCount:Math.round(rockCount)})}/>
          <Numeric label="Tree scale" value={document.treeScale} min={.1} max={12} step={.25} onChange={treeScale=>update({treeScale})}/>
          <Numeric label="Rock scale" value={document.rockScale} min={.1} max={12} step={.25} onChange={rockScale=>update({rockScale})}/>
          <Numeric label="Scatter seed" value={document.seed} min={0} max={4294967295} onChange={seed=>update({seed:Math.round(seed)})}/>
        </div>
        <p className="text-[length:var(--text-xs)] text-slate-400">Procedural proxy vegetation; not claimed as survey or aerial imagery.</p>
      </section>
      <section className="space-y-2 border-t border-white/15 pt-3">
        <strong>Terrain document</strong>
        <div className="grid grid-cols-3 gap-1">
          <button type="button" onClick={download} className="rounded bg-sky-700 px-2 py-2">Export JSON</button>
          <button type="button" onClick={()=>importRef.current?.click()} className="rounded border border-white/20 px-2 py-2">Import JSON</button>
          <button type="button" onClick={()=>{onChange(createTerrainDocument(document.baseElevation));setSelectedId('north-ridge')}}
            className="rounded border border-white/20 px-2 py-2">Reset</button>
        </div>
        <button type="button" onClick={()=>elevationRef.current?.click()} className="w-full rounded border border-white/20 px-2 py-2 text-left">Import sampled elevation grid (.csv, metres)</button>
        <input ref={elevationRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
          onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void importElevation(file);e.currentTarget.value='';}}/>
        <input ref={importRef} type="file" accept=".json,application/json" className="hidden"
          onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void importFile(file);e.currentTarget.value='';}}/>
        <p className="text-[length:var(--text-xs)] text-slate-400">Export creates a real editable project artifact. Cloud revision save is not connected to terrain documents yet.</p>
        {message&&<p role="status" className="text-[length:var(--text-sm)] text-sky-200">{message}</p>}
      </section>
    </div>
  </aside>;
}
