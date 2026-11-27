import {useState} from 'react';
import {Image,Film,Music2} from 'lucide-react';
export function safeWidgetMediaUrl(value:unknown):string|undefined {
 if(typeof value!=='string'||value.length>1600||/[\x00-\x20\\"'<>]/.test(value))return;
 if(/^\/(?!\/)(?:media|api\/media|assets|brand)\//.test(value)&&!value.includes('..'))return value;
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}
}
export function MediaWidget({configuration={}}:{configuration?:Record<string,unknown>}) {
 const url=safeWidgetMediaUrl(configuration.url);
 const mode=configuration.mode==='video'?'video':configuration.mode==='audio'?'audio':configuration.mode==='ambient'?'ambient':'photo';
 const [failed,setFailed]=useState<string>();
 const title=typeof configuration.title==='string'?configuration.title:'Media';
 const Glyph=mode==='audio'?Music2:mode==='video'?Film:Image;
 if(!url||failed===url)return <div className="agentsam-media-widget agentsam-media-widget--empty"><Glyph size={28}/><span>{url?'Media unavailable':'Choose media in Arrange mode'}</span></div>;
 return <div className="agentsam-media-widget" data-mode={mode}>
 {mode==='audio'?<div className="agentsam-media-widget__audio"><Music2 size={32}/><strong>{title}</strong><audio controls preload="none" src={url} onError={()=>setFailed(url)} aria-label={title}/></div>:
 mode==='video'?<video src={url} controls playsInline preload="metadata" onError={()=>setFailed(url)} aria-label={title}/>:
 mode==='ambient'?<video src={url} controls playsInline loop muted preload="none" onError={()=>setFailed(url)} aria-label={title}/>:
 <img src={url} alt={title} loading="lazy" onError={()=>setFailed(url)}/>}
 </div>;
}
