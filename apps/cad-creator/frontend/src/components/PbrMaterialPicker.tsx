import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {createStudioTextures,PROCEDURAL_PBR_MATERIALS,PROCEDURAL_PBR_MATERIAL_MAP,type ProceduralPbrCategory,type ProceduralPbrMaterialPreset,type StudioTextureSet} from '@inneranimalmedia/agentsam-3d-viewer';

export interface PbrMaterialPickerProps {
  value?:string;
  onChange:(value?:string)=>void;
  disabled?:boolean;
  label?:string;
  restoreLabel?:string;
}

type PreviewTextureKey=Exclude<keyof StudioTextureSet,'dispose'>;
const PREVIEW_TEXTURE_BY_PATTERN:Partial<Record<ProceduralPbrMaterialPreset['patternType'],PreviewTextureKey>>={
  'brushed-metal':'brushedRoughness','walnut-grain':'walnutGrainMap','wood-panel':'walnutGrainMap',
  'veined-marble':'marbleVeinMap','lava-basalt':'lavaFissureMap','architectural-brick':'stoneBump',
  concrete:'stoneBump','polished-concrete':'stoneBump',slate:'stoneBump','anodized-frame':'brushedRoughness',
  'frosted-crystal':'waterRippleBump','iridescent-pearl':'waterRippleBump','hex-carbon':'hexDeckBump','hammered-copper':'hammeredBump',
};

function PbrSwatch({preset,textures}:{preset:ProceduralPbrMaterialPreset;textures:StudioTextureSet|null}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=canvasRef.current,context=canvas?.getContext('2d');
    if(!canvas||!context)return;
    const gradient=context.createLinearGradient(0,0,canvas.width,canvas.height);
    gradient.addColorStop(0,preset.colorHex);gradient.addColorStop(1,preset.secondaryHex);
    context.fillStyle=gradient;context.fillRect(0,0,canvas.width,canvas.height);
    const textureKey=PREVIEW_TEXTURE_BY_PATTERN[preset.patternType];
    const image=textureKey?textures?.[textureKey]?.image as CanvasImageSource|undefined:undefined;
    if(image){
      context.save();context.globalCompositeOperation=preset.category==='metal'?'screen':'multiply';
      context.globalAlpha=preset.category==='metal'?.42:.5;context.drawImage(image,0,0,canvas.width,canvas.height);context.restore();
    }
    if(preset.patternType==='clear-glass'){
      const reflection=context.createLinearGradient(0,0,canvas.width,0);
      reflection.addColorStop(0,'#ffffff00');reflection.addColorStop(.48,'#ffffffa8');reflection.addColorStop(.58,'#ffffff14');reflection.addColorStop(1,'#ffffff00');
      context.fillStyle=reflection;context.fillRect(0,0,canvas.width,canvas.height);
    }
  },[preset,textures]);
  return <canvas ref={canvasRef} className="cad-pbr-swatch" width={96} height={44} aria-hidden="true" data-preset-id={preset.id}/>;
}

export function PbrMaterialPicker({value,onChange,disabled=false,label='PBR material library',restoreLabel='Restore source material'}:PbrMaterialPickerProps){
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState<ProceduralPbrCategory>('all');
  const [textures,setTextures]=useState<StudioTextureSet|null>(null);
  useEffect(()=>{
    try{const next=createStudioTextures(THREE,1);setTextures(next);return()=>next.dispose();}
    catch{return undefined;}
  },[]);
  const results=PROCEDURAL_PBR_MATERIALS.filter(preset=>(category==='all'||preset.category===category)&&
    (preset.label+' '+preset.description).toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="cad-pbr-library"  aria-label={label}>
    <h4>{label}</h4>
    <input type="search" aria-label="Search materials" placeholder="Search materials" value={query} onChange={event=>setQuery(event.target.value)}/>
    <div className="cad-pbr-filters" role="group" aria-label="Material categories">
      {(['all','metal','stone','glass','organic'] as const).map(item=><button key={item} type="button" disabled={disabled}
        aria-pressed={category===item} onClick={()=>setCategory(item)}>{item==='all'?'All':item[0].toUpperCase()+item.slice(1)}</button>)}
    </div>
    <div className="cad-pbr-grid" aria-label="Available PBR finishes">
      {results.map(preset=><button
        key={preset.id} type="button" disabled={disabled} title={preset.description} aria-label={'Apply '+preset.label}
        aria-pressed={value===preset.id} className={'cad-pbr-card'+(value===preset.id?' active':'')}
        onClick={()=>onChange(preset.id)}>
        <PbrSwatch preset={preset} textures={textures}/>
        <span className="cad-pbr-card-label">{preset.label}</span>
      </button>)}
    </div>
    {results.length===0&&<p role="status">No matching materials.</p>}
    <button className="cad-clear-selection" type="button" disabled={disabled||!value} onClick={()=>onChange(undefined)}>{restoreLabel}</button>
  </section>;
}

export function PbrFinishControls({presetId,finish,onChange}:{
  presetId:string;finish?:import('@inneranimalmedia/agentsam-cad-shared').CadFinishSettings;
  onChange(value?:import('@inneranimalmedia/agentsam-cad-shared').CadFinishSettings):void;
}){
  const preset=PROCEDURAL_PBR_MATERIAL_MAP[presetId];
  if(!preset)return null;
  const fields=[['metalness','Metallic'],['roughness','Roughness'],['opacity','Opacity'],['emissiveIntensity','Emission strength']] as const;
  return <section aria-label="Surface properties"><h4>Surface properties</h4>
    {([['colorHex','Base color'],['emissiveHex','Emission color']] as const).map(([key,label])=><label className="cad-property" key={key}>
      <span>{label}</span><input type="color" value={finish?.[key]??preset[key]} onChange={e=>onChange({...finish,[key]:e.target.value})}/>
    </label>)}
    {fields.map(([key,label])=><label key={key} className="cad-property"><span>{label}</span>
      <input type="number" step={0.01} min={0} max={key==='emissiveIntensity'?10:1} key={finish?.[key]??preset[key]??1}
        defaultValue={finish?.[key]??preset[key]??1} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}
        onBlur={e=>{const input=e.currentTarget;if(input.validity.valid&&Number.isFinite(input.valueAsNumber)&&input.valueAsNumber!==(finish?.[key]??preset[key]??1))onChange({...finish,[key]:input.valueAsNumber});else input.value=String(finish?.[key]??preset[key]??1)}}/>
    </label>)}
    {finish&&<button type="button" onClick={()=>onChange(undefined)}>Reset to preset</button>}
  </section>;
}
