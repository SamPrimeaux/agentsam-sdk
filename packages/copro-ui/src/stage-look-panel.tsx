import React, {useState} from 'react';
import { CloudSun, Layers3, RotateCcw, SlidersHorizontal, Sparkles, Sun, Check } from 'lucide-react';
import {
  STAGE_ENVIRONMENT_DEFAULTS as defaults,
  STAGE_SKIES,
  STAGE_FINISHES,
  STAGE_MOODS,
  stageLookBackground,
  type CoProStageEnvironment,
} from './stage-environment.js';

type StageLookPanelProps = {
  environment?: CoProStageEnvironment;
  onChange: (patch:CoProStageEnvironment|null)=>void;
};

const FINISH_GROUPS = ['All', 'Metal', 'Stone', 'Dark'] as const;
const FINISH_GROUP: Record<string, (typeof FINISH_GROUPS)[number]> = {
  gold:'Metal','cryo-titanium':'Metal',copper:'Metal',carbon:'Dark',
  calacatta:'Stone',marquina:'Stone',basalt:'Dark',
};

function ControlledSlider({label,value,min,max,step,format,onChange}: {
  label:string;value:number;min:number;max:number;step:number;
  format:(value:number)=>string;onChange:(value:number)=>void;
}) {
  return <label className="mm-look-slider">
    <span><strong>{label}</strong><output>{format(value)}</output></span>
    <input type="range" min={min} max={max} step={step} value={value}
      aria-label={label} onChange={event=>onChange(Number(event.currentTarget.value))}/>
  </label>;
}

function LookToggle({label,detail,checked,onChange}: {
  label:string;detail:string;checked:boolean;onChange:(value:boolean)=>void;
}) {
  return <label className="mm-look-toggle">
    <span><strong>{label}</strong><small>{detail}</small></span>
    <input type="checkbox" checked={checked} onChange={event=>onChange(event.currentTarget.checked)}/>
  </label>;
}

export function CoProStageLookPanel({environment,onChange}:StageLookPanelProps) {
  const [finishGroup,setFinishGroup]=useState<(typeof FINISH_GROUPS)[number]>('All');
  const current={...defaults,...environment};
  const sky=STAGE_SKIES.find(entry=>entry.id===current.skyPreset) || STAGE_SKIES[0];
  const selectedFinish=STAGE_FINISHES.find(entry=>entry.id===current.finish) || STAGE_FINISHES[1];
  const update=<K extends keyof CoProStageEnvironment>(key:K,value:CoProStageEnvironment[K])=>onChange({[key]:value});
  return <div className="mm-stage-look" aria-label="Stage look and lighting browser">
    <header className="mm-look-header">
      <div className="mm-look-eyebrow"><Sun size={13}/> STAGE LOOK <span>PROJECT</span></div>
      <div className="mm-look-title-row"><div><h2>Sky, light &amp; materials</h2><p>Scene atmosphere and composition finishes</p></div>
        <button type="button" title="Reset stage look" aria-label="Reset stage look" onClick={()=>onChange(null)}><RotateCcw size={15}/></button>
      </div>
    </header>

    <section className="mm-look-card mm-look-live-card" aria-label="Live stage appearance">
      <div className="mm-look-card-head"><span>LIVE STAGE LOOK</span><small>Changes update the project preview</small></div>
      <div className="mm-look-scene-sample" style={{background:stageLookBackground(current) ?? current.background,filter:`brightness(${current.ambient})`}} aria-hidden="true">
        <span className="mm-look-scene-orbit" style={{background:selectedFinish.swatch}}/>
        <span className="mm-look-scene-horizon" />
      </div>
      <div className="mm-look-scene-caption"><span><strong>{sky.name}</strong><small>Atmosphere</small></span><span><strong>{selectedFinish.name}</strong><small>Stage finish</small></span></div>
    </section>

    <section className="mm-look-card" aria-label="Sky presets">
      <div className="mm-look-card-head"><span><CloudSun size={13}/> SKY DOME &amp; ATMOSPHERE</span><small>{STAGE_SKIES.length} looks</small></div>
      <div className="mm-look-sky-grid">
        {STAGE_SKIES.map(item=><button type="button" key={item.id}
          className={'mm-look-sky-preset'+(current.skyPreset===item.id?' is-active':'')}
          aria-pressed={current.skyPreset===item.id} onClick={()=>onChange({skyPreset:item.id})}>
          <span className="mm-look-sky-preset-preview" style={{background:stageLookBackground({...current,skyPreset:item.id,glow:true})}}>
            <i style={{background:item.glow}}/>
          </span>
          <strong>{item.name}</strong><small>{item.note}</small>
          {current.skyPreset===item.id&&<Check size={13} className="mm-look-sky-check"/>}
        </button>)}
      </div>
      <div className="mm-look-card-inner mm-look-grid-controls">
        <LookToggle label="Stars" detail="Backdrop star points" checked={current.stars} onChange={value=>update('stars',value)}/>
        <LookToggle label="Light glow" detail="Soft horizon lighting" checked={current.glow} onChange={value=>update('glow',value)}/>
      </div>
      <ControlledSlider label="Cloud density" value={current.cloudDensity} min={0} max={1} step={.02} format={v=>`${Math.round(v*100)}%`} onChange={value=>update('cloudDensity',value)}/>
    </section>

    <section className="mm-look-card" aria-label="Stage material finishes">
      <div className="mm-look-card-head"><span><Layers3 size={13}/> MATERIAL &amp; FINISH LIBRARY</span><small>Stage surface</small></div>
      <div className="mm-look-finish-filters" role="group" aria-label="Material groups">
        {FINISH_GROUPS.map(group=><button type="button" key={group} aria-pressed={finishGroup===group} className={finishGroup===group?'is-active':''} onClick={()=>setFinishGroup(group)}>{group}</button>)}
      </div>
      <div className="mm-look-finish-list">
        {STAGE_FINISHES.filter(item=>finishGroup==='All'||FINISH_GROUP[item.id]===finishGroup).map(item=><button type="button" key={item.id}
          className={'mm-look-finish'+(current.finish===item.id?' is-active':'')} aria-pressed={current.finish===item.id}
          onClick={()=>onChange({finish:item.id})}>
          <span className="mm-look-finish-swatch" style={{background:item.swatch}}/>
          <span className="mm-look-finish-description"><strong>{item.name}</strong><small>{item.note}</small></span>
          {current.finish===item.id&&<Check size={15}/>}
        </button>)}
      </div>
      <p className="mm-look-note">These swatches style the composition stage; they do not change a GLB object's PBR material.</p>
    </section>

    <section className="mm-look-card" aria-label="Dynamic lighting">
      <div className="mm-look-card-head"><span><Sun size={13}/> DYNAMIC LIGHTING</span><button type="button" onClick={()=>onChange({ambient:1,lightHue:37,shadowSoftness:2.5,keyAngle:35})}>Reset lights</button></div>
      <div className="mm-look-control-stack">
        <ControlledSlider label="Light intensity" value={current.ambient} min={.2} max={2.5} step={.05} format={v=>`${v.toFixed(2)}×`} onChange={value=>update('ambient',value)}/>
        <ControlledSlider label="Ambient hue" value={current.lightHue} min={0} max={360} step={1} format={v=>`${v}°`} onChange={value=>update('lightHue',value)}/>
        <ControlledSlider label="Shadow softness" value={current.shadowSoftness} min={.5} max={10} step={.5} format={v=>`${v.toFixed(1)} px`} onChange={value=>update('shadowSoftness',value)}/>
        <ControlledSlider label="Key light angle" value={current.keyAngle} min={-90} max={180} step={5} format={v=>`${v}°`} onChange={value=>update('keyAngle',value)}/>
        <label className="mm-look-color-control"><span>Atmosphere tint</span><input type="color" aria-label="Atmosphere tint" value={current.fogColor} onChange={event=>update('fogColor',event.currentTarget.value)}/></label>
        <ControlledSlider label="Atmosphere density" value={current.fogOpacity} min={0} max={.8} step={.02} format={v=>`${Math.round(v*100)}%`} onChange={value=>update('fogOpacity',value)}/>
        <LookToggle label="Stage grid" detail="Show alignment guides" checked={current.showGrid} onChange={value=>update('showGrid',value)}/>
      </div>
    </section>

    <section className="mm-look-card" aria-label="Atmosphere mood presets">
      <div className="mm-look-card-head"><span><Sparkles size={13}/> ATMOSPHERE MOOD PRESETS</span><small>One tap</small></div>
      <div className="mm-look-mood-row">
        {STAGE_MOODS.map(mood=><button type="button" key={mood.id}
          className={current.skyPreset===mood.skyPreset && current.finish===mood.finish?'is-active':''}
          onClick={()=>onChange({skyPreset:mood.skyPreset,finish:mood.finish,ambient:mood.ambient,cloudDensity:mood.cloudDensity,glow:mood.glow,stars:mood.stars,lightHue:mood.lightHue})}>{mood.name}</button>)}
      </div>
    </section>
    <footer className="mm-look-footer"><SlidersHorizontal size={13}/><span>Stored with this CoPro project · undo / redo supported</span></footer>
  </div>;
}
