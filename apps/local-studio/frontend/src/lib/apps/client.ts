import type { AdminInstallableApp } from "@inneranimalmedia/agentsam-nav";
import {
  invokeStudioService, isPackagedDesktop, resolveDesktopStudioAccountId,
} from "@/lib/desktop/tauri";

type AppMethod = "GET" | "POST" | "PATCH" | "DELETE";
type AppsPayload = {ok:boolean;apps?:AdminInstallableApp[];error?:string};
const request=async(method:AppMethod,body?:{key:string;enabled?:boolean}):Promise<AppsPayload>=>{
  const path=method==="GET"?"/api/apps/launcher":"/api/apps/install";
  let status:number;
  let payload:AppsPayload;
  if(isPackagedDesktop()){
    const res=await invokeStudioService({
      operation:"apps",path,method,account_id:await resolveDesktopStudioAccountId(),
      ...(body===undefined?{}:{body}),
    });
    status=res.status;
    payload=JSON.parse(res.body||"{}");
  }else{
    const res=await fetch(path,{method,credentials:"same-origin",
      headers:{accept:"application/json",...(body?{"content-type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    status=res.status;
    payload=await res.json().catch(()=>({ok:false,error:"apps_invalid_response"}));
  }
  if(status>=400||!payload?.ok)throw new Error(payload?.error||"apps_request_failed");
  return payload;
};

export async function listAccountApps():Promise<AdminInstallableApp[]>{
  const data=await request("GET");
  if(!Array.isArray(data.apps))throw Error("apps_inventory_invalid");
  return data.apps;
}
export async function installAccountApp(key:string){await request("POST",{key});}
export async function removeAccountApp(key:string){await request("DELETE",{key});}
export async function setAccountAppEnabled(key:string,enabled:boolean){await request("PATCH",{key,enabled});}
export function launchAccountApp(href:string){
  if(!/^\/(?!\/)[\w/%?&=.,#:+~-]*$/.test(href))throw Error("app_route_invalid");
  window.dispatchEvent(new CustomEvent("agentsam:navigate",{detail:{to:href}}));
}
export function notifyAppInventoryChanged(){
  window.dispatchEvent(new Event("agentsam:navigation-changed"));
}
