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
  OPENSCAD_PARAMETRIC_TEMPLATES,
  generateOpenScadFromParametric,
  generateFullBimOpenScad,
} from '../lib/openscad/generator';
import { validateOpenScadSource } from '../lib/openscad/sandbox';
import { getExecutionProvider } from '../lib/execution';
import { exportProjectToArtifact, downloadFile } from '../lib/exporters';
import { applyDesignOperation } from '@inneranimalmedia/agentsam-cad-shared';

interface ParametricEditorProps {
  project: DesignProject;
  onUpdateProject: (newProject: DesignProject) => void;
  canEdit: boolean;
}

export const ParametricEditor: React.FC<ParametricEditorProps> = ({
  project,
  onUpdateProject,
  canEdit,
}) => {
  const parametricObjects = project.parametricObjects || [];
  const [selectedObjId, setSelectedObjId] = useState<string>(
    parametricObjects[0]?.id || ''
  );
  const [activeSubTab, setActiveSubTab] = useState<'params' | 'code' | 'fullbim' | 'logs'>('params');
  const [executionLogs, setExecutionLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] OpenSCAD Parametric Kernel Initialized.`,
  ]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [sourceCodeOverride, setSourceCodeOverride] = useState<string>('');

  const selectedObj = useMemo(() => {
    return parametricObjects.find((o) => o.id === selectedObjId) || parametricObjects[0];
  }, [parametricObjects, selectedObjId]);

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

  const handleCreateNewObject = (templateKey: string) => {
    const tpl = OPENSCAD_PARAMETRIC_TEMPLATES[templateKey] || OPENSCAD_PARAMETRIC_TEMPLATES.workstation;
    const newObj: ParametricObject = {
      id: `param_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: `${tpl.name} #${parametricObjects.length + 1}`,
      generator: 'openscad',
      generatorTemplate: templateKey,
      parameters: { ...tpl.defaultParams },
      parameterDefs: tpl.parameterDefs,
      transform: { x: 48 + parametricObjects.length * 24, y: 48, z: 0, rotationY: 0 },
      source: tpl.generateScad(tpl.defaultParams),
      updatedAt: Date.now(),
    };

    const res = applyDesignOperation(project, {
      id: `op_add_${newObj.id}`,
      type: 'create_parametric_object',
      parametricObject: newObj,
      timestamp: Date.now(),
    });

    if (res.success) {
      onUpdateProject(res.project);
      setSelectedObjId(newObj.id);
      setExecutionLogs((prev) => [...prev, `[CREATED] Added new parametric object: ${newObj.name}`]);
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
        filename: `${(selectedObj?.name || project.name).toLowerCase().replace(/\s+/g, '_')}.stl`,
      });

      setExecutionLogs((prev) => [...prev, ...res.logs]);
      if (res.success && res.artifactContent) {
        downloadFile(res.artifactContent as string, res.filename, 'model/stl');
      } else {
        alert(`Compilation failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setExecutionLogs((prev) => [...prev, `[ERROR] ${err.message}`]);
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className="w-full h-full flex bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* Sidebar: List of Parametric Objects */}
      <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Box className="w-4 h-4 text-purple-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Parametric Assemblies
            </h2>
          </div>
        </div>

        {/* Add Template dropdown buttons */}
        <div className="p-3 border-b border-slate-800 space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-400 block mb-1">
            Generate From Template:
          </span>
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(OPENSCAD_PARAMETRIC_TEMPLATES).map(([key, tpl]) => (
              <button
                key={key}
                onClick={() => handleCreateNewObject(key)}
                disabled={!canEdit}
                className="flex items-center justify-between px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 hover:text-white rounded text-xs transition border border-slate-700/50 disabled:opacity-50"
              >
                <div className="flex items-center space-x-2 truncate">
                  <Plus className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="truncate">{tpl.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Objects list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {parametricObjects.length === 0 ? (
            <div className="text-center p-6 text-slate-500 text-xs">
              No parametric objects created yet. Click a template above to generate one.
            </div>
          ) : (
            parametricObjects.map((obj) => (
              <div
                key={obj.id}
                onClick={() => setSelectedObjId(obj.id)}
                className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                  selectedObj?.id === obj.id
                    ? 'bg-purple-950/40 border-purple-500/50 text-white'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <div className="truncate pr-2">
                  <p className="font-semibold truncate">{obj.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    X: {Math.round(obj.transform.x)}" | Y: {Math.round(obj.transform.y)}"
                  </p>
                </div>
                <Box className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Center Area: Controls / Code Editor */}
      <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
        {/* Sub-tabs header */}
        <div className="h-11 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveSubTab('params')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                activeSubTab === 'params'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Parameters Form</span>
            </button>

            <button
              onClick={() => setActiveSubTab('code')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                activeSubTab === 'code'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>OpenSCAD Script</span>
            </button>

            <button
              onClick={() => setActiveSubTab('fullbim')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                activeSubTab === 'fullbim'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Full BIM Assembly SCAD</span>
            </button>

            <button
              onClick={() => setActiveSubTab('logs')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                activeSubTab === 'logs'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Execution Logs ({executionLogs.length})</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {selectedObj && (
              <button
                onClick={handleDeleteSelected}
                disabled={!canEdit}
                className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition"
                title="Delete object"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={handleCompileStl}
              disabled={isCompiling}
              className="flex items-center space-x-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold shadow transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isCompiling ? 'Compiling...' : 'Export STL'}</span>
            </button>
          </div>
        </div>

        {/* Validation Status Indicator */}
        <div className="px-4 py-1.5 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between text-[11px]">
          <div className="flex items-center space-x-2">
            {validationResult.valid ? (
              <div className="flex items-center space-x-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>OpenSCAD AST & Sandbox Verified</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-rose-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Security/Syntax issue: {validationResult.errors[0]}</span>
              </div>
            )}
          </div>
          <span className="text-slate-500 font-mono text-[10px]">
            Engine: Safe Client/Server CSG Kernel
          </span>
        </div>

        {/* Sub-tab views */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeSubTab === 'params' && (
            selectedObj ? (
              <div className="max-w-2xl space-y-4">
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">{selectedObj.name}</h3>
                      <p className="text-xs text-slate-400">
                        {OPENSCAD_PARAMETRIC_TEMPLATES[selectedObj.generatorTemplate || '']?.description || 'Custom Parametric Generator'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    {(selectedObj.parameterDefs || []).map((def) => {
                      const currentVal = selectedObj.parameters[def.name] ?? def.value;

                      if (def.type === 'boolean') {
                        return (
                          <div key={def.name} className="flex items-center justify-between py-1">
                            <span className="text-xs text-slate-300 font-medium">{def.label}</span>
                            <input
                              type="checkbox"
                              checked={Boolean(currentVal)}
                              onChange={(e) => handleParameterChange(def.name, e.target.checked)}
                              disabled={!canEdit}
                              className="rounded bg-slate-800 border-slate-700 text-purple-600 focus:ring-purple-500 h-4 w-4"
                            />
                          </div>
                        );
                      }

                      return (
                        <div key={def.name} className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-300">
                            <span>{def.label}</span>
                            <span className="font-mono text-purple-400">
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
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Spatial positioning */}
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Spatial Floor Transform (Inches)
                  </h4>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-slate-400 text-[10px] block">Position X</label>
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
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 text-[10px] block">Position Y</label>
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
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 text-[10px] block">Elevation Z</label>
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
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs mt-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 text-xs p-6 text-center">
                Select or create a parametric object on the left.
              </div>
            )
          )}

          {activeSubTab === 'code' && (
            <div className="h-full flex flex-col space-y-2">
              <textarea
                value={sourceCodeOverride}
                onChange={(e) => {
                  setSourceCodeOverride(e.target.value);
                  if (selectedObj && canEdit) {
                    const res = applyDesignOperation(project, {
                      id: `op_src_${selectedObj.id}`,
                      type: 'update_parametric_source',
                      parametricObjectId: selectedObj.id,
                      source: e.target.value,
                      timestamp: Date.now(),
                    });
                    if (res.success) onUpdateProject(res.project);
                  }
                }}
                disabled={!canEdit}
                spellCheck={false}
                className="w-full flex-1 bg-slate-900 font-mono text-xs text-purple-300 p-4 rounded-xl border border-slate-800 focus:outline-none focus:border-purple-500/50 resize-none min-h-[400px]"
              />
            </div>
          )}

          {activeSubTab === 'fullbim' && (
            <div className="h-full flex flex-col space-y-2">
              <div className="text-xs text-slate-400 mb-1">
                Generated complete OpenSCAD script for all walls, cutouts, rooms, and embedded parametric objects:
              </div>
              <textarea
                readOnly
                value={generateFullBimOpenScad(project)}
                spellCheck={false}
                className="w-full flex-1 bg-slate-900 font-mono text-xs text-sky-300 p-4 rounded-xl border border-slate-800 resize-none min-h-[400px]"
              />
            </div>
          )}

          {activeSubTab === 'logs' && (
            <div className="bg-slate-950 font-mono text-xs text-slate-300 p-4 rounded-xl border border-slate-800 space-y-1.5 h-full overflow-y-auto">
              {executionLogs.map((log, i) => (
                <div key={i} className="text-slate-400">
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
