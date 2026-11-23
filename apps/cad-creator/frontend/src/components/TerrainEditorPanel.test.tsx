import {describe,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TerrainEditorPanel} from './TerrainEditorPanel';
import {createTerrainDocument} from '../lib/world-terrain';

const terrain={...createTerrainDocument(),treeCount:2,rockCount:2};
const noop=()=>{};

describe('project-owned terrain inspector',()=>{
  it('renders the full editable site workflow using semantic appearance classes',()=>{
    const html=renderToStaticMarkup(createElement(TerrainEditorPanel,{
      document:terrain,resetDocument:terrain,onChange:noop,sculptMode:null,onSculptMode:noop,
      brushRadius:8,onBrushRadius:noop,brushStrength:1.5,onBrushStrength:noop,onFitSite:noop,
    }));
    expect(html).toContain('aria-label="Site terrain editor"');
    expect(html).toContain('Site &amp; Terrain');
    for(const label of ['World scale','Landforms','Sculpt on terrain','Landscape scenery','Terrain document'])expect(html).toContain(label);
    expect(html).toContain('cad-terrain-panel__control');
    expect(html).toContain('cad-terrain-panel__button');
    expect(html).toContain('Import sampled elevation grid');
    expect(html).not.toMatch(/text-slate|border-white|bg-slate|bg-sky|border-rose|text-rose/);
  });
});
