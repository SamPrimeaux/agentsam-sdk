import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {CadInspectorSource} from './CadInspectorSource';
import {CadResourcesPane} from './CadResourcesPane';
import {createEmptyCadProject} from '../lib/create-empty-project';
import {OPENSCAD_PARAMETRIC_TEMPLATES} from '../lib/openscad/generator';
import {insertOpenScadImport} from './OpenScadLibraryPane';
import {applyDesignOperation} from '@inneranimalmedia/agentsam-cad-shared';

const noop=vi.fn();
describe('contextual CAD element editing',()=>{
 const project=createEmptyCadProject();
 project.walls=[{id:'wall-1',x1:0,y1:0,x2:120,y2:0,thickness:6,height3D:96,material:'wood_panel'}];
 it('renders wall BIM JSON inside the existing inspector, not a new workbench',()=>{
  const html=renderToStaticMarkup(<CadInspectorSource project={project} selection={{group:'walls',id:'wall-1'}}
   onChange={noop} readOnly={false}/>);
  expect(html).toContain('Selected element source');
  expect(html).toContain('wall-1.bim.json');
  expect(html).toContain('Apply validated edit');
  expect(html).toContain('&quot;x2&quot;: 120');
 });
 it('marks imported 3D scene elements as non-native sources',()=>{
  const html=renderToStaticMarkup(<CadInspectorSource project={project} selection={{group:'sceneElements',id:'glb-source'}}
   onChange={noop} readOnly={true}/>);
  expect(html).toContain('not an editable native BIM entity');
 });
 it('offers actual generator templates and registered import tooling in the existing Libraries rail',()=>{
  const html=renderToStaticMarkup(<CadResourcesPane mode="libraries" project={project} selection={null}
   onSelect={noop} onClose={noop} onApplyAssembly={noop} onPlaceStock={noop}
   onCreateParametric={noop} onInsertScadImport={noop} onOpenTemplates={noop} readOnly={false}/>);
  expect(html).toContain('Library categories');
  expect(html).toContain('Parametric');
  expect(html).toContain('OpenSCAD');
  expect(html).toContain('Assembly');
 });

 it('creates and updates parametric source through the actual CAD operation reducer',()=>{
  const template=OPENSCAD_PARAMETRIC_TEMPLATES.workstation;
  const object={id:'param-test',name:template.name,generator:'openscad' as const,generatorTemplate:'workstation',
   parameters:{...template.defaultParams},parameterDefs:template.parameterDefs,
   transform:{x:48,y:48,z:0,rotationY:0},source:template.generateScad(template.defaultParams)};
  const created=applyDesignOperation(project,{id:'create-part',timestamp:Date.now(),type:'create_parametric_object',parametricObject:object});
  expect(created.success).toBe(true);
  if(!created.success)return;
  const nextSource=insertOpenScadImport(object.source,'use <BOSL2/std.scad>');
  const updated=applyDesignOperation(created.project,{id:'edit-part',timestamp:Date.now(),
   type:'update_parametric_source',parametricObjectId:object.id,source:nextSource});
  expect(updated.success).toBe(true);
  if(updated.success)expect(updated.project.parametricObjects?.[0]?.source).toContain('BOSL2/std.scad');
 });

});
