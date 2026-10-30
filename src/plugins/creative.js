import {normalizePluginManifest} from './contracts.js';
import {installPlugin, listPlugins} from './registry.js';

const MODULES=Object.freeze(['Flip','MorphSVGPlugin','MotionPathPlugin','SplitText','Draggable','Observer','ScrollTrigger','CustomEase','CustomBounce','CustomWiggle','Physics2DPlugin']);
export const GSAP_CREATIVE_PLUGIN=normalizePluginManifest({
 plugin_key:'gsap-creative',provider_key:'gsap',plugin_kind:'native',transport:'native',auth_type:'none',category:'creative',display_name:'GSAP creative motion',
 description:'Optional host-supplied GSAP runtime and reviewed plugins. Never downloaded or evaluated from catalog metadata.',
 composer_visible:false,config:{enabledModules:[]},
 capabilities:[{capability_key:'gsap-creative.sample',domain:'creative',verb:'sample',description:'Sample GSAP easing',is_mutating:false}],
 metadata:{source:'https://github.com/greensock/GSAP',version:'3.15.0',license:'GSAP Standard License',optional:true,modules:MODULES,delivery:'prototype/not-integrated',productionReview:'Record product licensing decision before commercial rollout.'},
 tools:[{tool_key:'gsap-creative.sample',display_name:'Sample GSAP easing',description:'Sample an installed GSAP easing at an integer-microsecond time.',dispatch_target:'native',handler_type:'media',handler_key:'gsap-creative.sample',connector_visible:false,input_schema:{type:'object',properties:{timeUs:{type:'integer',minimum:0},durationUs:{type:'integer',minimum:1},ease:{type:'string',enum:['none','power1.out','power2.out','power3.inOut','sine.inOut','back.out']}},required:['timeUs','durationUs'],additionalProperties:false}}],
});
export async function installGSAPCreativePlugin(db,{accountId,environment='production',enabledModules=[]}={}) {
 if(!Array.isArray(enabledModules)||enabledModules.some(x=>!MODULES.includes(x)))throw new Error('copro_gsap_module_unknown');
 // A real user-requested install through existing agentsam_plugins authority.
 return installPlugin(db,{accountId,environment,manifest:{...GSAP_CREATIVE_PLUGIN,capabilities:[...GSAP_CREATIVE_PLUGIN.capabilities,...[...new Set(enabledModules)].map(name=>({capability_key:`gsap-creative.${name}`,domain:'creative',verb:'use',description:`Host-provided optional GSAP ${name} module`,is_mutating:false}))],config:{enabledModules:[...new Set(enabledModules)]}},preserveEnabled:true});
}
/** Trusted host loads its own GSAP package and supplies the module objects.
 * Catalog rows select capabilities; they never select executable URLs/code.
 * Read the registry on every execution so disablement takes effect immediately. */
export function createGSAPCreativeDispatcher({db,gsap,modules={}}={}) {
 const registered=new Set();
 return async ({tool,args={},context={}}) => {
  if(tool?.handler_key!=='gsap-creative.sample'||tool?.tool_key!=='gsap-creative.sample')throw new Error('copro_creative_handler_unknown');
  if(!context.accountId)throw new Error('plugin_account_id_required');
  const installations=await listPlugins(db,{accountId:context.accountId,environment:context.environment||'production'});
  const installed=installations.find(p=>p.plugin_key==='gsap-creative'&&p.account_id===context.accountId&&Number(p.is_enabled)===1&&p.id===tool.plugin_id);
  if(!installed)throw new Error('copro_gsap_plugin_not_enabled');
  if(!gsap?.parseEase||!gsap?.registerPlugin)throw new Error('copro_gsap_runtime_unavailable');
  const enabled=installed.config?.enabledModules||[];
  for(const name of enabled){if(!MODULES.includes(name))throw new Error('copro_gsap_module_unknown');if(!modules[name])throw new Error('copro_gsap_module_unavailable:'+name);if(!registered.has(name)){gsap.registerPlugin(modules[name]);registered.add(name);}}
  if(!Number.isSafeInteger(args.timeUs)||args.timeUs<0||!Number.isSafeInteger(args.durationUs)||args.durationUs<=0)throw new RangeError('copro_gsap_time_invalid');
  const ease=args.ease||'power2.out';if(!['none','power1.out','power2.out','power3.inOut','sine.inOut','back.out'].includes(ease))throw new Error('copro_gsap_ease_unknown');
  const progress=Math.max(0,Math.min(1,args.timeUs/args.durationUs));const value=gsap.parseEase(ease)(progress);
  if(!Number.isFinite(value))throw new Error('copro_gsap_sample_invalid');
  return {schema:'copro.motion-sample.v1',timeUs:args.timeUs,durationUs:args.durationUs,progress,value,provider:'gsap',version:gsap.version,modules:[...enabled]};
 };
}
