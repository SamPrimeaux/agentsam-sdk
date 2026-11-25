import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderThemePage, validateThemeProject } from '../frontend/theme-editor/project.mjs';

const require = createRequire(import.meta.url);
const {JSDOM}=require('jsdom');

test('editable but empty image source does not request the theme preview document',()=>{
  const win=new JSDOM('<!doctype html><html></html>').window;
  const previous=globalThis.DOMParser;
  globalThis.DOMParser=win.DOMParser;
  try {
    const page={
      slug:'home',
      template:'<!doctype html><html><head></head><body><!--theme-section:section_1--></body></html>',
      sections:[{
        key:'section_1',
        html:'<section><img data-theme-project-field="media" src="broken.webp" alt="Draft image"><h1>Real content</h1></section>',
        content:{media:'',__editor:{visibility:{enabled:true},blocks:[]}},
        schema:{fields:[{key:'media',type:'media',binding:{attribute:'src'}}],settings:[],blocks:[]},
      }],
    };
    const html=renderThemePage(page);
    const parsed=new win.DOMParser().parseFromString(html,'text/html');
    const img=parsed.querySelector('img');
    assert.ok(img);
    assert.equal(img.hasAttribute('src'),false,'blank media remains editable without a broken request');
    assert.equal(img.getAttribute('data-cms'),'media');
    assert.match(parsed.body.textContent,/Real content/);
  } finally {globalThis.DOMParser=previous;win.close();}
});


test('nested field paths are editable without permitting prototype keys',()=>{
  const win=new JSDOM('<!doctype html><html></html>').window;
  const previous=globalThis.DOMParser;
  globalThis.DOMParser=win.DOMParser;
  try {
    const page={slug:'home',template:'<!doctype html><html><head></head><body><!--theme-section:section_1--></body></html>',sections:[{key:'section_1',html:'<section><a data-theme-project-field="action.label" href="/old">Old</a></section>',content:{action:{label:'Edited',href:'/new'}},schema:{fields:[{key:'action.label',type:'text'},{key:'action.href',type:'link',binding:{field:'action.label',attribute:'href'}}],blocks:[]}}]};
    const project={schema:'agentsam.theme-project.v1',id:'theme_test',name:'Test',pages:[page]};
    assert.doesNotThrow(()=>validateThemeProject(project));
    const doc=new win.DOMParser().parseFromString(renderThemePage(page),'text/html');
    assert.equal(doc.querySelector('a').textContent,'Edited');
    assert.equal(doc.querySelector('a').getAttribute('href'),'/new');
    for(const invalid of ['action.__proto__','constructor.prototype','action..label']){
      const copy=structuredClone(project);copy.pages[0].sections[0].schema.fields[0].key=invalid;
      assert.throws(()=>validateThemeProject(copy),/theme_project_field_invalid/);
    }
  }finally{globalThis.DOMParser=previous;win.close();}
});
