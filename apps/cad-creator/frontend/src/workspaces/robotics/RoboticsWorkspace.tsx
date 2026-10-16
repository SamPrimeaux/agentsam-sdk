/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertCircle } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DetectionLogOverlay as LogOverlay } from './DetectionLogOverlay';
import { RobotSelector } from './components/RobotSelector';
import { Toolbar } from './components/Toolbar';
import { HttpRoboticsPerceptionProvider } from '../../lib/robotics/perception/http-provider';
import { MujocoSimulationProvider } from '../../lib/robotics/simulation/mujoco-provider';
import { SimulationProvider } from '../../lib/robotics/simulation/provider';
import { MujocoSim } from '../../lib/robotics/runtime/MujocoSim';
import {
  DetectType,
  LogEntry,
  MujocoModule
} from '../../lib/robotics/runtime/types';
import { DiagnosticOverlay } from './DiagnosticOverlay';
import { useSimulationStats } from './useSimulationStats';
import { RobotChessMatch } from './RobotChessMatch';

interface RoboticsWorkspaceProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  simProviderRef?: React.MutableRefObject<SimulationProvider | null>;
  simRef?: React.MutableRefObject<MujocoSim | null>;
  mujocoModuleRef?: React.MutableRefObject<MujocoModule | null>;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  showDiagnostics: boolean;
  setShowDiagnostics: (show: boolean) => void;
  onOpenToolIntegration?: (toolId: 'blender' | 'openscad' | 'freecad' | 'meshy') => void;
  toolCapabilities?: Array<{
    id: string;
    name: string;
    status: 'ready' | 'connected' | 'not_connected' | 'unavailable';
    version?: string;
    lane?: string;
    description: string;
    supportedFormats: string[];
  }>;
}

export function RoboticsWorkspace({
  containerRef,
  simProviderRef,
  simRef,
  mujocoModuleRef,
  isDarkMode,
  toggleDarkMode,
  showDiagnostics,
  setShowDiagnostics,
  onOpenToolIntegration,
  toolCapabilities,
}: RoboticsWorkspaceProps) {
  const isMounted = useRef(true);
  const fallbackProviderRef = useRef<SimulationProvider | null>(null);
  const activeSimProvider = simProviderRef || fallbackProviderRef;

  // Real-time physics, kinematics & telemetry subscription hook
  const simulationStats = useSimulationStats(activeSimProvider);

  const perceptionProvider = useRef(new HttpRoboticsPerceptionProvider());

  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Initializing Spatial Engine...");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [experience, setExperience] = useState<'chess' | 'sandbox'>('chess');
  const [simRevision, setSimRevision] = useState(0);
  const [showSidebar, setShowSidebar] = useState(() => window.innerWidth >= 660);

  const [erLoading, setErLoading] = useState(false);
  const [logs, setLogs] = useState<Array<LogEntry>>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const detectedTargets = useRef<Array<{ pos: THREE.Vector3; markerId: number }>>([]);
  const [detectedCount, setDetectedCount] = useState(0);

  const [isPickingUp, setIsPickingUp] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [reachRunning, setReachRunning] = useState(false);
  const [reachReceipt, setReachReceipt] = useState('Ready for a simulated reach test.');
  const reachTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (reachTimer.current) clearTimeout(reachTimer.current);
  }, []);

  const handleReachTest = () => {
    const provider = activeSimProvider.current;
    const state = provider?.getTelemetry();
    const pose = state?.endEffectorPos;
    if (!provider?.isReady || !pose || reachRunning) {
      setReachReceipt('Simulation is not ready for a verified reach test.');
      return;
    }
    const baseline = { x: pose.x, y: pose.y, z: pose.z };
    if (![baseline.x, baseline.y, baseline.z].every(Number.isFinite)) {
      setReachReceipt('End-effector telemetry is unavailable. No motion command sent.');
      return;
    }
    provider.play();
    setIsPaused(false);
    setReachRunning(true);
    setReachReceipt('Sending a bounded +8 cm X-axis reach target to MuJoCo IK…');
    // A simulation-only motion test, never a command to a real robot.
    provider.moveIkTargetTo(new THREE.Vector3(baseline.x + 0.08, baseline.y, baseline.z), 900);
    reachTimer.current = setTimeout(() => {
      const measured = provider.getTelemetry()?.endEffectorPos;
      const displacement = measured
        ? Math.hypot(measured.x - baseline.x, measured.y - baseline.y, measured.z - baseline.z)
        : NaN;
      if (!Number.isFinite(displacement)) {
        setReachReceipt('No telemetry receipt returned. Simulation motion is unverified.');
      } else if (displacement >= 0.005) {
        setReachReceipt('Simulated end effector moved ' + (displacement * 100).toFixed(1) + ' cm (measured). Grasp not verified.');
      } else {
        setReachReceipt('No measurable robot movement (' + (displacement * 100).toFixed(2) + ' cm). Check IK and physics state.');
      }
      setReachRunning(false);
      reachTimer.current = null;
    }, 2000);
  };

  const activeLog = expandedLogId ? logs.find(l => l.id === expandedLogId) : null;

  // Switches between the preserved cube sandbox and the chess scene without
  // stacking MuJoCo RAF loops, renderers, or stale runtime instances.
  useEffect(() => {
    let cancelled = false;
    isMounted.current = true;
    setIsLoading(true);
    setLoadError(null);
    setIsPaused(false);
    const previous = activeSimProvider.current;
    if (previous) previous.dispose();
    activeSimProvider.current = null;
    if (simRef) simRef.current = null;

    const initialize = async () => {
      const container = containerRef.current;
      if (!container) {
        if (!cancelled) {
          setLoadError('Robotics viewport is unavailable');
          setIsLoading(false);
        }
        return;
      }
      const provider = new MujocoSimulationProvider(mujocoModuleRef?.current || undefined);
      activeSimProvider.current = provider;
      try {
        setLoadingStatus('Starting MuJoCo robotics environment...');
        await provider.initialize(
          container,
          experience === 'chess' ? 'franka_panda_chess' : 'franka_panda_stack',
          'scene.xml',
          (message) => { if (!cancelled) setLoadingStatus(message); },
        );
        if (cancelled) {
          provider.dispose();
          return;
        }
        if (simRef) simRef.current = provider.getRawSim();
        provider.setDarkMode(isDarkMode);
        setSimRevision((v) => v + 1);
        setIsLoading(false);
      } catch (error) {
        provider.dispose();
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
          setIsLoading(false);
        }
      }
    };
    void initialize();

    return () => {
      cancelled = true;
      isMounted.current = false;
      activeSimProvider.current?.dispose();
      activeSimProvider.current = null;
      if (simRef) simRef.current = null;
    };
  }, [experience]);

  // Keyboard shortcut: 'D' for diagnostics
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          setShowDiagnostics(!showDiagnostics);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDiagnostics, setShowDiagnostics]);

  const handleReset = () => {
    const sim = activeSimProvider.current;
    if (sim) {
      sim.reset();
      detectedTargets.current = [];
      setDetectedCount(0);
      setIsPaused(false);
      setIsPickingUp(false);
      setPlaybackSpeed(1);
    }
  };

  const handleErSend = async (
    prompt: string,
    type: DetectType,
    temperature = 0.1,
    enableThinking = true,
    modelId?: string
  ) => {
    const sim = activeSimProvider.current;
    if (!sim) return;

    setFlash(true);
    setTimeout(() => setFlash(false), 300);

    const dataUrl = sim.getCanvasSnapshot(1000, 1000, 'image/png');
    sim.clearErMarkers();
    detectedTargets.current = [];
    setDetectedCount(0);

    setErLoading(true);

    try {
      const response = await perceptionProvider.current.detect({
        imageSrcBase64: dataUrl,
        prompt,
        type,
        temperature,
        enableThinking,
        modelId
      });

      setLogs(prev => [response.logEntry, ...prev]);

      const newTargets: Array<{ pos: THREE.Vector3; markerId: number }> = [];
      let markerCounter = 1;

      const cameraState = sim.getCameraState();
      const camPos = cameraState.position;
      const targetPos = cameraState.target;

      response.items.forEach(det => {
        let screenX: number | null = null;
        let screenY: number | null = null;

        if (det.box_2d) {
          const [ymin, xmin, ymax, xmax] = det.box_2d;
          screenX = (xmin + xmax) / 2 / 1000;
          screenY = (ymin + ymax) / 2 / 1000;
        } else if (det.point) {
          const [y, x] = det.point;
          screenX = x / 1000;
          screenY = y / 1000;
        }

        if (screenX !== null && screenY !== null) {
          const intersection = sim.project2DTo3D(screenX, screenY, camPos, targetPos);
          if (intersection) {
            const markerId = markerCounter++;
            sim.addErMarker(intersection.point, det.label, markerId);
            newTargets.push({ pos: intersection.point, markerId });
          }
        }
      });

      detectedTargets.current = newTargets;
      setDetectedCount(newTargets.length);
    } catch (err: unknown) {
      console.error("Perception Provider Detection Error:", err);
    } finally {
      setErLoading(false);
    }
  };

  const handlePickup = () => {
    const sim = activeSimProvider.current;
    if (!sim) return;

    if (isPickingUp) {
      const nextSpeed = playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 4 : 1;
      setPlaybackSpeed(nextSpeed);
      sim.setSpeed(nextSpeed);
      return;
    }

    if (detectedTargets.current.length === 0) return;

    setIsPickingUp(true);
    setPlaybackSpeed(1);
    sim.setSpeed(1);

    const targetPositions = detectedTargets.current.map(t => t.pos);
    const targetMarkerIds = detectedTargets.current.map(t => t.markerId);

    sim.pickupItems(targetPositions, targetMarkerIds, () => {
      setIsPickingUp(false);
      detectedTargets.current = [];
      setDetectedCount(0);
      setPlaybackSpeed(1);
      sim.setSpeed(1);
    });
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none pointer-events-none">
      {/* Visual Flash Effect on Perception snapshot */}
      <div className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-300 z-50 ${flash ? 'opacity-30' : 'opacity-0'}`} />

      {/* Loading Screen */}
      {isLoading && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md z-40 ${isDarkMode ? 'bg-slate-950/80 text-white' : 'bg-slate-50/80 text-slate-800'}`}>
          <div className="p-8 rounded-3xl flex flex-col items-center max-w-sm text-center">
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            </div>
            <h3 className="text-lg font-bold mb-2">AgentSam Physics Engine</h3>
            <p className="text-xs text-slate-400 font-mono">{loadingStatus}</p>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-xl z-50">
          <div className="p-10 rounded-[2.5rem] border border-red-100 max-w-md text-center bg-white shadow-2xl">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-2xl text-slate-800 font-bold mb-2">Simulation Halted</h3>
            <p className="text-slate-500 mb-8 leading-relaxed text-xs">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl active:scale-95 text-xs"
            >
              Restart Simulation
            </button>
          </div>
        </div>
      )}

      {!isLoading && !loadError && experience === 'chess' && activeSimProvider.current?.isReady && (
        <RobotChessMatch
          key={simRevision}
          provider={activeSimProvider.current}
          onLeave={() => setExperience('sandbox')}
        />
      )}
      {!isLoading && !loadError && experience === 'sandbox' && (
        <button type="button" onClick={() => setExperience('chess')}
          className="pointer-events-auto absolute right-3 top-3 z-30 rounded-xl border border-amber-300/30 bg-slate-950/90 px-3 py-2 text-xs font-semibold text-amber-200 shadow-lg hover:bg-slate-800 focus-visible:outline focus-visible:outline-2">
          Play chess vs Franka
        </button>
      )}

      {/* Top Left Robot Info Card */}
      {!isLoading && !loadError && experience === 'sandbox' && (
        <RobotSelector
          gizmoStats={simulationStats.gizmoStats}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Floating Bottom Toolbar */}
      {!isLoading && !loadError && experience === 'sandbox' && (
        <Toolbar
          isPaused={isPaused}
          togglePause={() => {
            const nextPaused = activeSimProvider.current?.togglePause() ?? false;
            setIsPaused(nextPaused);
          }}
          onReset={handleReset}
          onReachTest={handleReachTest}
          isReachRunning={reachRunning}
          showSidebar={showSidebar}
          toggleSidebar={() => setShowSidebar(!showSidebar)}
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
        />
      )}

      {!isLoading && !loadError && (
        <div role="status" aria-live="polite" className="absolute bottom-[98px] left-3 z-20 max-w-[min(420px,calc(100%-24px))] rounded-lg border border-white/10 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-200 shadow-lg">
          <span className="mr-2 font-semibold text-emerald-300">Reach test</span>{reachReceipt}
        </div>
      )}

      {/* Compact contextual inspector (canvas-first). No permanent AI panel:
          conversation lives in AgentSam Side Assistant; known objects resolve
          from structured MuJoCo/world state, never by default LLM vision. */}
      {!isLoading && !loadError && showSidebar && experience === 'sandbox' && (
        <aside className="absolute right-3 top-16 z-20 w-60 rounded-xl border border-white/10 bg-slate-900/90 p-3 text-[11px] text-slate-200" aria-label="Simulation inspector">
          <div className="mb-1 flex items-center justify-between"><span className="font-semibold">Inspector</span><button onClick={() => setShowSidebar(false)} aria-label="Close inspector">×</button></div>
          <div>Frame rate: {simulationStats?.fps ?? '—'} FPS</div>
          <div>Collisions: {(simulationStats as any)?.collisions ?? '—'}</div>
          <div>Physics: MuJoCo WASM (structured state)</div>
          <div className="mt-1 text-slate-400">Object locations come from simulation state. Optional AI perception requires explicit authorization in the Side Assistant.</div>
        </aside>
      )}

      {/* Real-Time Diagnostic HUD Overlay */}
      <DiagnosticOverlay
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        stats={simulationStats}
        isDarkMode={isDarkMode}
        onOpenToolIntegration={onOpenToolIntegration}
        toolCapabilities={toolCapabilities}
      />

      {/* Expanded API Log Modal */}
      {activeLog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center min-[660px]:p-10 bg-slate-950/40 backdrop-blur-xl animate-in fade-in"
          onClick={() => setExpandedLogId(null)}
        >
          <div
            className={`overflow-hidden flex flex-col shadow-2xl transition-colors fixed top-4 bottom-4 left-4 right-4 rounded-[2.5rem] min-[660px]:relative min-[660px]:inset-auto min-[660px]:w-full min-[660px]:max-w-4xl min-[660px]:max-h-[85vh] border ${
              isDarkMode ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className={`p-6 border-b flex justify-between items-center shrink-0 ${isDarkMode ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-white/40'}`}>
              <div>
                <h3 className="text-lg font-bold">Gemini Embodied Reasoning Call</h3>
                <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{activeLog.timestamp.toLocaleString()}</p>
              </div>
              <button
                onClick={() => setExpandedLogId(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200/20 text-slate-400"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 flex max-[659px]:flex-col max-[659px]:overflow-y-auto custom-scrollbar min-[660px]:flex-row min-[660px]:overflow-hidden">
              <div className={`flex items-center justify-center border-b min-[660px]:border-b-0 min-[660px]:border-r min-[660px]:flex-1 min-[660px]:p-6 min-[660px]:overflow-hidden max-[659px]:p-6 ${isDarkMode ? 'bg-slate-950/50 border-white/5' : 'bg-slate-50/30 border-slate-100'}`}>
                <div className="relative rounded-2xl overflow-hidden shadow-lg border border-white/10 flex items-center justify-center">
                  <img src={activeLog.imageSrc} className="block w-full h-auto" alt="Log" />
                  <LogOverlay log={activeLog} />
                </div>
              </div>

              <div className="min-[660px]:w-[320px] p-6 flex flex-col gap-4 overflow-y-auto custom-scrollbar text-xs">
                <div>
                  <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">User Prompt</h4>
                  <p className="font-semibold">{activeLog.prompt}</p>
                </div>
                <div>
                  <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Full System Prompt</h4>
                  <p className={`text-[10px] font-mono p-3 rounded-xl leading-relaxed border ${isDarkMode ? 'bg-slate-950 border-white/5 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>{activeLog.fullPrompt}</p>
                </div>
                <div>
                  <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Results</h4>
                  <pre className={`p-3 rounded-xl font-mono text-[10px] border overflow-y-auto max-h-48 ${isDarkMode ? 'bg-slate-950 border-white/5 text-indigo-400' : 'bg-slate-50 border-slate-200 text-indigo-600'}`}>
                    {JSON.stringify(activeLog.result, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
