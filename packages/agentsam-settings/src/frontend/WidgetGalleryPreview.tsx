import {
  Activity,
  Check,
  CloudSun,
  Command,
  GitCommitHorizontal,
  Play,
  Search,
  ShieldCheck,
} from "lucide-react";

/**
 * Gallery artwork is sample-only. Never fetches domain data or advertises
 * a simulated approval, run, metric, or provider connection as live.
 * Real widget renderers continue to be owned by the Workbench widget surface.
 */
export function WidgetGalleryPreview({ id }: { id: string }) {
  const line = (width: string, light = false) => (
    <span
      className={`block h-1.5 rounded-full ${light ? "bg-foreground/35" : "bg-foreground/10"}`}
      style={{ width }}
    />
  );
  const bars = (values: number[]) => (
    <div className="flex h-[76px] items-end gap-1.5">
      {values.map((value, index) => (
        <div key={index} className="min-w-0 flex-1 rounded-t-[4px] bg-violet-400/15">
          <div
            className="rounded-t-[4px] bg-violet-400/75"
            style={{ height: value + "%", minHeight: 8, marginTop: (100 - value) * 0.52 }}
          />
        </div>
      ))}
    </div>
  );
  const miniLabel = (text: string) => (
    <span className="text-[10px] font-medium tracking-[0.03em] text-muted-foreground">{text}</span>
  );
  const metric = (value: string, label: string) => (
    <div>
      <div className="text-[27px] font-semibold leading-none tracking-[-0.05em] text-foreground">{value}</div>
      <div className="mt-2 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
  const row = (name: string, right?: string, icon?: "check" | "activity") => (
    <div className="flex items-center justify-between gap-3 border-b border-foreground/5 py-2 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        {icon === "check" ? <Check className="size-3 shrink-0 text-emerald-400" /> : icon === "activity" ? <Activity className="size-3 shrink-0 text-violet-400" /> : <span className="size-1.5 shrink-0 rounded-full bg-violet-400/70" />}
        <span className="truncate text-[11px] text-foreground/80">{name}</span>
      </div>
      {right ? <span className="shrink-0 text-[10px] text-muted-foreground">{right}</span> : null}
    </div>
  );

  if (id === "countdown") {
    return <div className="flex h-full flex-col justify-center gap-3">
      {miniLabel("FOCUS SESSION")}
      <div className="font-mono text-[37px] font-medium leading-none tracking-[-0.09em] text-foreground">05:00</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10"><div className="h-full w-2/3 rounded-full bg-violet-400" /></div>
      {miniLabel("Ready to start")}
    </div>;
  }
  if (id === "clock") {
    return <div className="flex h-full flex-col justify-center gap-2">
      {miniLabel("LOCAL TIME")}
      <div className="font-mono text-[31px] font-medium tracking-[-0.06em] text-foreground">09:41<span className="ml-1 text-sm text-muted-foreground">:08</span></div>
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>New York</span><span>UTC − 04:00</span></div>
      <div className="mt-2 border-t border-border/70 pt-2 text-[10px] text-muted-foreground">Tokyo <span className="float-right text-foreground/70">22:41</span></div>
    </div>;
  }
  if (id === "calculator") {
    return <div className="flex h-full flex-col justify-center gap-3">
      <div className="text-right font-mono text-[12px] text-muted-foreground">24 × 18</div>
      <div className="text-right font-mono text-[34px] leading-none tracking-[-0.05em] text-foreground">432</div>
      <div className="grid grid-cols-4 gap-1.5">{["7","8","9","÷","4","5","6","×"].map(k=><span key={k} className="rounded-md border border-border/60 bg-background/70 py-1.5 text-center font-mono text-[11px] text-foreground/75">{k}</span>)}</div>
    </div>;
  }
  if (id === "quick-controls") {
    return <div className="flex h-full flex-col justify-center gap-3">
      {["Execution mode", "Telemetry stream", "Audio feedback"].map((label, i)=><div key={label} className="flex items-center justify-between gap-3">{miniLabel(label)}<span className={`flex h-[15px] w-7 rounded-full p-[2px] ${i===2?"bg-foreground/15":"bg-emerald-400/80"} ${i===2?"justify-start":"justify-end"}`}><span className="size-[11px] rounded-full bg-white"/></span></div>)}
    </div>;
  }
  if (id === "metrics" || id === "cloudflare-observability") {
    return <div className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between">{metric(id==="metrics"?"98.7%":"12.4k",id==="metrics"?"Success rate":"Requests")}<span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-400">+12.8%</span></div>
      {bars([35,62,48,79,60,84,70,96,76,86,63,90])}
    </div>;
  }
  if (id === "token-cost-glance") {
    return <div className="flex h-full flex-col justify-between">
      <div>{miniLabel("ESTIMATED SPEND")}{metric("$2.84","Today's model usage")}</div>
      <div className="flex items-end gap-1.5">{[20,27,23,39,34,55,48,61,46,57,72,66].map((v,i)=><span key={i} className="flex-1 rounded-t-sm bg-sky-400/70" style={{height:v*.62+4}}/>)}</div>
    </div>;
  }
  if (id === "jobs" || id === "recent-items" || id === "github-activity") {
    const entries = id === "jobs" ? [["Index workspace","2 min"],["Refresh analytics","15 min"],["Daily summary","Tomorrow"]] : id === "github-activity" ? [["Widget package updated","2h ago"],["Build checks passed","4h ago"],["Release branch synced","1d ago"]] : [["Dashboard snapshot","4 min"],["Project review","1h"],["Studio workspace","Yesterday"]];
    return <div className="flex h-full flex-col justify-center">{entries.map(([title, right],i)=><div key={title}>{row(title,right,i===1?"check":undefined)}</div>)}</div>;
  }
  if (id === "queues" || id === "queue-status") {
    return <div className="flex h-full flex-col justify-between">
      <div className="grid grid-cols-3 gap-2">{[["12","Queued"],["04","Running"],["00","Failed"]].map(([v,l])=><div key={l}><span className="font-mono text-[22px] font-medium text-foreground">{v}</span><div className="mt-1 text-[9px] text-muted-foreground">{l}</div></div>)}</div>
      <div className="flex h-2 overflow-hidden rounded-full bg-foreground/10"><span className="w-[58%] bg-violet-400"/><span className="w-[29%] bg-sky-400"/><span className="w-[13%] bg-amber-400"/></div>
      {miniLabel("Priority distribution")}
    </div>;
  }
  if (id === "runtime-state") {
    return <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-400"/><span className="text-[14px] font-medium text-foreground">All systems nominal</span></div>
      {row("Gateway", "Healthy", "check")}{row("Active sandboxes","03","activity")}{row("Runtime latency","28 ms","check")}
    </div>;
  }
  if (id === "launcher") {
    return <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-center gap-2 rounded-xl border border-foreground/15 bg-background/70 px-3 py-2"><Search className="size-3.5 text-muted-foreground"/><span className="text-[11px] text-muted-foreground">Run a command...</span><span className="ml-auto rounded border border-border px-1.5 text-[9px] text-muted-foreground">⌘ K</span></div>
      {row("Open project", "↗")}{row("Start AgentSam", "↗")}
    </div>;
  }
  if (id === "shortcuts") {
    return <div className="flex h-full flex-col justify-center gap-3">{[["Command palette","⌘","K"],["New session","⌘","N"],["Find anywhere","⌘","F"]].map(([name,a,b])=><div key={name} className="flex items-center justify-between">{miniLabel(name)}<div className="flex gap-1">{[a,b].map((k,i)=><span key={i} className="rounded border border-border bg-background/60 px-2 py-1 font-mono text-[10px] text-foreground/80">{k}</span>)}</div></div>)}</div>;
  }
  if (id === "list") {
    return <div className="flex h-full flex-col justify-center gap-2">{["Audit package contracts","Verify portable build","Publish release notes"].map((name,i)=><div key={name} className="flex items-center gap-2.5 rounded-lg border border-border/60 px-2.5 py-2"><span className={`flex size-4 items-center justify-center rounded-[5px] border ${i<2?"border-emerald-400/50 bg-emerald-400/10":"border-foreground/20"}`}>{i<2?<Check className="size-3 text-emerald-400"/>:null}</span><span className={`text-[10px] ${i<2?"text-muted-foreground line-through":"text-foreground/80"}`}>{name}</span></div>)}</div>;
  }
  if (id === "media" || id === "weather-dashboard-agent") {
    return <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-indigo-400/20 via-sky-400/10 to-fuchsia-400/25 p-3">
      <div className="absolute -right-5 -top-7 size-28 rounded-full bg-sky-400/20 blur-2xl"/><div className="relative flex items-center justify-between">{miniLabel(id==="media"?"MEDIA PREVIEW":"WEATHER EXAMPLE")}{id==="media"?<Activity className="size-4 text-sky-300"/>:<CloudSun className="size-5 text-amber-300"/>}</div>
      <div className="relative">{id==="weather-dashboard-agent"?<><div className="text-[31px] font-light tracking-[-0.08em] text-foreground">22°</div><span className="text-[10px] text-muted-foreground">Partly cloudy · sample</span></>:<><div className="mb-2 flex h-10 items-center justify-center gap-1">{[12,25,18,39,23,43,29,16,37,21,13].map((v,i)=><span key={i} className="w-1 rounded-full bg-sky-300/65" style={{height:v}}/>)}</div><span className="text-[10px] text-muted-foreground">Ambient stream · sample</span></>}</div>
    </div>;
  }
  if (id === "artifact-preview") {
    return <div className="flex h-full flex-col gap-3 overflow-hidden rounded-lg border border-border/60 bg-background/55 p-3"><div className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-red-400/70"/><span className="size-1.5 rounded-full bg-amber-400/70"/><span className="size-1.5 rounded-full bg-emerald-400/70"/><span className="ml-2 text-[9px] text-muted-foreground">widget.tsx</span></div><div className="space-y-2 font-mono text-[10px]"><span className="block text-violet-300">export const Widget = () =&gt; &#123;</span><span className="block pl-2 text-sky-300">return &lt;Card /&gt;;</span><span className="block text-violet-300">&#125;;</span></div></div>;
  }
  if (id === "active-run") {
    return <div className="flex h-full flex-col justify-center gap-3"><div className="flex items-center gap-2"><Play className="size-3 fill-emerald-400 text-emerald-400"/><span className="text-[11px] font-medium text-foreground">Executing workflow</span></div>{row("Plan generated","Done","check")}{row("Inspecting packages","Running","activity")}{row("Verifying output","Pending")}</div>;
  }
  if (id === "approvals") {
    return <div className="flex h-full flex-col justify-center gap-2"><div className="flex items-center gap-2">{<ShieldCheck className="size-4 text-amber-400"/>}<span className="text-[11px] font-medium text-foreground">Approval required</span></div><div className="rounded-lg border border-border/70 bg-background/60 p-3"><div className="mb-3 text-[10px] text-foreground/80">Deploy production changes</div><div className="flex gap-2"><span className="rounded-md bg-emerald-400/15 px-3 py-1 text-[10px] text-emerald-300">Approve</span><span className="rounded-md bg-foreground/10 px-3 py-1 text-[10px] text-muted-foreground">Reject</span></div></div></div>;
  }
  if (id === "task-progress") {
    return <div className="flex h-full flex-col justify-center gap-3">{miniLabel("RELEASE WORKFLOW")}<div className="flex items-center justify-between">{metric("68%","Completion")}<GitCommitHorizontal className="size-5 text-violet-400"/></div><div className="h-2 overflow-hidden rounded-full bg-foreground/10"><div className="h-full w-[68%] bg-violet-400"/></div>{row("Build and validate", "In progress", "activity")}</div>;
  }
  return <div className="flex h-full flex-col items-center justify-center gap-3"><Command className="size-6 text-violet-400"/>{line("75%",true)}{line("55%")}{line("65%")}</div>;
}
