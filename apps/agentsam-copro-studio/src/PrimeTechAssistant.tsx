import {useEffect, useRef, useState, type FormEvent, type KeyboardEvent} from 'react';
import {Maximize2, Minimize2, Minus, Send, X} from 'lucide-react';
import {IconAction} from '@inneranimalmedia/copro-ui';
import './PrimeTechAssistant.css';

const greeting = "Hi, I'm AgentSam Assistant. How can I help you today?";

/** PrimeTech's local assistant shell. This preview has no chat adapter; no
 *  offsite links, invisible clipboard transfers, or simulated model answers. */
export function PrimeTechAssistant() {
  const [open,setOpen] = useState(false);
  const [expanded,setExpanded] = useState(false);
  const [confirmEnd,setConfirmEnd] = useState(false);
  const [hint,setHint] = useState(false);
  const [draft,setDraft] = useState('');
  const [sendError,setSendError] = useState(false);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const noRef=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    try {setHint(sessionStorage.getItem('primetech.assistant.hint') !== 'dismissed');}
    catch {setHint(true);}
  },[]);
  useEffect(()=>{if(open&&!confirmEnd)inputRef.current?.focus();},[open,confirmEnd]);
  useEffect(()=>{if(confirmEnd)noRef.current?.focus();},[confirmEnd]);
  useEffect(()=>{
    const onKey=(event:globalThis.KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      if(confirmEnd){setConfirmEnd(false);closeRef.current?.focus();return;}
      if(open){setOpen(false);setExpanded(false);}
    };
    document.addEventListener('keydown',onKey);
    return ()=>document.removeEventListener('keydown',onKey);
  },[open,confirmEnd]);
  function dismissHint(){setHint(false);try{sessionStorage.setItem('primetech.assistant.hint','dismissed');}catch{}}
  function openChat(){dismissHint();setOpen(true);setSendError(false);}
  function endChat(){setDraft('');setSendError(false);setOpen(false);setExpanded(false);setConfirmEnd(false);}
  function submitLocalDraft(event:FormEvent){
    event.preventDefault();
    if(!draft.trim())return;
    // The standalone preview has no connected chat transport yet. Preserve
    // what was typed rather than losing it or opening another application.
    setSendError(true);
  }
  function onInputKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){
    if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(draft.trim())event.currentTarget.form?.requestSubmit();}
  }
  return <div className="pt-assistant" data-open={open}>
    {!open&&hint&&<div className="pt-assistant-hint"><IconAction className="pt-assistant-hint-dismiss" aria-label="Dismiss assistant greeting" onClick={dismissHint}><X size={14}/></IconAction><strong>Hi, I'm AgentSam Assistant</strong><span>How can I help you today?</span></div>}
    {open&&<section className={'pt-assistant-panel'+(expanded?' is-expanded':'')} role="dialog" aria-label="AgentSam Assistant" aria-modal="false">
      <header className="pt-assistant-header">
        <img src="/brand/copro-trigger.svg" alt=""/>
        <strong>AgentSam Assistant</strong>
        <div className="pt-assistant-controls">
          <IconAction data-tip="Minimize" aria-label="Minimize" onClick={()=>setOpen(false)}><Minus size={20}/></IconAction>
          <IconAction data-tip={expanded?'Collapse':'Expand'} aria-label={expanded?'Collapse':'Expand'} onClick={()=>setExpanded(value=>!value)}>{expanded?<Minimize2 size={19}/>:<Maximize2 size={19}/>}</IconAction>
          <IconAction ref={closeRef} data-tip="Close" aria-label="Close" onClick={()=>setConfirmEnd(true)}><X size={20}/></IconAction>
        </div>
      </header>
      <div className="pt-assistant-body" aria-live="polite">
        <p className="pt-assistant-welcome">{greeting}</p>

      </div>
      <form className="pt-assistant-form" onSubmit={submitLocalDraft}>
        <label className="pt-assistant-input"><span className="pt-assistant-sr">Your message to AgentSam</span><textarea ref={inputRef} rows={2} maxLength={2000} placeholder="Ask AgentSam Assistant" value={draft} onChange={event=>{setDraft(event.currentTarget.value);setSendError(false);}} onKeyDown={onInputKeyDown}/><IconAction type="submit" disabled={!draft.trim()} aria-label="Send message" data-tip="Send message"><Send size={19}/></IconAction></label>
        {sendError&&<p className="pt-assistant-feedback" role="status">Assistant isn't connected in this local build. Your draft is still here.</p>}
        <p className="pt-assistant-disclaimer">AI content may be incomplete or inaccurate. Review results before use.</p>
      </form>
      {confirmEnd&&<div className="pt-assistant-scrim"><div className="pt-assistant-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pt-end-heading" aria-describedby="pt-end-description"><h3 id="pt-end-heading">End Chat</h3><p id="pt-end-description">Close the assistant and clear your draft?</p><div><button ref={noRef} type="button" onClick={()=>setConfirmEnd(false)}>No</button><button type="button" onClick={endChat}>Yes</button></div></div></div>}
    </section>}
    <IconAction className="pt-assistant-launcher" onClick={()=>open?setOpen(false):openChat()} aria-label={open?'Minimize AgentSam Assistant':'Open AgentSam Assistant'} aria-expanded={open}>
      <img src="/brand/copro-trigger.svg" alt=""/>
    </IconAction>
  </div>;
}
