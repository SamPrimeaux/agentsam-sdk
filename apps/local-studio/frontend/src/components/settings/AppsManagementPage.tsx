import { useCallback } from "react";
import { AdminAppsDirectory } from "@inneranimalmedia/agentsam-nav";

import {
  listAccountApps,installAccountApp,removeAccountApp,setAccountAppEnabled,
  launchAccountApp,notifyAppInventoryChanged,
} from "@/lib/apps/client";

export function AppsManagementPage(){
  const load=useCallback(listAccountApps,[]);
  const install=useCallback(installAccountApp,[]);
  const remove=useCallback(removeAccountApp,[]);
  const update=useCallback(setAccountAppEnabled,[]);
  const onChanged=useCallback(notifyAppInventoryChanged,[]);
  const onOpen=useCallback(launchAccountApp,[]);
  const selectedTheme=typeof document==='undefined'?'system':document.documentElement.dataset.theme;
  const navTheme=selectedTheme==='light'||selectedTheme==='dark'?selectedTheme:'system';
  return <section className="as-nav-scope as-apps-inline space-y-5 pb-8" data-nav-theme={navTheme}>
    <header className="flex flex-wrap justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-foreground">Apps</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Install, open, disable, or remove the existing admin applications for this account. Installed apps are available in the + launcher. Open one alongside a conversation when supported, or use its full application route.</p></div>
    </header>
    <div className="overflow-hidden rounded-xl border border-border bg-card py-5">
      <AdminAppsDirectory loadApps={load} installApp={install} removeApp={remove} updateApp={update} onInstalled={onChanged} onOpenApp={onOpen}/>
    </div>
  </section>;
}
