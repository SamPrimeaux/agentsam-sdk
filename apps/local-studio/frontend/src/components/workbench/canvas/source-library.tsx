import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileCode2, Search, X } from 'lucide-react';

import { IconAction } from '@/components/ui/icon-action';
export type SourceArtboard = {
  id: string; family: string; filename: string; title: string; category: string;
  width: number; height: number; interactive?: boolean;
};
export type ImportedSource = { board: SourceArtboard; html: string; sourceBase: string };
function sourceLocation(board: SourceArtboard) {
  if (!/^[a-z0-9-]{1,80}$/.test(board.family) || !/^[a-z0-9_.-]{1,160}$/i.test(board.filename)) throw new Error('Invalid source path.');
  const sourceBase = '/design-canvas/sources/' + board.family + '/';
  return { sourceBase, url: sourceBase + encodeURIComponent(board.filename) };
}
export function SourceArtboardLibrary({open,onClose,onImport}: {
  open: boolean; onClose: () => void; onImport: (source: ImportedSource) => void;
}) {
  const [boards,setBoards] = useState<SourceArtboard[]>([]);
  const [query,setQuery] = useState('');
  const [family,setFamily] = useState('all');
  const [loading,setLoading] = useState(false);
  const [importing,setImporting] = useState('');
  const [error,setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller=new AbortController();
    setLoading(true);setError('');
    fetch('/design-canvas/sources/manifest.json',{signal:controller.signal,credentials:'same-origin'})
      .then(async response=>{if(!response.ok)throw new Error('Source library unavailable ('+response.status+').');return response.json();})
      .then(manifest=>{if(!Array.isArray(manifest.boards))throw new Error('Source catalog could not be read.');setBoards(manifest.boards.filter((board:SourceArtboard)=>Boolean(board.id&&board.title&&board.family&&board.filename)));})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Could not read source library.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[open]);
  const families=useMemo(()=>[...new Set(boards.map(board=>board.family))], [boards]);
  const filtered=useMemo(()=>boards.filter(board=>(family==='all'||board.family===family)&&(board.title+' '+board.category+' '+board.filename).toLowerCase().includes(query.toLowerCase())),[boards,family,query]);
  async function importBoard(board:SourceArtboard) {
    setImporting(board.id);setError('');
    try {
      const {url,sourceBase}=sourceLocation(board);
      const response=await fetch(url,{credentials:'same-origin'});
      if(!response.ok)throw new Error('Cannot open '+board.title+' ('+response.status+').');
      const html=await response.text();
      if(!/^\s*(?:<!doctype\s+html|<html\b)/i.test(html)||!/<\/html\s*>/i.test(html))throw new Error('This source is not a complete HTML document.');
      if(html.length>200000)throw new Error('This source exceeds the maximum HTML artboard size of 200 KB.');
      onImport({board,html,sourceBase});onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to import source.');}
    finally{setImporting('');}
  }
  if(!open)return null;
  return <div className="cv-modal-backdrop" onPointerDown={event=>{if(event.currentTarget===event.target)onClose();}}>
    <section className="cv-modal cv-source-library" role="dialog" aria-modal="true" aria-labelledby="canvas-sources-title">
      <header><h2 id="canvas-sources-title">Source artboards</h2><IconAction type="button" label="Close source library" onClick={onClose}><X size={18}/></IconAction></header>
      <p className="cv-source-intro">Import source-backed HTML into this account-owned Canvas. It becomes editable source, participates in undo, and can be saved with your document.</p>
      <div className="cv-source-search"><Search size={14}/><input autoFocus type="search" aria-label="Search source artboards" placeholder="Find a screen…" value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="Filter source sets" value={family} onChange={event=>setFamily(event.target.value)}><option value="all">All sources</option>{families.map(id=><option key={id} value={id}>{id}</option>)}</select></div>
      {loading?<p role="status">Loading source artboards…</p>:null}
      {error?<p role="alert">{error}</p>:null}
      <div className="cv-source-list">{filtered.map(board=><button type="button" key={board.id} disabled={Boolean(importing)} onClick={()=>void importBoard(board)}><FileCode2 size={18}/><span><strong>{board.title}</strong><small>{board.family} · {board.width} × {board.height}{board.interactive?' · Interactive':''}</small></span><span>{importing===board.id?'Importing…':<ArrowRight size={15}/>}</span></button>)}{!loading&&!filtered.length?<p>No matching source artboards.</p>:null}</div>
    </section>
  </div>;
}
