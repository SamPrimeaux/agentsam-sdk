import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {CadEngineeringToolbar} from './EngineeringWorkbench';

const noop = vi.fn();
const props: React.ComponentProps<typeof CadEngineeringToolbar> = {
  tool:'select', onTool:noop, workspace:'plan', onWorkspace:noop,
  planLayout:'split', onPlanLayout:noop, readOnly:false,
  onNew:noop, onTemplates:noop, onExport:noop,
  onToggleExplorer:noop, onToggleInspector:noop,
  explorerOpen:false, inspectorOpen:true, onStock:noop,
  onUndo:noop, onRedo:noop, canUndo:true, canRedo:false,
  onToggleDiagnostics:noop, showDiagnostics:false,
  studioView:'edit', onStudioView:noop,
  viewportMode:'split', onViewportMode:noop,
  runtimeSlot:null, projectSlot:null, onSave:noop,
};

describe('CAD Studio Wave 1 toolbar contract',()=>{
  it('exposes real 2D / 3D / split modes and independent panel toggles',()=>{
    const html=renderToStaticMarkup(React.createElement(CadEngineeringToolbar,props));
    expect(html).toContain('aria-label="Canvas arrangement"');
    expect(html).toContain('aria-label="2D plan canvas"');
    expect(html).toContain('aria-label="3D model canvas"');
    expect(html).toContain('aria-label="Split 2D and 3D canvas" aria-pressed="true"');
    expect(html).toContain('aria-label="Objects / project explorer"');
    expect(html).toContain('aria-label="Properties / contextual inspector"');
    expect(html).toContain('aria-label="Export project"');
  });

  it('preserves revision and undo access while working in 3D',()=>{
    const html=renderToStaticMarkup(React.createElement(CadEngineeringToolbar,{
      ...props,workspace:'model',viewportMode:'3d',studioView:'preview',
    }));
    expect(html).toContain('aria-label="3D model canvas" aria-pressed="true"');
    expect(html).toContain('aria-label="Project revisions"');
    expect(html).not.toContain('Advanced CAD tools');
    expect(html).toContain('Undo');
    expect(html).toContain('Redo');
    expect(html).toContain('aria-label="Workspace panels"');
    expect(html).toContain('aria-label="Scene performance"');
    expect(html).toContain('aria-label="Save revision"');
  });
});
