/**
 * Reusable virtualized explorer row view, derived from the existing
 * InnerAnimalMedia VirtualizedFileTree windowing behavior.
 * Host adapters own files, permissions, versions and menu actions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceEntry } from '../workspace/files.js';
import { workspaceParents } from '../workspace/tree.js';
import { workspaceTreeWindow } from '../workspace/tree-window.js';

const ROW_HEIGHT=30;
export function WorkspaceTreeView({entries,expanded,active,onFile,onFolder,onMenu}:{
  entries:WorkspaceEntry[];
  expanded:ReadonlySet<string>;
  active:string;
  onFile:(path:string)=>void;
  onFolder:(path:string)=>void;
  onMenu:(entry:WorkspaceEntry,point:{x:number;y:number})=>void;
}) {
  const scrollRef=useRef<HTMLDivElement>(null);
  const [scrollTop,setScrollTop]=useState(0);
  const [viewportHeight,setViewportHeight]=useState(320);
  const onScroll=useCallback(()=>{
    const element=scrollRef.current;
    if(element)setScrollTop(element.scrollTop);
  },[]);
  useEffect(()=>{
    const element=scrollRef.current;
    if(!element)return;
    const update=()=>setViewportHeight(Math.max(1,element.clientHeight||320));
    update();
    if(typeof ResizeObserver!=='undefined'){
      const observer=new ResizeObserver(update);
      observer.observe(element);
      return ()=>observer.disconnect();
    }
    window.addEventListener('resize',update);
    return ()=>window.removeEventListener('resize',update);
  },[]);
  const visible=useMemo(()=>workspaceTreeWindow(entries.length,scrollTop,viewportHeight,ROW_HEIGHT),[entries.length,scrollTop,viewportHeight]);
  return <div ref={scrollRef} className="asi-tree-viewport" role="tree" aria-label="Workspace files"
    onScroll={onScroll} aria-rowcount={entries.length}>
    <div className="asi-tree" style={{height:visible.total,position:'relative'}}>
      {entries.slice(visible.start,visible.end).map((entry,i)=>{
        const folder=entry.kind==='folder';
        const opened=expanded.has(entry.path);
        return <button key={entry.path} type="button" role="treeitem" data-kind={entry.kind}
          aria-level={workspaceParents(entry.path).length+1}
          aria-posinset={visible.start+i+1} aria-setsize={entries.length}
          aria-current={!folder&&active===entry.path} aria-expanded={folder?opened:undefined}
          style={{height:ROW_HEIGHT,top:(visible.start+i)*ROW_HEIGHT,position:'absolute',left:0,right:0,
            paddingLeft:12+workspaceParents(entry.path).length*14}}
          onClick={()=>folder?onFolder(entry.path):onFile(entry.path)}
          onContextMenu={event=>{event.preventDefault();onMenu(entry,{x:event.clientX,y:event.clientY});}}
          title={entry.path}>
          <span aria-hidden="true">{folder?(opened?'▾':'▸'):'▤'}</span>
          <span>{entry.displayName||entry.path.split('/').pop()}</span>
        </button>;
      })}
    </div>
  </div>;
}
