import { useEffect, useState } from "react";
import { ArrowUp, ChevronRight, PanelRightClose, Sparkles } from "lucide-react";
import { useWorkStore } from "@/lib/work/store";
import { MessageList } from "@/components/workbench/thread";
import { Composer } from "@/components/workbench/composer";

type AssistantProps={selected?:string;onCollapse:()=>void};
export function SamSketchAssistantPane({selected,onCollapse}:AssistantProps){
 const chat=useWorkStore(state=>state.chats.find(item=>item.id===state.activeChatId)??state.chats[0]);
 const streaming=useWorkStore(state=>chat?state.streamingIds.includes(chat.id):false);
 useEffect(()=>{
  if(!useWorkStore.getState().activeChatId){
   const store=useWorkStore.getState();
   store.setActiveChat(store.startChat());
  }
 },[]);
 return <section className="flex h-full min-h-0 w-full flex-col bg-[#fafafa] text-[#222327]" aria-label="SamSketch AgentSam Side Assistant">
  <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#e6e7e9] px-3">
   <div className="flex min-w-0 items-center gap-2.5">
    <span className="flex size-7 shrink-0 items-center justify-center rounded-[9px] border border-[#dedbea] bg-[#f2effd] text-[#5e49a2]"><Sparkles size={15}/></span>
    <div className="min-w-0"><strong className="block text-[12px] font-semibold leading-4">AgentSam</strong><span className="block truncate text-[10px] text-[#777a81]">SamSketch · scene assistant</span></div>
   </div>
   <button type="button" onClick={onCollapse} className="flex size-7 items-center justify-center rounded-[7px] text-[#727780] hover:bg-[#ebedf0] focus-visible:outline-2 focus-visible:outline-[#7254d3]" aria-label="Collapse AgentSam to mini composer" title="Collapse assistant"><PanelRightClose size={16}/></button>
  </header>
  {selected&&<div className="flex shrink-0 items-center gap-2 border-b border-[#ebeef0] bg-white px-3 py-2 text-[11px]"><span className="text-[#888a93]">Working with</span><strong className="min-w-0 truncate font-medium text-[#3c3d42]">{selected}</strong></div>}
  <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
   {chat?<MessageList messages={chat.messages} chatId={chat.id} streaming={streaming}/>:<p className="px-2 text-[12px] text-[#777a81]">Select a scene object or describe what you want to create.</p>}
  </div>
  <div className="shrink-0 border-t border-[#e6e7e9] bg-white p-2.5">
   {chat?<Composer targetId={chat.id} targetKind="chat" placeholder="Work with AgentSam on this scene…"/>:<button type="button" className="text-xs" onClick={()=>{const s=useWorkStore.getState();s.setActiveChat(s.startChat());}}>Start a conversation</button>}
  </div>
 </section>;
}

type MiniProps={selected?:string;context?:unknown;onExpand:()=>void};
export function SamSketchMiniComposer({selected,context,onExpand}:MiniProps){
 const [value,setValue]=useState("");
 const streaming=useWorkStore(s=>s.activeChatId?s.streamingIds.includes(s.activeChatId):false);
 function submit(){
  const input=value.trim();if(!input)return;
  const store=useWorkStore.getState();
  const chatId=store.activeChatId||store.startChat();
  store.setActiveChat(chatId);
  const selectionContext=context?('Current SamSketch selection context: '+JSON.stringify(context)+'\n'):'';
  void store.send(chatId,"chat",selectionContext+input);
  setValue("");
 }
 return <div className="pointer-events-auto mx-auto w-[min(420px,calc(100%-24px))] rounded-[13px] border border-[#dcdde4] bg-white/95 p-1.5 shadow-[0_14px_45px_rgba(20,29,51,.17)] backdrop-blur-xl" role="group" aria-label="miniAgentSam for SamSketch">
   <div className="flex items-center gap-1.5">
    <button onClick={onExpand} type="button" className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#f0ebfa] text-[#7252b8] hover:bg-[#e9e0fc]" aria-label="Expand AgentSam side assistant"><Sparkles size={16}/></button>
    <input className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 text-[12px] text-[#24252a] outline-none placeholder:text-[#85858c]" value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();submit();}}} aria-label="Ask AgentSam about the scene" placeholder={selected?"Ask about "+selected+"…":"Ask AgentSam about this scene…"} />
    <button type="button" onClick={submit} disabled={!value.trim()} className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#282830] text-white hover:bg-[#504b61] disabled:opacity-40" aria-label="Send to AgentSam">{streaming?<ChevronRight size={16}/>:<ArrowUp size={16}/>}</button>
    <button type="button" onClick={onExpand} className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[#656772] hover:bg-[#f2f2f5]" aria-label="Open conversation"><ChevronRight size={16}/></button>
   </div>
 </div>;
}
