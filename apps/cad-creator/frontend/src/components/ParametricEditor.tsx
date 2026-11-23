import React, { useState, useEffect, useMemo } from 'react';
import {
  Code,
  Box,
  Sliders,
  Play,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { DesignProject, ParametricObject, ParametricParameterDef } from '@inneranimalmedia/agentsam-cad-shared';
import {
  generateOpenScadFromParametric,
  generateFullBimOpenScad,
} from '../lib/openscad/generator';
import { useQuickAddCatalog } from './quick-add';
import type { QuickAddItem } from './quick-add/types';
import { createParametricObjectFromCatalog } from '../lib/studio-template-source';
import { validateOpenScadSource } from '../lib/openscad/sandbox';
import { getExecutionProvider } from '../lib/execution';
import { exportProjectToArtifact, downloadFile } from '../lib/exporters';
import { applyDesignOperation } from '@inneranimalmedia/agentsam-cad-shared';
import {OpenScadLibraryPane,insertOpenScadImport} from './OpenScadLibraryPane';

interface ParametricEditorProps {
  project: DesignProject;
  onUpdateProject: (newProject: DesignProject) => void;
  canEdit: boolean;
  initialObjectId?: string;
}

export const ParametricEditor: React.FC<ParametricEditorProps> = ({
  project,
  onUpdateProject,
  canEdit, initialObjectId,
}) => {
  const parametricObjects = project.parametricObjects || [];
  const catalog = useQuickAddCatalog(true);
  const parametricTemplates = catalog.items.filter(item => item.kind === 'cad_parametric_template');
  const [selectedObjId, setSelectedObjId] = useState<string>(
    initialObjectId || parametricObjects[0]?.id || ''
  );
  const [activeSubTab, setActiveSubTab] = useState<'params' | 'code' | 'fullbim' | 'logs'>('params');
  const [executionLogs, setExecutionLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] OpenSCAD Parametric Kernel Initialized.`,
  ]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [sourceCodeOverride, setSourceCodeOverride] = useState<string>('');
  const [libraryOpen,setLibraryOpen]=useState(false);

  const selectedObj = useMemo(() => {
    return parametricObjects.find((o) => o.id === selectedObjId) || parametricObjects[0];
  }, [parametricObjects, selectedObjId]);

  useEffect(()=>{if(initialObjectId){setSelectedObjId(initialObjectId);setActiveSubTab('code')}},[initialObjectId]);
  // Keep source code editor in sync
  useEffect(() => {
    if (selectedObj) {
      const src = generateOpenScadFromParametric(selectedObj);
      setSourceCodeOverride(selectedObj.source || src);
    }
  }, [selectedObj?.id]);

  const validationResult = useMemo(() => {
    if (activeSubTab === 'fullbim') {
      return validateOpenScadSource(generateFullBimOpenScad(project));
    }
    return validateOpenScadSource(sourceCodeOverride || (selectedObj ? generateOpenScadFromParametric(selectedObj) : ''));
  }, [sourceCodeOverride, selectedObj, activeSubTab, project]);

  const handleCreateNewObject = async (item: QuickAddItem) => {
    if (!canEdit) return;
    try {
      const newObj = await createParametricObjectFromCatalog(item, parametricObjects.length);
      const res = applyDesignOperation(project, {
        id: `op_add_${newObj.id}`,
        type: 'create_parametric_object',
        parametricObject: newObj,
        timestamp: Date.now(),
      });
      if (res.success) {
        onUpdateProject(res.project);
        setSelectedObjId(newObj.id);
        setExecutionLogs((prev) => [...prev, `[CREATED] Added registered parametric object: ${newObj.name}`]);
      } else {
        setExecutionLogs((prev) => [...prev, `[ERROR] ${res.error || 'The CAD engine rejected the parametric object.'}`]);
      }
    } catch (error) {
      setExecutionLogs((prev) => [...prev, `[ERROR] ${error instanceof Error ? error.message : 'The registered parametric template could not be loaded.'}`]);
    }
  };

  const handleParameterChange = (paramName: string, value: any) => {
    if (!selectedObj) return;
    const res = applyDesignOperation(project, {
      id: `op_upd_${selectedObj.id}_${paramName}`,
      type: 'update_parametric_parameter',
      parametricObjectId: selectedObj.id,
      parameterName: paramName,
      value,
      timestamp: Date.now(),
    });

    if (res.success) {
      // Regenerate source
      const updatedObj = res.project.parametricObjects.find((p) => p.id === selectedObj.id);
      if (updatedObj && !updatedObj.source) {
        const newScad = generateOpenScadFromParametric(updatedObj);
        setSourceCodeOverride(newScad);
      }
      onUpdateProject(res.project);
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedObj) return;
    const res = applyDesignOperation(project, {
      id: `op_del_${selectedObj.id}`,
      type: 'delete_parametric_object',
      parametricObjectId: selectedObj.id,
      timestamp: Date.now(),
    });
    if (res.success) {
      onUpdateProject(res.project);
      setSelectedObjId('');
      setExecutionLogs((prev) => [...prev, `[DELETED] Removed parametric object: ${selectedObj.name}`]);
    }
  };

  const handleCompileStl = async () => {
    if (!selectedObj && activeSubTab !== 'fullbim') return;
    setIsCompiling(true);
    const code = activeSubTab === 'fullbim' ? generateFullBimOpenScad(project) : (sourceCodeOverride || generateOpenScadFromParametric(selectedObj));

    try {
      const provider = getExecutionProvider();
      const res = await provider.executeOpenScad({
        source: code,
        outputFormat: 'stl',
        parameters: selectedObj?.parameters,
        filename: ((selectedObj?.name || project.name).toLowerCase().replace(/[^a-z0-9_-]+/g,'_').slice(0,70)||'model')+'.stl',
      });

      setExecutionLogs((prev) => [...prev, ...res.logs]);
      if (res.success && res.sha256 && res.verified===true && typeof res.artifactContent==='string') {
        downloadFile(res.artifactContent,res.filename,'model/stl');
        setExecutionLogs(previous=>[...previous,'[VERIFIED] Native compiler STL SHA-256: '+res.sha256]);
      } else {
        setExecutionLogs(previous=>[...previous,'[REJECTED] '+(res.error||'No verified native artifact returned')]);
      }
    } catch (err: any) {
      setExecutionLogs((prev) => [...prev, `[ERROR] ${err.message}`]);
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className="w-full h-full flex bg-[var(--cad-bg)] text-[var(--cad-ink)] overflow-hidden select-none">
      {/* Sidebar: List of Parametric Objects */}
      <div className="w-72 bg-[var(--cad-surface)] border-r border-[var(--cad-line)] flex flex-col shrink-0">
        <div className="p-3.5 border-b border-[var(--cad-line)] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Box className="w-4 h-4 text-[var(--cad-accent-ink)]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--cad-ink)]">
              Parametric Assemblies
            </h2>
          </div>
        </div>

        {/* Registered parametric catalog — no local template fallback. */}
        <div className="p-3 border-b border-[var(--cad-line)] space-y-1.5">
          <span className="text-[length:var(--text-sm)] font-semibold text-[var(--cad-muted)] block mb-1">
            Registered parametric templates
          </span>
          {catalog.status === 'loading' && <p className="text-xs text-[var(--cad-muted)]">Loading studio catalog…</p>}
          {catalog.status === 'error' && <button type="button" onClick={catalog.refresh} className="text-xs text-[var(--cad-muted)]">Catalog unavailable · Retry</button>}
          <div className="grid grid-cols-1 gap-1.5">
            {parametricTemplates.map(item => (
              <button
                key={item.id}
                onClick={() => void handleCreateNewObject(item)}
                disabled={!canEdit}
                className="flex items-center justify-between px-2.5 py-1.5 bg-[var(--cad-input)] hover:bg-[var(--cad-hover)] text-[var(--cad-ink)] hover:text-[var(--cad-ink)] rounded text-xs transition border border-[var(--cad-line)] disabled:opacity-50"
              >
                <div className="flex items-center space-x-2 truncate">
                  <Plus className="w-3.5 h-3.5 text-[var(--cad-accent-ink)] shrink-0" />
                  <span className="truncate">{item.title}</span>
                </div>
              </button>
            ))}
            {catalog.status === 'ready' && parametricTemplates.length === 0 && (
              <p className="text-xs text-[var(--cad-muted)]">No parametric templates are registered for CAD Creator.</p>
            )}
          </div>
        </div>

        {/* Objects list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {parametricObjects.length === 0 ? (
            <div className="text-center p-6 text-[var(--cad-muted)] text-xs">
              No parametric objects created yet. Click a template above to generate one.
            </div>
          ) : (
            parametricObjects.map((obj) => (
              <div
                key={obj.id}
                onClick={() => setSelectedObjId(obj.id)}
                className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                  selectedObj?.id === obj.id
                    ? 'bg-[var(--cad-hover)] border-[var(--cad-accent)] text-[var(--cad-ink)]'
                    : 'bg-[var(--cad-surface)] border-[var(--cad-line)] text-[var(--cad-muted)] hover:bg-[var(--cad-hover)] hover:text-[var(--cad-ink)]'
                }`}
              >
                <div className="truncate pr-2">
                  <p className="font-semibold truncate">{obj.name}</p>
                  <p className="text-[length:var(--text-xs)] text-[var(--cad-muted)] mt-0.5">
                    X: {Math.round(obj.transform.x)}" | Y: {Math.round(obj.transform.y)}"
                  </p>
                </div>
                <Box className="w-3.5 h-3.5 text-[var(--cad-accent-ink)] shrink-0" />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Center Area: Controls / Code Editor */}
      <div className="flex-1 flex flex-col bg-[var(--cad-bg)] overflow-hidden">
        {/* Sub-tabs header */}
        <div className="h-11 bg-[var(--cad-surface)] border-b border-[var(--cad-line)] px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveSubTab('params')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                activeSubTab === 'params'
                  ? 'bg-[var(--cad-accent)] text-[var(--cad-ink)] shadow'
                  : 'text-[var(--cad-muted)] hover:text-[var(--cad-ink)] hover:bg-[var(--cad-input)]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Parameters Form</span>
            </button>

            <button
              onClick={() => setActiveSubTab('code')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                activeSubTab === 'code'
                  ? 'bg-[var(--cad-accent)] text-[var(--cad-ink)] shadow'
                  : 'text-[var(--cad-muted)] hover:text-[var(--cad-ink)] hover:bg-[var(--cad-input)]'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>OpenSCAD Script</span>
            </button>

            <button
              onClick={() => setActiveSubTab('fullbim')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                activeSubTab === 'fullbim'
                  ? 'bg-[var(--cad-accent)] text-[var(--cad-ink)] shadow'
                  : 'text-[var(--cad-muted)] hover:text-[var(--cad-ink)] hover:bg-[var(--cad-input)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Full BIM Assembly SCAD</span>
            </button>

            <button
              onClick={() => setActiveSubTab('logs')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                activeSubTab === 'logs'
                  ? 'bg-[var(--cad-accent)] text-[var(--cad-ink)] shadow'
                  : 'text-[var(--cad-muted)] hover:text-[var(--cad-ink)] hover:bg-[var(--cad-input)]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Execution Logs ({executionLogs.length})</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {activeSubTab==='code'&&<button type="button" aria-expanded={libraryOpen} aria-label="Toggle OpenSCAD libraries"
              onClick={()=>setLibraryOpen(v=>!v)} className="px-2 py-1.5 border border-[var(--cad-line)] rounded text-xs hover:bg-[var(--cad-input)]">
              {libraryOpen?'Hide libraries':'Libraries'}
            </button>}
            {selectedObj && (
              <button
                onClick={handleDeleteSelected}
                disabled={!canEdit}
                className="p-1.5 text-[var(--cad-muted)] hover:text-[var(--cad-ink)] hover:bg-[var(--cad-hover)] rounded transition"
                title="Delete object"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={handleCompileStl}
              disabled={isCompiling}
              className="flex items-center space-x-1.5 px-3 py-1 bg-[var(--cad-accent)] hover:bg-[var(--cad-hover)] text-[var(--cad-ink)] rounded text-xs font-semibold shadow transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isCompiling ? 'Compiling...' : 'Export STL'}</span>
            </button>
          </div>
        </div>

        {/* Validation Status Indicator */}
        <div className="px-4 py-1.5 bg-[var(--cad-surface)] border-b border-[var(--cad-line)] flex items-center justify-between text-[length:var(--text-sm)]">
          <div className="flex items-center space-x-2">
            {validationResult.valid ? (
              <div className="flex items-center space-x-1 text-[var(--cad-accent-ink)] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>OpenSCAD AST & Sandbox Verified</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-[var(--cad-muted)] font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Security/Syntax issue: {validationResult.errors[0]}</span>
              </div>
            )}
          </div>
          <span className="text-[var(--cad-muted)] font-mono text-[length:var(--text-xs)]">
            Engine: Safe Client/Server CSG Kernel
          </span>
        </div>

        {/* Sub-tab views */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeSubTab === 'params' && (
            selectedObj ? (
              <div className="max-w-2xl space-y-4">
                <div className="bg-[var(--cad-surface)] p-4 rounded-xl border border-[var(--cad-line)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--cad-ink)]">{selectedObj.name}</h3>
                      <p className="text-xs text-[var(--cad-muted)]">
                        {selectedObj.generatorTemplate ? `Registered studio template · ${selectedObj.generatorTemplate}` : 'Custom parametric generator'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    {(selectedObj.parameterDefs || []).map((def) => {
                      const currentVal = selectedObj.parameters[def.name] ?? def.value;

                      if (def.type === 'boolean') {
                        return (
                          <div key={def.name} className="flex items-center justify-between py-1">
                            <span className="text-xs text-[var(--cad-muted)] font-medium">{def.label}</span>
                            <input
                              type="checkbox"
                              checked={Boolean(currentVal)}
                              onChange={(e) => handleParameterChange(def.name, e.target.checked)}
                              disabled={!canEdit}
                              className="rounded bg-[var(--cad-input)] border-[var(--cad-line)] text-[var(--cad-accent-ink)] focus:ring-purple-500 h-4 w-4"
                            />
                          </div>
                        );
                      }

                      return (
                        <div key={def.name} className="space-y-1">
                          <div className="flex justify-between text-xs text-[var(--cad-muted)]">
                            <span>{def.label}</span>
                            <span className="font-mono text-[var(--cad-accent-ink)]">
                              {currentVal} {def.unit || ''}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={def.min || 1}
                            max={def.max || 100}
                            step={def.step || 1}
                            value={Number(currentVal)}
                            onChange={(e) => handleParameterChange(def.name, parseFloat(e.target.value))}
                            disabled={!canEdit}
                            className="w-full h-1.5 bg-[var(--cad-input)] rounded-lg appearance-none cursor-pointer accent-purple-500"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Spatial positioning */}
                <div className="bg-[var(--cad-surface)] p-4 rounded-xl border border-[var(--cad-line)] space-y-3">
                  <h4 className="text-xs font-bold text-[var(--cad-muted)] uppercase tracking-wider">
                    Spatial Floor Transform (Inches)
                  </h4>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-[var(--cad-muted)] text-[length:var(--text-xs)] block">Position X</label>
                      <input
                        type="number"
                        value={selectedObj.transform.x}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const res = applyDesignOperation(project, {
                            id: `op_mv_${selectedObj.id}`,
                            type: 'move_element',
                            elementType: 'parametric',
                            elementId: selectedObj.id,
                            dx: val - selectedObj.transform.x,
                            dy: 0,
                            timestamp: Date.now(),
                          });
                          if (res.success) onUpdateProject(res.project);
                        }}
                        className="w-full bg-[var(--cad-input)] border border-[var(--cad-line)] rounded px-2 py-1 text-[var(--cad-ink)] text-xs mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-[var(--cad-muted)] text-[length:var(--text-xs)] block">Position Y</label>
                      <input
                        type="number"
                        value={selectedObj.transform.y}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const res = applyDesignOperation(project, {
                            id: `op_mv_${selectedObj.id}`,
                            type: 'move_element',
                            elementType: 'parametric',
                            elementId: selectedObj.id,
                            dx: 0,
                            dy: val - selectedObj.transform.y,
                            timestamp: Date.now(),
                          });
                          if (res.success) onUpdateProject(res.project);
                        }}
                        className="w-full bg-[var(--cad-input)] border border-[var(--cad-line)] rounded px-2 py-1 text-[var(--cad-ink)] text-xs mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-[var(--cad-muted)] text-[length:var(--text-xs)] block">Elevation Z</label>
                      <input
                        type="number"
                        value={selectedObj.transform.z || 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const res = applyDesignOperation(project, {
                            id: `op_mv_${selectedObj.id}`,
                            type: 'move_element',
                            elementType: 'parametric',
                            elementId: selectedObj.id,
                            dx: 0,
                            dy: 0,
                            dz: val - (selectedObj.transform.z || 0),
                            timestamp: Date.now(),
                          });
                          if (res.success) onUpdateProject(res.project);
                        }}
                        className="w-full bg-[var(--cad-input)] border border-[var(--cad-line)] rounded px-2 py-1 text-[var(--cad-ink)] text-xs mt-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[var(--cad-muted)] text-xs p-6 text-center">
                Select or create a parametric object on the left.
              </div>
            )
          )}

          {activeSubTab === 'code' && (
            <div className="h-full min-h-0 flex flex-col lg:flex-row gap-2 overflow-y-auto">
              <textarea
                value={sourceCodeOverride}
                onChange={(e) => setSourceCodeOverride(e.target.value)}
                disabled={!canEdit}
                spellCheck={false}
                className="w-full flex-1 bg-[var(--cad-surface)] font-mono text-xs text-[var(--cad-accent-ink)] p-4 rounded-xl border border-[var(--cad-line)] focus:outline-none focus:border-[var(--cad-accent)] resize-none min-h-[320px]"
              />
              {libraryOpen&&<OpenScadLibraryPane disabled={!canEdit} onInsert={line=>{
                try{setSourceCodeOverride(previous=>insertOpenScadImport(previous,line));setExecutionLogs(previous=>[...previous,'[LIBRARY] Inserted registered import '+line]);}
                catch(e){setExecutionLogs(previous=>[...previous,'[LIBRARY] '+String(e)]);}
              }}/>}
            </div>
          )}

          {activeSubTab === 'code'&&selectedObj&&<div className="flex justify-end gap-2 px-4 pb-3">
            <button type="button" className="rounded-md border border-[var(--cad-line)] px-3 py-1.5 text-xs"
             onClick={()=>setSourceCodeOverride(selectedObj.source||generateOpenScadFromParametric(selectedObj))}>Revert</button>
            <button type="button" className="rounded-md bg-[var(--cad-accent)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
             disabled={!canEdit||!validationResult.valid||sourceCodeOverride===selectedObj.source}
             onClick={()=>{
              const result=applyDesignOperation(project,{id:'cad-code-'+crypto.randomUUID(),timestamp:Date.now(),type:'update_parametric_source',
                parametricObjectId:selectedObj.id,source:sourceCodeOverride});
              if(result.success){onUpdateProject(result.project);setExecutionLogs(previous=>[...previous,'[APPLIED] Validated OpenSCAD source for '+selectedObj.id]);}
              else setExecutionLogs(previous=>[...previous,'[REJECTED] '+result.error]);
             }}>Apply source to project</button>
           </div>}
          {activeSubTab === 'fullbim' && (
            <div className="h-full flex flex-col space-y-2">
              <div className="text-xs text-[var(--cad-muted)] mb-1">
                Generated complete OpenSCAD script for all walls, cutouts, rooms, and embedded parametric objects:
              </div>
              <textarea
                readOnly
                value={generateFullBimOpenScad(project)}
                spellCheck={false}
                className="w-full flex-1 bg-[var(--cad-surface)] font-mono text-xs text-[var(--cad-accent-ink)] p-4 rounded-xl border border-[var(--cad-line)] resize-none min-h-[400px]"
              />
            </div>
          )}

          {activeSubTab === 'logs' && (
            <div className="bg-[var(--cad-bg)] font-mono text-xs text-[var(--cad-muted)] p-4 rounded-xl border border-[var(--cad-line)] space-y-1.5 h-full overflow-y-auto">
              {executionLogs.map((log, i) => (
                <div key={i} className="text-[var(--cad-muted)]">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
