import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Nav, useNav, type NavAction } from '@inneranimalmedia/agentsam-nav';
import { getBearerToken } from '@/lib/auth/client';
import { invokeStudioService, isPackagedDesktop } from '@/lib/desktop/tauri';

type Notice = {id:string;title:string;message:string;channel:string;createdAt:number};
const MENU = 'studio-notifications';

/** Both shell hosts read the same account-scoped feed, without invented events. */
export function NotificationsMenu() {
  const { data, menu } = useNav();
  const [items,setItems] = useState<Notice[]>([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  const accountId = data.account?.id;
  useEffect(()=>{
    setItems([]); setError('');
  },[accountId]);
  useEffect(()=>{
    if (menu !== MENU) return;
    let active = true;
    setLoading(true); setError(''); setItems([]);
    (async()=>{
      let payload: {ok?:boolean;notifications?:Notice[]};
      if (isPackagedDesktop()) {
        const response = await invokeStudioService({operation:'settings',path:'/api/settings/notifications',method:'GET'});
        if (!response.ok) throw new Error('notifications_unavailable');
        payload = JSON.parse(response.body);
      } else {
        const token = getBearerToken();
        const response = await fetch('/api/settings/notifications',{
          credentials:'same-origin',cache:'no-store',headers:token?{Authorization:'Bearer '+token}:undefined,
        });
        if (!response.ok) throw new Error('notifications_unavailable');
        payload = await response.json();
      }
      if (!payload.ok || !Array.isArray(payload.notifications)) throw new Error('notifications_unavailable');
      if (active) setItems(payload.notifications);
    })().catch(()=>{if(active)setError('Notifications could not load. Retry to reconnect.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[menu,accountId,revision]);
  const actions: NavAction[] = loading ? [{id:'loading',label:'Loading notifications…',disabled:true}]
    : error ? [{id:'error',label:error,disabled:true}]
    : items.length ? items.map(item=>({
      id:item.id,label:item.title,children:[
        {id:item.id+'-message',label:item.message,disabled:true},
        {id:item.id+'-time',label:item.channel+' · '+new Date(item.createdAt*1000).toLocaleString(),disabled:true},
      ],
    })) : [{id:'empty',label:'No notifications yet.',disabled:true}];
  actions.push({id:'refresh',label:error?'Retry notifications':'Refresh notifications',onSelect:()=>setRevision(value=>value+1)});
  return <Nav.OverflowMenu id={MENU} label="Notifications" align="end" actions={actions}><Bell size={18} aria-hidden="true" /></Nav.OverflowMenu>;
}
