/**
 * Bounded Wrangler TOML binding discovery, not a general TOML evaluator.
 * Only allowlisted binding descriptors leave this module. Secrets, vars,
 * tokens, URLs and arbitrary TOML contents must never be emitted.
 */
const FAMILIES = Object.freeze({
  d1_databases: ['d1','database_name'],
  r2_buckets: ['r2','bucket_name'],
  vectorize: ['vectorize','index_name'],
  hyperdrive: ['postgres-hyperdrive','id'],
  kv_namespaces: ['kv','id'],
});

export function parseWranglerTomlBindings(text, source) {
  const candidates=[];
  const lines=String(text).split(/\r?\n/);
  let active=null;
  for (const line of lines) {
    const section=line.trim().match(/^\[\[([a-zA-Z0-9_.-]+)\]\](?:\s*#.*)?$/);
    if(section){
      const parts=section[1].split('.');
      let family=null,environment=null;
      if(parts.length===1)family=parts[0];
      if(parts.length===3&&parts[0]==='env'){
        environment=parts[1]; family=parts[2];
      }
      active=Object.hasOwn(FAMILIES,family)?{family,environment,attributes:{}}:null;
      if(active)candidates.push(active);
      continue;
    }
    if(/^\s*\[/.test(line)) {active=null;continue;}
    if(!active)continue;
    const prop=line.match(/^\s*(binding|database_name|bucket_name|index_name|id)\s*=\s*(["'])([^"'\r\n]{1,256})\2(?:\s*(?:#.*)?)?$/);
    if(prop)active.attributes[prop[1]]=prop[3];
  }
  return candidates.filter(c=>c.attributes.binding).map(c=>{
    const [driver,key]=FAMILIES[c.family];
    return {id:`${source}:${c.environment||'default'}:${c.attributes.binding}`,driver,
      role:'application',binding:c.attributes.binding,name:c.attributes[key]||null,
      source,environment:c.environment,selectable:false,
      status:'declared; connectivity not verified'};
  });
}
