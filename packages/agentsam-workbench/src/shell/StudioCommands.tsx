import type {ReactNode} from 'react';
import {icon} from './studio-icons';
import {ChevronDown} from 'lucide-react';

export function StudioToolButton({label,icon,active,disabled,onRun,children}:{
  label:string; icon:ReactNode; active?:boolean; disabled?:boolean; onRun():void; children?:ReactNode;
}) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active}
    className={active?'active':undefined} disabled={disabled} onClick={onRun}>{icon}{children}</button>;
}

export function StudioCommandMenu({label,icon,children,className,popoverClassName,active}:{
  label:string; icon:ReactNode; children:ReactNode; className?:string; popoverClassName?:string; active?:boolean;
}) {
  return <details className={className}><summary aria-label={label} title={label} className={active?'active':undefined}>
    {icon}<ChevronDown size={11} aria-hidden="true"/></summary>
    <div className={popoverClassName} role="group" aria-label={label}>{children}</div>
  </details>;
}

export function StudioCommandItem({icon,label,onRun,active,disabled,shortcut}:{
  icon:ReactNode; label:string; onRun():void; active?:boolean; disabled?:boolean; shortcut?:string;
}) {
  return <button type="button" aria-pressed={active} disabled={disabled} onClick={event=>{
    event.currentTarget.closest('details')?.removeAttribute('open');
    onRun();
  }}>{icon}{label}{shortcut&&<kbd>{shortcut}</kbd>}</button>;
}

export function StudioGlyph({name,size=17}:{name:string;size?:number}) {
  return <span aria-hidden="true" style={{display:'inline-flex'}} dangerouslySetInnerHTML={{__html:icon(name,size)}}/>;
}
