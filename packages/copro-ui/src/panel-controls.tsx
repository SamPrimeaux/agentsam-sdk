import React, { useEffect, useRef, useState } from "react";

export type CoProRangeControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onCommit: (value: number) => void;
  className?: string;
  disabled?: boolean;
};

/**
 * A shared inspector range control. Pointer drags preview locally and commit
 * exactly one editor command on release; keyboard changes commit on key-up/blur.
 */
export function CoProRangeControl({
  label, value, min, max, step = 1, format = value => String(value),
  onCommit, className = "", disabled = false,
}: CoProRangeControlProps) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const committedRef = useRef(value);

  useEffect(() => {
    draftRef.current = value;
    committedRef.current = value;
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = draftRef.current;
    if (Object.is(next, committedRef.current)) return;
    committedRef.current = next;
    onCommit(next);
  };
  const cancel = () => {
    draftRef.current = value;
    committedRef.current = value;
    setDraft(value);
  };

  return <label className={["copro-range-control", className].filter(Boolean).join(" ")}>
    <span><strong>{label}</strong><output>{format(draft)}</output></span>
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft}
      disabled={disabled}
      onChange={event => {
        const next = Number(event.currentTarget.value);
        draftRef.current = next;
        setDraft(next);
      }}
      onPointerUp={commit}
      onPointerCancel={cancel}
      onKeyUp={commit}
      onBlur={commit}
    />
  </label>;
}


export type CoProNumberControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
  className?: string;
  disabled?: boolean;
};

/** Exact-value companion to CoProRangeControl; text entry commits on blur/Enter. */
export function CoProNumberControl({label,value,min,max,step=1,onCommit,className="",disabled=false}:CoProNumberControlProps) {
  const [draft,setDraft]=useState(String(value));
  const draftRef=useRef(String(value));
  const committedRef=useRef(value);
  useEffect(()=>{
    draftRef.current=String(value);
    committedRef.current=value;
    setDraft(String(value));
  },[value]);
  const cancel=()=>{
    draftRef.current=String(value);
    committedRef.current=value;
    setDraft(String(value));
  };
  const commit=()=>{
    if(!draftRef.current.trim()){cancel();return;}
    const parsed=Number(draftRef.current);
    if(!Number.isFinite(parsed)){cancel();return;}
    const next=Math.min(max,Math.max(min,parsed));
    draftRef.current=String(next);
    setDraft(String(next));
    if(Object.is(next,committedRef.current))return;
    committedRef.current=next;
    onCommit(next);
  };
  return <label className={["copro-number-control",className].filter(Boolean).join(" ")}>
    <span>{label}</span>
    <input type="number" aria-label={label} min={min} max={max} step={step} value={draft} disabled={disabled}
      onChange={event=>{draftRef.current=event.currentTarget.value;setDraft(event.currentTarget.value);}}
      onBlur={commit}
      onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();commit();event.currentTarget.blur();}else if(event.key==="Escape"){event.preventDefault();cancel();event.currentTarget.blur();}}}/>
  </label>;
}
