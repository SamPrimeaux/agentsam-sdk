import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Nav, useNav, type NavAction } from '@inneranimalmedia/agentsam-nav';
import { getBearerToken } from '@/lib/auth/client';
import { getTauriInvoke, invokeStudioService, isPackagedDesktop } from '@/lib/desktop/tauri';

type Notice = {id:string;title:string;message:string;channel:string;priority:string;readAt:number|null;createdAt:number;destination:string|null};
type Inbox = {ok:boolean;unreadCount:number;notifications:Notice[]};
const MENU = 'studio-notifications';

async function inboxRequest(path:string,method:'GET'|'POST'='GET'):Promise<Inbox> {
  if (isPackagedDesktop()) {
    const response=await invokeStudioService({operation:'settings',path,method});
    if (!response.ok) throw new Error('inbox_unavailable');
    return JSON.parse(response.body) as Inbox;
  }
  const token=getBearerToken();
  const response=await fetch(path,{method,cache:'no-store',credentials:'same-origin',headers:token?{Authorization:'Bearer '+token}:undefined});
  if (!response.ok) throw new Error('inbox_unavailable');
  return response.json() as Promise<Inbox>;
}

/** Notification history comes from the authenticated account, never fixtures. */
export function NotificationsMenu() {
  const { data,menu } = useNav();
  const accountId = data.account?.id || null;
  const [items,setItems]=useState<Notice[]>([]);
  const [unread,setUnread]=useState(0);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const accountRef=useRef(accountId);
  useEffect(()=>{accountRef.current=accountId;setItems([]);setUnread(0);setError('');
    if(isPackagedDesktop()) void getTauriInvoke()?.('sync_native_notifications',{accountId:accountId||'',unreadCount:0,alerts:[]}).catch(()=>{});
  },[accountId]);
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      setLoading(true);
      try {
        const payload=await inboxRequest('/api/notifications');
        if(!payload.ok||!Array.isArray(payload.notifications)||!Number.isFinite(payload.unreadCount))throw Error('invalid_inbox');
        if(!active)return;
        setItems(payload.notifications);setUnread(payload.unreadCount);setError('');
        if(isPackagedDesktop()) {
          // The native bridge deduplicates by account and event id, and suppresses startup replay.
          const alerts=payload.notifications.filter(item=>!item.readAt && (item.priority==='high'||item.priority==='urgent'))
            .map(({id,title,message,createdAt})=>({id,title,message,createdAt}));
          void getTauriInvoke()?.('sync_native_notifications',{accountId:accountRef.current||'',unreadCount:payload.unreadCount,alerts}).catch(()=>{});
        }
      }catch {if(active)setError('Notification inbox unavailable.');}
      finally{if(active)setLoading(false);}
    };
    void load();
    const timer=window.setInterval(()=>void load(),30_000);
    return()=>{active=false;window.clearInterval(timer);};
  },[accountId,revision]);
  const read=async(id:string)=>{
    try{
      await inboxRequest(`/api/notifications/${encodeURIComponent(id)}/read`,'POST');
      setItems(rows=>rows.map(item=>item.id===id?{...item,readAt:item.readAt||Date.now()/1000}:item));
      const wasUnread=items.some(item=>item.id===id&&!item.readAt);
      if(wasUnread)setUnread(value=>Math.max(0,value-1));
      setRevision(value=>value+1);
    }catch {setError('Could not mark notification read.');}
    const destination=items.find(item=>item.id===id)?.destination;
    if(destination)data.onNavigate?.(destination);
  };
  const readAll=async()=>{
    try{await inboxRequest('/api/notifications/read-all','POST');setItems(rows=>rows.map(row=>({...row,readAt:row.readAt||Date.now()/1000})));setUnread(0);setRevision(v=>v+1);}
    catch{setError('Could not mark notifications read.');}
  };
  const actions:NavAction[]=error?[{id:'error',label:error,disabled:true}]:[];
  if(loading&&!items.length&&!error)actions.push({id:'loading',label:'Loading notifications…',disabled:true});
  if(!items.length&&!loading&&!error)actions.push({id:'empty',label:'No notifications yet.',disabled:true});
  for(const item of items)actions.push({
    id:item.id,label:`${item.readAt?'':'● '}${item.title}`,
    onSelect:()=>void read(item.id),
    children:[{id:`${item.id}-message`,label:item.message,disabled:true},
      {id:`${item.id}-time`,label:`${item.channel} · ${new Date(item.createdAt*1000).toLocaleString()}`,disabled:true}],
  });
  if(unread>0)actions.push({id:'read-all',label:'Mark all as read',onSelect:()=>void readAll()});
  actions.push({id:'refresh',label:'Refresh notifications',onSelect:()=>setRevision(value=>value+1)});
  return <Nav.OverflowMenu id={MENU} label={`Notifications${unread?` (${unread} unread)`:''}`} align="end" actions={actions}>
    <span style={{position:'relative',display:'inline-flex'}}>
      <Bell size={18} aria-hidden="true" />
      {unread>0&&<span aria-hidden="true" style={{position:'absolute',right:-5,top:-5,width:9,height:9,borderRadius:'50%',background:'#f05252',border:'1px solid currentColor'}} />}
    </span>
  </Nav.OverflowMenu>;
}
