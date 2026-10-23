import {useState, type CSSProperties} from 'react';
import {BookOpen, FolderOpen, Globe, LayoutGrid, MessageCircle, Plus, Settings2} from 'lucide-react';
import {Nav, type NavMode, type NavValue} from '../../../../../packages/agentsam-nav/src/index';
import {CadCreatorApp} from './CadCreatorApp';

/**
 * The public standalone CAD route uses the SAME navigation package that owns
 * hosted AgentSam and the desktop shell. This is not a CAD-specific nav clone.
 * CAD remains mounted across Chat/Work mode changes to preserve unsaved edits.
 */
export function CadStandaloneShell() {
  const [mode,setMode] = useState<NavMode>('work');
  const [activeProject,setActiveProject] = useState('Example Home');
  const go = (to:string) => {
    if (to === '/cad') {setMode('work');return;}
    if (to === '/cad/world') {window.dispatchEvent(new Event('agentsam:cad-open-dreamhouse'));setActiveProject('DreamHouse · Public Example');setMode('work');return;}
    if (to === '/cad/new') {
      // The CAD app handles model creation; enter its existing New workflow.
      window.dispatchEvent(new Event('agentsam:cad-new-project'));
      setActiveProject('Untitled project');
      setMode('work');
      return;
    }
    if (to.startsWith('http')) {window.open(to,'_blank','noopener,noreferrer');return;}
    window.open('https://agentsam.inneranimalmedia.com'+to,'_blank','noopener,noreferrer');
  };
  const hosted = 'https://agentsam.inneranimalmedia.com';
  const data:NavValue = {
    mode,onModeChange:setMode,
    brand:{name:'AgentSam',home:'/cad',logo:'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/d1864d11-4485-4a38-1849-168f567aa200/avatar'},
    project:{id:'public-demo',name:activeProject},
    destinations:[
      {id:'cad',label:'CAD Creator',href:'/cad',icon:<img src="/studio/samsketch-icon.png" alt="" width={20} height={20} className="rounded-md"/>,active:true},
      {id:'dreamhouse',label:'DreamHouse · Public Example',href:'/cad/world',icon:<LayoutGrid/>},
      {id:'new',label:'New CAD project',href:'/cad/new',icon:<Plus/>},
      {id:'projects',label:'Projects',href:'/projects',icon:<FolderOpen/>},
      {id:'library',label:'Library',href:'/artifacts',icon:<BookOpen/>},
      {id:'sites',label:'Sites',href:'/cms',icon:<Globe/>},
      {id:'work',label:'AgentSam Work',href:'/agentsam',icon:<LayoutGrid/>},
    ],
    onNavigate:go,
    onCreateConversation:()=>go('/agentsam'),
    accountActions:[{id:'signin',label:'Open AgentSam account',icon:<Settings2/>,onSelect:()=>go('/settings/general')}]
  };
  return <Nav.Provider value={data} theme="dark" accentColor="#82a7fb" defaultOpen={false} peekable resizable>
    <Nav.Scope className="cad-platform-shell" data-agentsam-app-shell="cad-creator">
      <Nav.Sidenav />
      <div className="cad-platform-main">
        <Nav.Topbar startup showNavigationTrigger showAccount={false}
          rightSlot={<a className="cad-platform-open-account" href={hosted+'/agentsam'} target="_blank" rel="noreferrer">Open AgentSam <span aria-hidden>↗</span></a>}/>
        <div className="cad-platform-content" data-mode={mode}>
          {mode === 'chat' && <section className="cad-platform-chat" aria-label="CAD conversation">
            <div className="cad-platform-chat-center">
              <MessageCircle size={26} strokeWidth={1.5} />
              <h2>AgentSam for CAD</h2>
              <p>The authenticated AgentSam conversation lives in your Work account. Your current CAD canvas stays mounted alongside it; no geometry is submitted or changed without authorization.</p>
              <a href={hosted+'/agentsam'} target="_blank" rel="noreferrer" className="cad-platform-chat-link">Open your AgentSam conversation ↗</a>
              <p className="cad-platform-chat-caption">For selection-aware CAD instructions, use miniAgentSam in the canvas. Hosted/desktop identity is required for executable operations.</p>
            </div>
          </section>}
          <div className={'cad-platform-canvas '+(mode==='chat'?'cad-platform-canvas--chat':'')}>
            <CadCreatorApp presentation="embedded" accessMode="public-demo"/>
          </div>
        </div>
      </div>
    </Nav.Scope>
  </Nav.Provider>;
}
