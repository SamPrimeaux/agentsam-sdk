import {useEffect,useState} from 'react';
import {Clapperboard} from 'lucide-react';
import type {CadCameraBeat,ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {savedDimension,rememberDimension} from '../lib/workbench-layout';
import {ResizableStageHandle,StudioGlyph,StudioToolButton} from '@inneranimalmedia/agentsam-workbench/shell';
import {useWorldView,worldView,type WorldViewPreset} from '../lib/world-view-store';

const views = [{id:'iso',label:'Isometric'},{id:'plan',label:'Top'},{id:'front',label:'Front'},{id:'side',label:'Side'}];
const empty: CadCameraBeat[] = [];

export function CadSequenceDock({project,readOnly,onChange,onClose}:{
  project:ProjectState;readOnly:boolean;onChange(update:(previous:ProjectState)=>ProjectState):void;onClose():void;
}) {
  const world=useWorldView();
  const beats=project.sceneSettings?.cameraSequence??empty;
  const cameras=world.kind==='world'?[...views,...world.cameras]:world.cameras;
  const [height,setHeight]=useState(()=>savedDimension('timeline-height',144,80,600));
  useEffect(()=>rememberDimension('timeline-height',height),[height]);
  const [playing,setPlaying]=useState<number|null>(null);
  const available=world.active&&world.ready;
  const canPlay=available&&beats.length>0&&beats.every(beat=>cameras.some(camera=>camera.id===beat.view));
  const edit=(update:(items:CadCameraBeat[])=>CadCameraBeat[])=>{
    if(readOnly)return;
    setPlaying(null);
    onChange(previous=>({...previous,sceneSettings:{...previous.sceneSettings,
      cameraSequence:update(previous.sceneSettings?.cameraSequence??[])}}));
  };
  const show=(view:string)=>{
    if(world.kind==='world'&&views.some(item=>item.id===view))worldView.setView(view as WorldViewPreset);
    else worldView.setCamera(view);
  };
  useEffect(()=>{
    if(playing===null)return;
    if(!canPlay||!beats[playing]){setPlaying(null);return}
    const beat=beats[playing];
    if(beat.transition==='glide'&&world.kind==='world')worldView.transitionCamera(beat.view,beat.duration);
    else show(beat.view);
    const timer=window.setTimeout(()=>setPlaying(playing+1<beats.length?playing+1:null),beat.duration*1000);
    return ()=>{window.clearTimeout(timer);worldView.stopTransition()};
  },[playing,beats,canPlay,world.kind]);
  return <section className="cad-sequence-dock" aria-label="Camera timeline" style={{height}}>
    <ResizableStageHandle label="Resize camera timeline" className="cad-timeline-handle" axis="y" value={height} min={80} max={600}
      onDrag={delta=>setHeight(previous=>Math.max(80,Math.min(600,previous-delta)))} onDoubleClick={()=>setHeight(144)}/>
    <header><strong><Clapperboard size={16}/> Camera timeline</strong>
      <StudioToolButton label="Add camera beat" disabled={readOnly||!available||!cameras.length}
        icon={<StudioGlyph name="plus" size={16}/>} onRun={()=>edit(items=>[...items,{id:crypto.randomUUID(),view:cameras.some(camera=>camera.id===world.cameraId)?world.cameraId:cameras[0].id,duration:3}])}/>
      <StudioToolButton label={playing===null?'Play sequence':'Stop sequence'} disabled={!canPlay}
        icon={playing===null?<StudioGlyph name="play" size={16}/>:<StudioGlyph name="stop" size={16}/>} onRun={()=>setPlaying(playing===null?0:null)}/>
      <StudioToolButton label="Close timeline" icon={<StudioGlyph name="close" size={16}/>} onRun={onClose}/>
    </header>
    <div className="cad-sequence-track">{beats.length===0&&<p>{available?'Add a camera beat to start a sequence.':'Open a 3D viewport to author a camera sequence.'}</p>}
    {beats.map((beat,index)=><fieldset key={beat.id} aria-label={'Camera beat '+(index+1)} data-playing={playing===index}>
      <legend>Beat {index+1}</legend>
      <select aria-label="Camera view" disabled={readOnly} value={beat.view} onChange={event=>{
        const view=event.target.value;edit(items=>items.map(item=>item.id===beat.id?{...item,view}:item))
      }}>{!cameras.some(camera=>camera.id===beat.view)&&<option value={beat.view}>{beat.view} (unavailable)</option>}
      {cameras.map(camera=><option key={camera.id} value={camera.id}>{camera.label}</option>)}</select>
      {world.kind==='world'&&<label>Transition <select aria-label="Beat transition" value={beat.transition??'cut'} disabled={readOnly} onChange={e=>{
        const transition=e.target.value as 'cut'|'glide';edit(items=>items.map(item=>item.id===beat.id?{...item,transition}:item));
      }}><option value="cut">Cut</option><option value="glide">Glide</option></select></label>}
      <label>Seconds <input type="number" min={0.1} max={600} step={0.1} disabled={readOnly} value={beat.duration} onChange={event=>{
        const duration=event.currentTarget.valueAsNumber;
        if(duration>=0.1&&duration<=600)edit(items=>items.map(item=>item.id===beat.id?{...item,duration}:item));
      }}/></label>
      <StudioToolButton label={'Remove beat '+(index+1)} disabled={readOnly} icon={<StudioGlyph name="trash" size={14}/>}
        onRun={()=>edit(items=>items.filter(item=>item.id!==beat.id))}/>
    </fieldset>)}</div>
  </section>;
}
