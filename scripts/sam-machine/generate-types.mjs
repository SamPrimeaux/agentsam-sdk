/**
 * Source-derived TypeScript capability metadata. CAPABILITIES is a projection,
 * not an independent permission registry or source of actual handler readiness.
 */
export function generateCapabilityTypes(operations) {
  const surfaces=['studio','collection','storefront','checkout','install','template','automation',
    'fulfillment','cms','media','mail','campaign','workspace','ide','cad','copro','agent','knowledge','database','report'];
  const interactions=['view','list','search','inspect','analyze','decide','edit','generate','render','export',
    'save','publish','add','purchase','run','grant','apply','submit','send','delete'];
  const actors=['merchant','customer','developer','agent','system'];
  const gates=['supported','verified'];
  const authorities=['sam','acp','mcp','plugin','cms','commerce','ide','cad','copro'];
  const typed=(name,values)=>'export type '+name+' = '+values.map(JSON.stringify).join(' | ')+';\n';
  const header=[
    '// GENERATED from the active SAM operation registry. NOT a security policy.',
    '// Runtime identity, actor, tenant, grants, approvals and health must be checked independently.',
    typed('Surface',surfaces),typed('Interaction',interactions),typed('Actor',actors),typed('Gate',gates),
    typed('Authority',authorities),
    'export interface CapabilitySpec {',
    '  surface: Surface; interaction: Interaction; actors: readonly Actor[];',
    '  gate: Gate; authority: Authority; operation: string;',
    '  requires?: readonly string[]; effect: "read" | "write" | "publish" | "external";',
    '}',
  ];
  const surfaceFor=module=>({repository:'workspace',brand:'studio',decision:'agent',planning:'agent',
    security:'workspace',package:'workspace',cad:'cad',robotics:'cad',terminal:'workspace',
    codebaseindex:'knowledge',artifact:'report',media:'media'}[module]||'agent');
  const interactionFor=action=>interactions.includes(action)?action:
    /inspect|scan|audit/.test(action)?'inspect':
    /generate|render/.test(action)?'render':/execute|run/.test(action)?'run':'view';
  const rows=operations.map(op=>{
    const effect=op.side_effects==='none'||op.side_effects==='remote_read'?'read':
      op.side_effects==='deploy'?'publish':op.side_effects==='billable'?'external':'write';
    const action=op.id.split('.').at(-1);
    // No actor grants are assumed by generation. The host supplies them.
    return '  '+JSON.stringify(op.id)+': {surface:'+JSON.stringify(surfaceFor(op.module))+
      ',interaction:'+JSON.stringify(interactionFor(action))+',actors:[],'+
      'gate:"supported",authority:"sam",operation:'+JSON.stringify(op.id)+
      ',effect:'+JSON.stringify(effect)+'},';
  });
  return header.join('\n')+'\nexport const CAPABILITIES = {\n'+rows.join('\n')+
    '\n} as const satisfies Record<string, CapabilitySpec>;\n';
}
