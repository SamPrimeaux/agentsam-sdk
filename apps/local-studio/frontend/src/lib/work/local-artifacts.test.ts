import test from "node:test";
import assert from "node:assert/strict";
import type { Project, Trail } from "@inneranimalmedia/agentsam-local-shared";
import { listLocalWorkspaceArtifacts, localArtifactTarget } from "./local-artifacts.ts";
import { trustedLoopbackRuntimeOrigin } from "./workspace-origin.ts";

const file = (id: string, path: string) => ({id,path,updatedAt:Date.now(),content:"",language:"typescript",kind:"code" as const});
const project = (id:string,kind:"scratch"|"filesystem"): Project =>
  ({id,name:id,kind,files:[file(id+":f","src/model.ts")],workspaceRoot:kind==="filesystem"?"/tmp/"+id:null}) as Project;

test("files from different authorized roots have separate editor ids, never sample scratch assets",()=>{
 const projects=[project("web","filesystem"),project("cad","filesystem"),project("scratch","scratch")];
 const files=listLocalWorkspaceArtifacts(projects,[] as Trail[]);
 assert.equal(files.length,2);
 assert.notEqual(files[0]?.id,files[1]?.id);
 assert.equal(files.every(a=>a.source==="local"),true);
 assert.equal(files.every(a=>a.projectId===null),true);
 assert.deepEqual(localArtifactTarget(files[0]!.id,projects),{projectId:"web",fileId:"web:f",path:"src/model.ts"});
});
test("only explicit unambiguous Work-project assignment associates Gallery media",()=>{
 const projects=[project("cad","filesystem")];
 const trails=[{id:"t1",projectId:"cad",workProjectId:"proj_dreamhouse"}] as Trail[];
 assert.equal(listLocalWorkspaceArtifacts(projects,trails)[0]?.projectId,"proj_dreamhouse");
 const ambiguous=[...trails,{id:"t2",projectId:"cad",workProjectId:"proj_else"}] as Trail[];
 assert.equal(listLocalWorkspaceArtifacts(projects,ambiguous)[0]?.projectId,null);
 assert.equal(localArtifactTarget("local:forged",projects),null);
});


test("filesystem capability bootstrap never targets arbitrary remote origins",()=>{
  const bad = ["https://example.com", "http://example.com:3099/", "http://127.0.0.1:3099/path",
    "http://user:pass@localhost:3099/", "http://localhost:3099/?token=abc"];
  for (const url of bad) assert.equal(trustedLoopbackRuntimeOrigin(url),null,url);
  assert.equal(trustedLoopbackRuntimeOrigin("http://127.0.0.1:3099"),"http://127.0.0.1:3099");
  assert.equal(trustedLoopbackRuntimeOrigin("http://localhost:3101"),"http://localhost:3101");
});
