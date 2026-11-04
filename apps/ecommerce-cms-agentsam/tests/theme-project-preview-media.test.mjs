import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderThemePage } from '../frontend/theme-editor/project.mjs';

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
