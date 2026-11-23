import {IconAction} from './icon-action.js';
import { CoProRangeControl } from './panel-controls.js';
import React, {useState} from 'react';
import { CloudSun, Layers3, RotateCcw, SlidersHorizontal, Sparkles, Sun, Check } from 'lucide-react';
import {
  STAGE_ENVIRONMENT_DEFAULTS as defaults,
  STAGE_SKIES,
  STAGE_FINISHES,
  STAGE_MOODS,
  stageLookBackground,
  type CoProStageEnvironment,
  type StageSky,
} from './stage-environment.js';

type StageLookPanelProps = {
  environment?: CoProStageEnvironment;
  videoSources?:Array<{id:string;name:string}>;
  /** Sky looks to offer; defaults to the built-in set when the registry is unavailable. */
  skies?:readonly StageSky[];
  skyDefaults?:Record<string,Pick<CoProStageEnvironment,'skyProgression'|'cloudDensity'|'starIntensity'|'galaxyIntensity'|'auroraIntensity'|'stars'>>;
  onChange: (patch:CoProStageEnvironment|null)=>void;
};

const FINISH_GROUPS = ['All', 'Metal', 'Stone', 'Dark'] as const;
const FINISH_GROUP: Record<string, (typeof FINISH_GROUPS)[number]> = {
  gold:'Metal','cryo-titanium':'Metal',copper:'Metal',carbon:'Dark',
  calacatta:'Stone',marquina:'Stone',basalt:'Dark',
};

function LookToggle({label,detail,checked,onChange}: {
  label:string;detail:string;checked:boolean;onChange:(value:boolean)=>void;
}) {
  return <label className="mm-look-toggle">
    <span><strong>{label}</strong><small>{detail}</small></span>
    <input type="checkbox" checked={checked} onChange={event=>onChange(event.currentTarget.checked)}/>
  </label>;
}

export function CoProStageLookPanel({environment,onChange,videoSources=[],skyDefaults={},skies}:StageLookPanelProps) {
  const skyList=skies?.length?skies:STAGE_SKIES;
  const [activeSection,setActiveSection]=useState<'scene'|'environment'|'lighting'|'materials'>('environment');
  const [finishGroup,setFinishGroup]=useState<(typeof FINISH_GROUPS)[number]>('All');
  const current={...defaults,...(skyDefaults[environment?.skyPreset??defaults.skyPreset]??{}),...environment};
  const sky=skyList.find(entry=>entry.id===current.skyPreset) || skyList[0];
  const fogColor=environment?.fogColor??sky?.bottom??defaults.fogColor;
  const selectedFinish=STAGE_FINISHES.find(entry=>entry.id===current.finish);
  const update=<K extends keyof CoProStageEnvironment>(key:K,value:CoProStageEnvironment[K])=>onChange({[key]:value});
  return <div className="mm-stage-look" aria-label="Scene settings">
    <header className="mm-look-header">
      <div className="mm-look-eyebrow"><Sun size={13}/> SCENE <span>PROJECT</span></div>
      <div className="mm-look-title-row"><p>Project-owned settings · live preview</p>
        <IconAction title="Reset scene settings" aria-label="Reset scene settings" onClick={()=>onChange(null)}><RotateCcw size={15}/></IconAction>
      </div>
    </header>
    <nav className="mm-scene-tabs" aria-label="Scene settings categories">
      {([
        ['scene','Scene',Layers3],['environment','Environment',CloudSun],
        ['lighting','Lighting',Sun],['materials','Model finish',SlidersHorizontal],
      ] as const).map(([id,label,Icon])=><button type="button" key={id}
        aria-current={activeSection===id?'page':undefined} className={activeSection===id?'is-active':''}
        onClick={()=>setActiveSection(id)}><Icon size={15}/><span>{label}</span></button>)}
    </nav>
    {activeSection==='scene' && <>
    <section className="mm-look-card mm-look-live-card" aria-label="Active 3D environment">
      <div className="mm-look-card-head"><span>ACTIVE SCENE ENVIRONMENT</span><small>Live</small></div>
      <div className="mm-scene-environment-summary">
        <strong>{sky.name}</strong>
        <span>SamScene procedural sky, direct in the editable 3D viewport</span>
        <small>{selectedFinish?.name??"Original GLB materials"} · {current.showGrid?"Grid on":"Grid off"}</small>
      </div>
      <div className="mm-look-control-stack">
        <LookToggle label="Viewport grid" detail="Display the ground alignment grid" checked={current.showGrid} onChange={value=>update('showGrid',value)}/>

      </div>
    </section>

    </>}
    {activeSection==='environment' && <>
    <section className="mm-look-card mm-look-sky-video" aria-label="Scene background video">
      <div className="mm-look-card-head"><span><CloudSun size={13}/> BACKGROUND VIDEO PLATE</span><small>Imported media</small></div>
      <p className="mm-look-sky-video-note">Use footage behind editable 3D geometry. This is a video plate, not a 360° sky dome or replacement for the procedural atmosphere.</p>
      <label className="mm-look-sky-video-picker"><span>Source</span>
        <select aria-label="3D scene background video" value={current.skyVideoAssetId??''} onChange={event=>update('skyVideoAssetId',event.currentTarget.value)}>
          <option value="">Procedural sky</option>
          {videoSources.map(media=><option key={media.id} value={media.id}>{media.name}</option>)}
        </select>
      </label>
      {!videoSources.length&&<small className="mm-look-sky-video-hint">Import a video in Media to use it as a scene background.</small>}
    </section>

    <section className="mm-look-card" aria-label="Sky presets">
      <div className="mm-look-card-head"><span><CloudSun size={13}/> SAMSCENE SKY GENERATOR</span><small>{skyList.length} looks</small></div>
      <div className="mm-look-sky-grid">
        {skyList.map(item=><button type="button" key={item.id}
          className={'mm-look-sky-preset'+(current.skyPreset===item.id?' is-active':'')}
          aria-pressed={current.skyPreset===item.id} onClick={()=>onChange({skyPreset:item.id,...(skyDefaults[item.id]??{})})}>
          <span className="mm-look-sky-preset-preview" data-preview={item.previewUrl?"":undefined}
            style={{"--mm-sky-bg":stageLookBackground({...current,skyPreset:item.id,glow:true},skyList),"--mm-sky-image":item.previewUrl?`url(${item.previewUrl})`:undefined} as React.CSSProperties}>
            {!item.previewUrl&&<i style={{"--mm-sky-glow":item.glow} as React.CSSProperties}/>}
          </span>
          <strong>{item.name}</strong><small>{item.note}</small>
          {current.skyPreset===item.id&&<Check size={13} className="mm-look-sky-check"/>}
        </button>)}
      </div>
      <div className="mm-look-card-inner mm-look-grid-controls">
        <LookToggle label="Starfield visible" detail="Show or hide stars without changing intensity" checked={current.stars} onChange={value=>update('stars',value)}/>
        <LookToggle label="Light glow" detail="Soft sun halo and cloud lighting" checked={current.glow} onChange={value=>update('glow',value)}/>
      </div>
      <div className="mm-look-control-stack mm-look-sky-controls">
        <CoProRangeControl className="mm-look-slider" label="Sky time / phase" value={current.skyProgression??.36} min={0} max={1} step={.01} format={v=>Math.round(v*100)+"%"} onCommit={value=>update('skyProgression',value)}/>
        <CoProRangeControl className="mm-look-slider" label="Cloud density" value={current.cloudDensity} min={0} max={1} step={.02} format={v=>Math.round(v*100)+"%"} onCommit={value=>update('cloudDensity',value)}/>
        <CoProRangeControl className="mm-look-slider" label="Galaxy & nebula" value={current.galaxyIntensity??.25} min={0} max={1} step={.02} format={v=>Math.round(v*100)+"%"} onCommit={value=>update('galaxyIntensity',value)}/>
        <CoProRangeControl className="mm-look-slider" label="Polar aurora" value={current.auroraIntensity??.14} min={0} max={1} step={.02} format={v=>Math.round(v*100)+"%"} onCommit={value=>update('auroraIntensity',value)}/>
        <CoProRangeControl className="mm-look-slider" label="Star intensity" value={current.starIntensity??.8} min={0} max={1} step={.02} format={v=>Math.round(v*100)+"%"} onCommit={value=>update('starIntensity',value)}/>
      </div>
    </section>

    </>}
    {activeSection==='materials' && <>
    <section className="mm-look-card" aria-label="Scene model finishes">
      <div className="mm-look-card-head"><span><Layers3 size={13}/> MODEL FINISH OVERRIDE</span><small>Scene-wide</small></div>
      <div className="mm-look-finish-filters" role="group" aria-label="Material groups">
        {FINISH_GROUPS.map(group=><button type="button" key={group} aria-pressed={finishGroup===group} className={finishGroup===group?'is-active':''} onClick={()=>setFinishGroup(group)}>{group}</button>)}
      </div>
      <button type="button" className={'mm-look-finish mm-look-source-finish'+(current.finish==='original'?' is-active':'')}
        aria-pressed={current.finish==='original'} onClick={()=>onChange({finish:'original'})}>
        <span className="mm-look-finish-swatch mm-look-finish-swatch-original"/>
        <span className="mm-look-finish-description"><strong>Original GLB materials</strong><small>Restore the imported mesh materials</small></span>
        {current.finish==='original'&&<Check size={15}/>}
      </button>
      <div className="mm-look-finish-list">
        {STAGE_FINISHES.filter(item=>finishGroup==='All'||FINISH_GROUP[item.id]===finishGroup).map(item=><button type="button" key={item.id}
          className={'mm-look-finish'+(current.finish===item.id?' is-active':'')} aria-pressed={current.finish===item.id}
          onClick={()=>onChange({finish:item.id})}>
          <span className="mm-look-finish-swatch" style={{background:item.swatch}}/>
          <span className="mm-look-finish-description"><strong>{item.name}</strong><small>{item.note}</small></span>
          {current.finish===item.id&&<Check size={15}/>}
        </button>)}
      </div>
      <p className="mm-look-note">Changes the appearance of imported 3D meshes in this project’s preview. The original GLB remains unmodified.</p>
    </section>

    </>}
    {activeSection==='lighting' && <>
    <section className="mm-look-card" aria-label="Dynamic lighting">
      <div className="mm-look-card-head"><span><Sun size={13}/> DYNAMIC LIGHTING</span><button type="button" onClick={()=>onChange({ambient:1,exposure:defaults.exposure,lightHue:37,shadowSoftness:2.5,keyAngle:35})}>Reset lights</button></div>
      <div className="mm-look-control-stack">
        <CoProRangeControl className="mm-look-slider" label="Light intensity" value={current.ambient} min={.2} max={2.5} step={.05} format={v=>`${v.toFixed(2)}×`} onCommit={value=>update('ambient',value)}/>
        <CoProRangeControl className="mm-look-slider" label="Exposure" value={current.exposure} min={.25} max={2.5} step={.05} format={v=>`${v.toFixed(2)}×`} onCommit={value=>update('exposure',value)}/>
        <CoProRangeControl className="mm-look-slider" label="Ambient hue" value={current.lightHue} min={0} max={360} step={1} format={v=>`${v}°`} onCommit={value=>update('lightHue',value)}/>
        <CoProRangeControl className="mm-look-slider" label="Shadow blur" value={current.shadowSoftness} min={.5} max={10} step={.5} format={v=>v.toFixed(1)} onCommit={value=>update('shadowSoftness',value)}/>
        <CoProRangeControl className="mm-look-slider" label="Key light angle" value={current.keyAngle} min={-90} max={180} step={5} format={v=>`${v}°`} onCommit={value=>update('keyAngle',value)}/>
        <label className="mm-look-color-control"><span>Atmosphere tint</span><input type="color" aria-label="Atmosphere tint" value={fogColor} onChange={event=>update('fogColor',event.currentTarget.value)}/></label>
        <CoProRangeControl className="mm-look-slider" label="Atmosphere density" value={current.fogOpacity} min={0} max={.8} step={.02} format={v=>`${Math.round(v*100)}%`} onCommit={value=>update('fogOpacity',value)}/>
      </div>
    </section>

    </>}
    {activeSection==='scene' && <>
    <section className="mm-look-card" aria-label="Atmosphere mood presets">
      <div className="mm-look-card-head"><span><Sparkles size={13}/> ATMOSPHERE MOOD PRESETS</span><small>One tap</small></div>
      <div className="mm-look-mood-row">
        {STAGE_MOODS.map(mood=><button type="button" key={mood.id}
          className={current.skyPreset===mood.skyPreset && current.finish===mood.finish?'is-active':''}
          onClick={()=>onChange({skyPreset:mood.skyPreset,...(skyDefaults[mood.skyPreset]??{}),finish:mood.finish,ambient:mood.ambient,cloudDensity:mood.cloudDensity,glow:mood.glow,stars:mood.stars,lightHue:mood.lightHue})}>{mood.name}</button>)}
      </div>
    </section>
    </>}
    <footer className="mm-look-footer"><SlidersHorizontal size={13}/><span>Project-level scene settings · undo / redo supported</span></footer>
  </div>;
}
