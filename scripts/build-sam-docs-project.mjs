#!/usr/bin/env node
/**
 * Non-destructive authoring import. Uses the same reusable CMS theme project
 * contract as every website. Builds a private draft for authenticated site
 * installation; never publishes the source HTML or writes D1 directly.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDocumentationProject} from '../packages/agentsam-docs-theme/cms-project.mjs';
import {validateThemeProjectPayload} from '../apps/ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,'docs/authoring/agentsam-sdk-docs-portal.json');
const data=JSON.parse(readFileSync(source,'utf8'));
if(data.schema!=='agentsam.documentation-collection.v1')throw Error('documentation_collection_schema_invalid');
const project=validateThemeProjectPayload(createDocumentationProject({
  id:data.id,name:data.name,siteName:data.siteName,version:data.version,pages:data.pages,
  stylesheets:[
    '/site/global/agentsam-docs-portal.css'
  ],runtimeUrl:'/site/global/agentsam-docs-portal.js',tokens:data.tokens,
}));
const result={project,site_slug:'agentsam-sdk',intended_site_id:'site_882ac8075543f0d4',
  publication:'draft-only',migration_source:'docs/authoring/agentsam-sdk-docs-portal.json'};
const output=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(output){
  const target=resolve(output);
  writeFileSync(target,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({ok:true,output:target,pages:project.pages.map(p=>({slug:p.slug,route:p.route,sections:p.sections.length})),
    code_sections:project.pages.flatMap(p=>p.sections).filter(s=>s.sourceKind==='documentation-code').length}));
}else console.log(JSON.stringify(result,null,2));
