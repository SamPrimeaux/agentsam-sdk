import fs from 'node:fs';
import path from 'node:path';
import {runProjectWorkflow,CAD_PROJECT_WORKFLOWS} from './project-workflows.js';
import {FileProjectStore} from './project-store.js';
import {createProjectRuntime} from './project-runtime.js';
export function localProjectRuntime(root=process.cwd(),onProjectChanged){
 return createProjectRuntime({store:new FileProjectStore(path.join(root,'.agentsam/cad/projects')),artifactRoot:path.join(root,'.agentsam/cad/artifacts'),onProjectChanged});
}
export async function runProjectCli(args){
 if(!args.length||args.includes('--help')){console.log('agentsam cad project <get|validate|apply|save|restore|build|inspect|render|export|tools> <request.json> [--root <project-directory>]');return;}
 const names={get:'design_project_get',validate:'design_project_validate',apply:'design_apply_operation',save:'design_project_save',restore:'design_project_restore',build:'design_model_build',inspect:'design_model_inspect',render:'design_model_render',export:'design_model_export'};
 const rootIndex=args.indexOf('--root'),root=rootIndex<0?process.cwd():path.resolve(args[rootIndex+1]);
 const runtime=localProjectRuntime(root);
 if(args[0]==='workflows'){console.log(JSON.stringify(CAD_PROJECT_WORKFLOWS));return;}
 if(args[0]==='workflow'){const input=JSON.parse(fs.readFileSync(args[2]==='-'?0:args[2],'utf8'));console.log(JSON.stringify(await runProjectWorkflow(runtime,args[1],input,{evidenceRoot:path.join(root,'.agentsam/cad/workflow-runs')})));return;}
 if(args[0]==='invoke'){const input=JSON.parse(Buffer.from(args[2],'base64url').toString('utf8'));console.log(JSON.stringify(await runtime.execute(args[1],input)));return;}
 if(args[0]==='tools'){console.log(JSON.stringify(runtime.catalog()));return;}
 const tool=names[args[0]];if(!tool)throw new Error('unknown_project_command');
 const request=JSON.parse(fs.readFileSync(args[1]==='-'?0:args[1],'utf8'));
 console.log(JSON.stringify(await runtime.execute(tool,request)));
}
