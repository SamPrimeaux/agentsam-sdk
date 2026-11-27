import {useEffect,useRef,useState} from 'react';
import {ImagePlus, X, Upload, Check} from 'lucide-react';
import {safeWidgetMediaUrl} from '@inneranimalmedia/agentsam-workbench/widgets';
import type {MediaAsset} from '@/components/media/media-utils';
export type WorkspaceMediaChoice={url:string;title:string;mode:'photo'|'video'|'audio'|'ambient'};
export function WorkspaceMediaPicker({onClose,onChoose,wallpaper=false,onPreview}:{onClose:()=>void;onChoose:(choice:WorkspaceMediaChoice)=>void|Promise<void>;wallpaper?:boolean;onPreview?:(url:string|null)=>void}) {
 const [mode,setMode]=useState<WorkspaceMediaChoice['mode']>('photo');
 const [assets,setAssets]=useState<MediaAsset[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [loading,setLoading]=useState(false);
 const [url,setUrl]=useState('');const [title,setTitle]=useState('');const [file,setFile]=useState<File|null>(null);const [objectUrl,setObjectUrl]=useState('');const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(!file){setObjectUrl('');return;}const u=URL.createObjectURL(file);setObjectUrl(u);return()=>URL.revokeObjectURL(u)},[file]);
 const preview=objectUrl||safeWidgetMediaUrl(url);
 useEffect(()=>{onPreview?.(preview||null);},[preview,onPreview]);
 useEffect(()=>{const controller=new AbortController();setAssets([]);setError('');if(mode==='audio'){setLoading(false);return;}setLoading(true);
 const source=mode==='photo'?'cf_images':'stream';
 void fetch('/api/admin/media?source='+source+'&page_size=50',{credentials:'same-origin',signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Media unavailable');if(!controller.signal.aborted)setAssets(Array.isArray(data.assets)?data.assets:[]);}).catch(e=>{if(!controller.signal.aborted)setError(String(e.message).replaceAll('_',' '));}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort();
 },[mode]);
 const selectFile=(f?:File)=>{if(!f)return;if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(f.type)||f.size>10*1024*1024){setError('Choose a JPEG, PNG, WebP, GIF or AVIF image up to 10 MB.');return;}setError('');setFile(f);setTitle(f.name);setUrl('');};
 const apply=async()=>{setBusy(true);setError('');try{let selected=safeWidgetMediaUrl(url);
 if(file){const form=new FormData();form.append('files',file);form.append('folder',wallpaper?'wallpapers':'images');const r=await fetch('/api/admin/media',{method:'POST',credentials:'same-origin',body:form});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Upload failed');selected=safeWidgetMediaUrl(data.assets?.[0]?.url||data.assets?.[0]?.delivery_url);}
 if(!selected)throw Error('Choose a media item or valid delivery URL.');
 await onChoose({url:selected,title:(title||'Media').slice(0,240),mode});}catch(e){setError(e instanceof Error?e.message.replaceAll('_',' '):'Media could not be saved.');}finally{setBusy(false)}};
 return <div className="as-workspace-media-editor" role="dialog" aria-label={wallpaper?'Edit wallpaper':'Choose media'}>
 <header><button type="button" className="as-workspace-round" onClick={onClose} aria-label="Cancel"><X size={20}/></button><strong>{wallpaper?'Edit wallpaper':'Choose media'}</strong><button type="button" className="as-workspace-round" aria-label="Apply" disabled={busy||!preview} onClick={()=>void apply()}><Check size={20}/></button></header>
 {!wallpaper&&<div className="as-workspace-media-modes">{(['photo','video','ambient','audio'] as const).map(m=><button type="button" key={m} aria-pressed={mode===m} onClick={()=>{setMode(m);setFile(null);setUrl('');setLoading(false);}}>{m==='ambient'?'Loop':m}</button>)}</div>}
 <div className="as-workspace-media-preview" onDragOver={e=>{if(mode==='photo')e.preventDefault()}} onDrop={e=>{if(mode==='photo'){e.preventDefault();selectFile(e.dataTransfer.files[0])}}}>
 {preview?mode==='photo'?<img src={preview} alt="Selected image preview"/>:mode==='audio'?<audio src={preview} controls preload="none"/>:<video src={preview} controls playsInline muted={mode==='ambient'} loop={mode==='ambient'} preload="metadata"/>:<><ImagePlus size={30}/><span>{mode==='photo'?'Drop an image or select a photo':'Choose a playable media URL'}</span></>}
 </div>
 {mode==='photo'&&<><input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden onChange={e=>selectFile(e.target.files?.[0])}/><button type="button" className="as-workspace-media-upload" onClick={()=>input.current?.click()}><Upload size={17}/> Choose photo or file</button></>}
 <label className="as-workspace-media-url">Media URL<input value={url} onChange={e=>{setFile(null);setUrl(e.target.value)}} placeholder="https://…" maxLength={1600}/></label>
 {loading&&<p role="status">Loading media library…</p>}{error&&<p role="alert">{error}</p>}
 {assets.length>0&&<><strong>Media library</strong><div className="as-workspace-media-grid">{assets.map(a=>{const src=safeWidgetMediaUrl(mode==='photo'?(a.url||a.delivery_url):a.url);const thumb=safeWidgetMediaUrl(a.thumbnail_url||a.delivery_url);return src&&thumb?<button type="button" key={a.id} aria-label={a.filename} aria-pressed={url===src} onClick={()=>{setFile(null);setUrl(src);setTitle(a.filename)}}><img src={thumb} alt="" loading="lazy"/><span>{a.filename}</span></button>:null})}</div></>}
 <button type="button" className="as-workspace-media-upload" disabled={busy||!preview} onClick={()=>void apply()}>{busy?'Saving…':wallpaper?'Use wallpaper':'Use media'}</button>
 </div>;
}
