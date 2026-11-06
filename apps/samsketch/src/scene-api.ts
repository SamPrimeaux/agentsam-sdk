/** Authenticated SamSketch scene persistence through the existing Work host. */
export type SceneSummary = {
  id:string;
  name:string;
  revision:number;
  updatedAt:string;
  itemCount:number;
  contentHash:string;
  preview:string|null;
};
const endpoint="/api/work/samsketch/scenes";
type ResponseShape<T>=T&{ok:boolean;error?:string};
async function requestJson<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...init});
 const body=await response.json().catch(()=>null) as ResponseShape<T>|null;
 if(!response.ok||!body?.ok)throw new Error(body?.error||"SamSketch storage request failed (HTTP "+response.status+").");
 return body as T;
}
export const listScenes=()=>requestJson<{scenes:SceneSummary[]}>(endpoint);
export const openScene=(id:string)=>requestJson<{scene:SceneSummary;document:unknown}>(endpoint+"/"+encodeURIComponent(id));
export const createScene=(id:string,document:unknown,preview?:string)=>requestJson<{scene:SceneSummary;created:boolean}>(endpoint,{
 method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,document,preview}),
});
export const updateScene=(id:string,hash:string,document:unknown,preview?:string)=>requestJson<{scene:SceneSummary}>(endpoint+"/"+encodeURIComponent(id),{
 method:"PUT",headers:{"content-type":"application/json","if-match":'"'+hash+'"'},body:JSON.stringify({document,preview}),
});
export const removeScene=(id:string)=>requestJson<{ok:true}>(endpoint+"/"+encodeURIComponent(id),{method:"DELETE"});
