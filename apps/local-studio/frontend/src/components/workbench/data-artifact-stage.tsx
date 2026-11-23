import { useRef, useState } from 'react';
import { BarChart3, ChartNoAxesCombined, Clapperboard, FileUp, LayoutDashboard, Plug, ScrollText } from 'lucide-react';
import { AskAgentSamPill } from '@inneranimalmedia/agentsam-workbench/agent';
import '@inneranimalmedia/agentsam-workbench/agent/contextual-composer.css';
import type { SideTab } from '@inneranimalmedia/agentsam-local-shared';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { stageChatFile } from '@/lib/content/chat-images';
import { askAgentSamAboutArtifact } from '@/lib/work/artifact-assistance';
import { useWorkStore } from '@/lib/work/store';
import './data-artifact-stage.css';

type Format = 'dashboard' | 'visual-analysis' | 'scrollyteller' | 'visual-short';
const FORMATS = [
  { id:'dashboard', label:'Dashboard', description:'Metrics, charts and filters', icon: LayoutDashboard },
  { id:'visual-analysis', label:'Visual analysis', description:'Explore trends and explain findings', icon: ChartNoAxesCombined },
  { id:'scrollyteller', label:'Scrollyteller', description:'A narrative told through scrolling', icon: ScrollText },
  { id:'visual-short', label:'Visual short', description:'A data-driven short presentation', icon: Clapperboard },
] as const;

function FormatPreview({ format }: { format: Format }) {
  return <svg viewBox="0 0 124 88" role="img" aria-label={`${format.replaceAll('-', ' ')} preview`}>
    <rect className="data-format-frame" x="6" y="7" width="112" height="74" rx="10"/>
    {format === 'dashboard' && <>
      <rect className="data-format-surface" x="16" y="18" width="60" height="52" rx="5"/>
      <rect className="data-format-surface" x="82" y="18" width="26" height="22" rx="5"/>
      <rect className="data-format-surface" x="82" y="45" width="26" height="25" rx="5"/>
      {[18,32,45].map((h,i)=><rect key={i} className="data-format-bar" x={23+i*16} y={62-h} width="10" height={h} rx="2"/>)}
      <path className="data-format-line" d="M89 30h11m-11 4h7M89 53h11m-11 6h7"/>
    </>}
    {format === 'visual-analysis' && <>
      <rect className="data-format-surface" x="32" y="14" width="60" height="60" rx="5"/>
      <path className="data-format-graph" d="M42 53 Q50 45 59 48 T77 31L82 25"/>
      <circle className="data-format-dot" cx="77" cy="31" r="4"/>
      <rect className="data-format-bubble" x="68" y="16" width="26" height="10" rx="5"/>
      <path className="data-format-line" d="M43 60h24M43 66h36"/>
    </>}
    {format === 'scrollyteller' && <>
      <rect className="data-format-surface" x="55" y="14" width="48" height="58" rx="4"/>
      <rect className="data-format-story" x="22" y="24" width="55" height="41" rx="4"/>
      <path className="data-format-line" d="M32 37h27M32 44h36M32 51h22M85 28v18"/>
      <rect className="data-format-bubble" x="32" y="28" width="17" height="5" rx="2"/>
    </>}
    {format === 'visual-short' && <>
      <rect className="data-format-surface" x="17" y="19" width="90" height="51" rx="5"/>
      {[14,22,29,18,24].map((h,i)=><rect key={i} className="data-format-bar" x={29+i*13} y={57-h} width="8" height={h} rx="2"/>)}
      <circle className="data-format-play" cx="62" cy="42" r="13"/>
      <path className="data-format-triangle" d="M59 34l11 8-11 8Z"/>
      <path className="data-format-progress" d="M27 63h62"/>
    </>}
  </svg>;
}

function formatFromUrl(value:string):Format {
  try {
    const format = new URL(value, 'https://agentsam.invalid').searchParams.get('format');
    if (FORMATS.some(item=>item.id===format)) return format as Format;
  } catch { /* older saved tabs simply open the dashboard chooser */ }
  return 'dashboard';
}

/** Native Side Stage entry, not an iframe or a simulated saved data document. */
export function DataArtifactStage({tab}: {tab:SideTab}) {
  const {user}=useCurrentUserState();
  const input=useRef<HTMLInputElement>(null);
  const [format,setFormat]=useState<Format>(()=>formatFromUrl(tab.url));
  const setTabUrl=useWorkStore(s=>s.setTabUrl);
  const [uploading,setUploading]=useState(false);
  const [fileName,setFileName]=useState('');
  const [error,setError]=useState('');
  const openSideTab=useWorkStore(s=>s.openSideTab);
  const selected=FORMATS.find(item=>item.id===format)!;
  const ask=()=>askAgentSamAboutArtifact({kind:'data',id:tab.id,title:'New data experience',chatId:tab.parentChatId,
    selection:{id:format,kind:'format',label:selected.label,text:selected.description}});
  async function importFile(file:File) {
    if (!user?.id) { setError('Sign in before importing data.'); return; }
    setUploading(true);setError('');
    try {
      const ref=await stageChatFile(file,user.id);
      const chatId=ask();
      useWorkStore.getState().setPendingComposerAttachments(chatId,current=>[...current,ref].slice(-20));
      setFileName(file.name);
    } catch(reason) {setError(reason instanceof Error?reason.message:'Could not attach the file.');}
    finally {setUploading(false);}
  }
  return <section className="data-artifact-stage" aria-label="Data Artifact creation" data-format={format}>
    <header className="data-artifact-header"><div><BarChart3 size={17}/><strong>Data</strong><span>New experience · Not yet saved</span></div></header>
    <div className="data-artifact-body">
      <aside className="data-artifact-sources" aria-label="Data source">
        <div className="data-artifact-sources-inner">
          <BarChart3 size={35} className="data-artifact-source-mark"/>
          <h2>Where do your numbers come from?</h2>
          <p>Start from a connected service or add a file to your AgentSam conversation.</p>
          <button type="button" className="data-source-choice" onClick={()=>openSideTab('apps',{title:'Apps'})}>
            <Plug size={20}/><span><strong>Browse connectors</strong><small>Use your installed apps and their permissions</small></span>
          </button>
          <button type="button" className="data-source-choice" onClick={()=>input.current?.click()} disabled={uploading}>
            <FileUp size={20}/><span><strong>{uploading?'Attaching file…':'Import a file'}</strong><small>CSV, Excel or JSON · 20 MB limit</small></span>
          </button>
          <input ref={input} type="file" hidden accept=".csv,.tsv,.xls,.xlsx,.json" onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void importFile(file);}}/>
          {fileName&&<p role="status">Attached to conversation: {fileName}</p>}
          {error&&<p role="alert">{error}</p>}
        </div>
      </aside>
      <div className="data-artifact-canvas">
        <div className="data-artifact-empty"><h2>Nothing here yet</h2><p>Choose a format</p>
          <div className="data-artifact-formats" role="group" aria-label="Data experience format">
            {FORMATS.map(item=><button type="button" key={item.id} className="data-artifact-format" data-active={format===item.id}
              aria-pressed={format===item.id} title={item.description} onClick={()=>{setFormat(item.id);setTabUrl(tab.id,'/data?format='+item.id);}}>
              <span className="data-artifact-format-art"><FormatPreview format={item.id}/></span>
              <span>{item.label}</span>
            </button>)}
          </div>
        </div>
        <div className="data-artifact-ask"><AskAgentSamPill onAsk={ask} contextLabel={selected.label}/></div>
      </div>
    </div>
  </section>;
}
