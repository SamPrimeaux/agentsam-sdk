import { useCallback } from "react";
import { AdminAppsDirectory } from "@inneranimalmedia/agentsam-nav";
import { ToolsPreferences } from "./ToolsPreferences";
import { installAccountApp, loadAccountApps, openAccountApp, removeAccountApp, setAccountAppEnabled } from "@/lib/apps-account";

export function AppsManagementPage(){
  const onChanged=useCallback(()=>{window.dispatchEvent(new Event("agentsam:navigation-changed"));},[]);
  const onOpen=useCallback((href:string)=>{
    openAccountApp(href);
  },[]);
  const selectedTheme=typeof document==='undefined'?'system':document.documentElement.dataset.theme;
  const navTheme=selectedTheme==='light'||selectedTheme==='dark'?selectedTheme:'system';
  return <section className="as-nav-scope as-apps-inline space-y-5 pb-8" data-nav-theme={navTheme}>
    <header className="flex flex-wrap justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-foreground">Apps</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Install, open, disable, or remove the existing admin applications for this account. Each app keeps its own editor and full route. Choose your tools below; plugins are managed in Plugins.</p></div>
    </header>
    <div className="overflow-hidden rounded-xl border border-border bg-card py-5">
      <AdminAppsDirectory loadApps={loadAccountApps} installApp={installAccountApp} removeApp={removeAccountApp} updateApp={setAccountAppEnabled} onInstalled={onChanged} onOpenApp={onOpen}/>
    </div>
    <div className="pt-2"><ToolsPreferences /></div>
  </section>;
}
