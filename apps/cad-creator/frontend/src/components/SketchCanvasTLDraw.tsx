import React, { useState, useCallback, useRef } from 'react';
import { Tldraw, Editor, getSnapshot, loadSnapshot } from 'tldraw';
import 'tldraw/tldraw.css';
import {
  Wand2,
  Check,
  X,
  Layers,
  ArrowRight,
  Eye,
  RefreshCw,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { DesignProject, DesignOperation } from '@inneranimalmedia/agentsam-cad-shared';
import { convertTldrawShapesToCadOperations, ProposedCadConversion } from '../lib/sketch-to-cad';
import { applyDesignOperation } from '@inneranimalmedia/agentsam-cad-shared';

interface SketchCanvasTLDrawProps {
  project: DesignProject;
  onUpdateProject: (newProject: DesignProject) => void;
  canEdit: boolean;
}

export const SketchCanvasTLDraw: React.FC<SketchCanvasTLDrawProps> = ({
  project,
  onUpdateProject,
  canEdit,
}) => {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [proposedConversion, setProposedConversion] = useState<ProposedCadConversion | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleMount = useCallback((appEditor: Editor) => {
    setEditor(appEditor);

    // If project has saved snapshot, restore it
    if (project.sketchDocument?.tldrawSnapshot) {
      try {
        loadSnapshot(appEditor.store, project.sketchDocument.tldrawSnapshot);
      } catch (err) {
        console.warn('Could not restore tldraw snapshot', err);
      }
    }
  }, [project.sketchDocument]);

  const handleSaveSketchState = useCallback(() => {
    if (!editor) return;
    try {
      const snapshot = getSnapshot(editor.store);
      const allShapes = editor.getCurrentPageShapes();
      const newProject: DesignProject = {
        ...project,
        sketchDocument: {
          tldrawSnapshot: snapshot,
          shapesCount: allShapes.length,
          lastEditedAt: Date.now(),
        },
      };
      onUpdateProject(newProject);
    } catch (e) {
      console.error('Error saving sketch snapshot', e);
    }
  }, [editor, project, onUpdateProject]);

  const handleConvertSketchToCad = () => {
    if (!editor) return;
    setIsProcessing(true);
    try {
      const allShapes = editor.getCurrentPageShapes();
      if (allShapes.length === 0) {
        alert('Draw some shapes (rectangles, lines, text) on the sketch canvas first!');
        setIsProcessing(false);
        return;
      }
      const conversion = convertTldrawShapesToCadOperations(allShapes, project);
      setProposedConversion(conversion);
      setShowApprovalModal(true);
    } catch (err) {
      console.error('Conversion error', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveConversion = () => {
    if (!proposedConversion) return;
    let current = { ...project };

    // Apply all proposed operations
    for (const op of proposedConversion.operations) {
      const res = applyDesignOperation(current, op);
      if (res.success) {
        current = res.project;
      }
    }

    // Save snapshot also
    if (editor) {
      current.sketchDocument = {
        tldrawSnapshot: getSnapshot(editor.store),
        shapesCount: editor.getCurrentPageShapes().length,
        lastEditedAt: Date.now(),
      };
    }

    onUpdateProject(current);
    setShowApprovalModal(false);
    setProposedConversion(null);
  };

  const handlePopulateFromCad = () => {
    if (!editor) return;
    try {
      // Clear or overlay
      const shapesToCreate: any[] = [];
      project.rooms.forEach((rm, i) => {
        if (rm.points.length >= 4) {
          const minX = Math.min(...rm.points.map((p) => p[0]));
          const minY = Math.min(...rm.points.map((p) => p[1]));
          const maxX = Math.max(...rm.points.map((p) => p[0]));
          const maxY = Math.max(...rm.points.map((p) => p[1]));
          shapesToCreate.push({
            id: `shape:room_${rm.id}` as any,
            type: 'geo',
            x: minX,
            y: minY,
            props: {
              geo: 'rectangle',
              w: Math.max(60, maxX - minX),
              h: Math.max(60, maxY - minY),
              fill: 'semi',
              color: 'blue',
              text: rm.name,
            },
          });
        }
      });

      if (shapesToCreate.length > 0) {
        editor.createShapes(shapesToCreate);
        editor.zoomToFit();
      } else {
        alert('No rooms in the current CAD plan to import into sketch canvas.');
      }
    } catch (err) {
      console.error('Error importing CAD to sketch', err);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 overflow-hidden select-none">
      {/* Top Sketch Action Bar */}
      <div className="h-12 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-pink-400">
            <Sparkles className="w-4 h-4" />
            <span>tldraw Spatial Ideation</span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-xs text-slate-400">
            Draw freehand layouts, rooms, walls & text labels, then convert to canonical CAD
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handlePopulateFromCad}
            disabled={!canEdit}
            title="Load current 2D CAD rooms into sketch canvas"
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white rounded text-xs transition border border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Import CAD to Sketch</span>
          </button>

          <button
            onClick={handleSaveSketchState}
            disabled={!canEdit}
            title="Persist sketch snapshot into project document"
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white rounded text-xs transition border border-slate-700"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Save Snapshot</span>
          </button>

          <button
            onClick={handleConvertSketchToCad}
            disabled={!canEdit || isProcessing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded font-medium text-xs shadow-lg shadow-pink-950/40 transition disabled:opacity-50"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Convert Sketch to CAD</span>
          </button>
        </div>
      </div>

      {/* tldraw Canvas Surface */}
      <div className="flex-1 relative w-full h-full tldraw-custom-wrapper">
        <Tldraw onMount={handleMount} autoFocus />
      </div>

      {/* Approval & Conversion Preview Modal */}
      {showApprovalModal && proposedConversion && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-pink-500/20 text-pink-400 rounded">
                  <Wand2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Convert Sketch to Canonical CAD</h3>
                  <p className="text-xs text-slate-400">Review synthesized architectural elements</p>
                </div>
              </div>
              <button
                onClick={() => setShowApprovalModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                  <span className="text-xl font-bold text-indigo-400">
                    {proposedConversion.summary.roomsCount}
                  </span>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-0.5">Rooms Detected</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                  <span className="text-xl font-bold text-sky-400">
                    {proposedConversion.summary.wallsCount}
                  </span>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-0.5">Walls Synthesized</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                  <span className="text-xl font-bold text-amber-400">
                    {proposedConversion.operations.length}
                  </span>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-0.5">Operations</p>
                </div>
              </div>

              <div className="bg-slate-950/80 rounded-lg p-3 border border-slate-800 text-xs space-y-2 max-h-48 overflow-y-auto">
                <span className="font-semibold text-slate-300 block">Proposed Operation Queue:</span>
                {proposedConversion.operations.map((op, idx) => (
                  <div key={idx} className="flex items-center space-x-2 text-slate-400">
                    <ArrowRight className="w-3 h-3 text-pink-400 shrink-0" />
                    <span>
                      {op.type === 'create_room' && `Create Room Zone: "${op.room.name}" (${op.room.areaSqFt} sq ft)`}
                      {op.type === 'create_wall' && `Construct Wall: [${op.wall.x1},${op.wall.y1}] → [${op.wall.x2},${op.wall.y2}]`}
                      {op.type !== 'create_room' && op.type !== 'create_wall' && op.type}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-start space-x-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Approving will commit these commands into the canonical project state, instantly updating 2D plans, 3D BIM, and parametric generation.
                </span>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end space-x-2">
              <button
                onClick={() => setShowApprovalModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveConversion}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded text-xs font-semibold shadow transition"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply to Canonical Model</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
