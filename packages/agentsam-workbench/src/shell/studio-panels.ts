export const studioInspectorFamilies = [
  {id:'object', label:'Object & Transform', group:'Selection', glyph:'sliders'},
  {id:'geometry', label:'Geometry', group:'Selection', glyph:'cube'},
  {id:'bim', label:'BIM & Engineering', group:'Selection', glyph:'house'},
  {id:'materials', label:'Materials', group:'Selection', glyph:'palette'},
  {id:'camera', label:'Camera', group:'Scene', glyph:'camera'},
  {id:'environment', label:'Environment', group:'Scene', glyph:'cloud'},
  {id:'lighting', label:'Lighting', group:'Scene', glyph:'sun'},
  {id:'terrain', label:'Terrain & Site', group:'Scene', glyph:'compass'},
  {id:'rendering', label:'Rendering', group:'Scene', glyph:'aperture'},
  {id:'motion', label:'Motion & Presentation', group:'Scene', glyph:'story'},
  {id:'analysis', label:'Analysis', group:'Engineering', glyph:'scan'},
  {id:'simulation', label:'Simulation', group:'Engineering', glyph:'activity'},
  {id:'project', label:'Project', group:'Document', glyph:'folder'},
  {id:'source', label:'Source', group:'Document', glyph:'workflow'},
] as const;
export type StudioInspectorFamily = typeof studioInspectorFamilies[number]['id'];

export function studioInspectorFamily(id:StudioInspectorFamily) {
  return studioInspectorFamilies.find(family=>family.id===id)!;
}
