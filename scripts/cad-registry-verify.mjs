import fs from 'node:fs';
const expected=JSON.parse(fs.readFileSync(new URL('../registry/cad-project/manifest.json',import.meta.url),'utf8'));
const live=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const checks=[['tools',expected.tools],['workflows',expected.workflows.map(w=>w.row)],['nodes',expected.workflows.flatMap(w=>w.nodes)],['edges',expected.workflows.flatMap(w=>w.edges)]];
let count=0;
for(const [key,rows] of checks)for(const row of rows){
 const actual=live[key]?.find(r=>r.id===row.id);
 if(!actual)throw new Error('missing_live_row:'+key+':'+row.id);
 for(const [field,value] of Object.entries(row))if(actual[field]!==value)throw new Error('live_registry_drift:'+row.id+':'+field);
 count++;
}
for(const tool of expected.tools){
 const link=live.links?.find(r=>r.tool_id===tool.id&&r.capability_key===tool.capability_key);
 if(!link||link.is_primary!==1||link.operations_json!==JSON.stringify([tool.tool_name]))throw new Error('live_capability_link_drift:'+tool.id);
}
console.log(JSON.stringify({ok:true,matched_rows:count,capability_links:expected.tools.length}));
