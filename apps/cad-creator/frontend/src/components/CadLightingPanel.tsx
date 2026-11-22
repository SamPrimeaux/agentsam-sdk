import {useState} from 'react';
import type {CadSceneLight} from '@inneranimalmedia/agentsam-cad-shared';

function Scalar({label,value,min,max,onCommit}:{label:string;value:number;min:number;max:number;onCommit:(value:number)=>void}){
  return <label className="cad-property"><span>{label}</span><input type="number" key={value} min={min} max={max} step="any"
    defaultValue={value} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} onBlur={e=>{
      const n=e.currentTarget.valueAsNumber;
      if(Number.isFinite(n)&&n>=min&&n<=max&&n!==value)onCommit(n);
      else e.currentTarget.value=String(value);
    }}/></label>;
}

export function CadLightingPanel({lights,change}:{lights:CadSceneLight[];change:(edit:(lights:CadSceneLight[])=>CadSceneLight[])=>void}){
  const [selected,setSelected]=useState('');
  const [kind,setKind]=useState<CadSceneLight['kind']>('point');
  const light=lights.find(item=>item.id===selected)??lights[0];
  const patch=(values:Partial<CadSceneLight>)=>change(items=>items.map(item=>item.id===light.id?{...item,...values}:item));
  return <section><h4>Scene lights</h4>
    <div className="cad-world-chip-row"><select aria-label="Light type" value={kind} onChange={e=>setKind(e.target.value as CadSceneLight['kind'])}>
      <option value="point">Point</option><option value="spot">Spot</option><option value="directional">Directional</option></select>
      <button type="button" onClick={()=>{
        const id=crypto.randomUUID();change(items=>[...items,{id,name:kind+' '+(items.length+1),kind,color:'#ffffff',
          intensity:kind==='directional'?1:40,position:[0,4,0],target:[0,0,0],range:20,cone:35,shadows:false}]);setSelected(id)
      }}>Add light</button></div>
    {light&&<><label className="cad-property"><span>Light</span><select value={light.id} onChange={e=>setSelected(e.target.value)}>
      {lights.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className="cad-property"><span>Light name</span><input key={light.id+light.name} defaultValue={light.name} maxLength={96} onBlur={e=>{
        const name=e.target.value.trim();if(name&&name!==light.name)patch({name});else e.target.value=light.name
      }}/></label>
      <label className="cad-property"><span>Light color</span><input type="color" value={light.color} onChange={e=>patch({color:e.target.value})}/></label>
      <Scalar label="Intensity" min={0} max={100000} value={light.intensity} onCommit={intensity=>patch({intensity})}/>
      {(['position','target'] as const).filter(key=>key==='position'||light.kind!=='point').map(key=>
        <div key={key}><h4>{key==='position'?'Position (m)':'Target (m)'}</h4>{['X','Y','Z'].map((axis,index)=>
          <Scalar key={axis} label={key+' '+axis} min={-100000} max={100000} value={light[key][index]} onCommit={n=>{
            const vector:[number,number,number]=[...light[key]];vector[index]=n;patch({[key]:vector})
          }}/>)}</div>)}
      {light.kind!=='directional'&&<Scalar label="Range (m)" min={0} max={100000} value={light.range} onCommit={range=>patch({range})}/>}
      {light.kind==='spot'&&<Scalar label="Cone half-angle (°)" min={1} max={90} value={light.cone} onCommit={cone=>patch({cone})}/>}
      <label className="cad-property"><span>Cast shadows</span><input type="checkbox" checked={light.shadows} onChange={e=>patch({shadows:e.target.checked})}/></label>
      <button type="button" onClick={()=>change(items=>items.filter(item=>item.id!==light.id))}>Remove light</button>
    </>}
  </section>;
}
