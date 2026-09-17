/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { AgentSamDrawer } from '../components/AgentSamDrawer';
import { MujocoSimulationProvider } from '../lib/robotics/simulation/mujoco-provider';
import { SimulationProvider } from '../lib/robotics/simulation/provider';
import { GenerativeAssetWorkspace } from '../workspaces/generative/GenerativeAssetWorkspace';
import { ModelWorkspace } from '../workspaces/model/ModelWorkspace';
import { ParametricWorkspace } from '../workspaces/parametric/ParametricWorkspace';
import { PlanWorkspace } from '../workspaces/plan/PlanWorkspace';
import { RenderWorkspace } from '../workspaces/render/RenderWorkspace';
import { RoboticsWorkspace } from '../workspaces/robotics/RoboticsWorkspace';
import { CadCreatorShell } from './CadCreatorShell';
import { WorkspaceId } from './workspaceRegistry';

export function CadCreatorApp() {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('robotics');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const simProviderRef = useRef<SimulationProvider>(new MujocoSimulationProvider());

  const toggleDarkMode = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    simProviderRef.current.setDarkMode(nextDark);
  };

  const handleToolIntegration = (toolId: 'blender' | 'openscad' | 'freecad' | 'meshy') => {
    if (toolId === 'openscad') setActiveWorkspace('parametric');
    else if (toolId === 'blender') setActiveWorkspace('render');
    else if (toolId === 'freecad') setActiveWorkspace('model');
    else if (toolId === 'meshy') setActiveWorkspace('generative');
  };

  return (
    <div className={`w-full h-full flex flex-col overflow-hidden ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Top Application Shell Header */}
      <CadCreatorShell
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={setActiveWorkspace}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        showDiagnostics={showDiagnostics}
        onToggleDiagnostics={() => setShowDiagnostics(!showDiagnostics)}
        onOpenCopilot={() => setShowCopilot(true)}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 relative w-full h-[calc(100%-3.5rem)] overflow-hidden">
        {/* Persistent MuJoCo 3D Viewport Layer (kept in DOM for continuous simulation loop) */}
        <div
          ref={containerRef}
          className={`absolute inset-0 transition-opacity duration-200 ${
            activeWorkspace === 'robotics' ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'
          }`}
        />

        {/* Robotics Overlay & Controls */}
        <div className={`absolute inset-0 z-20 pointer-events-none ${activeWorkspace === 'robotics' ? 'block' : 'hidden'}`}>
          <div className="w-full h-full pointer-events-auto">
            <RoboticsWorkspace
              containerRef={containerRef}
              simProviderRef={simProviderRef}
              isDarkMode={isDarkMode}
              toggleDarkMode={toggleDarkMode}
              showDiagnostics={showDiagnostics}
              setShowDiagnostics={setShowDiagnostics}
              onOpenToolIntegration={handleToolIntegration}
            />
          </div>
        </div>

        {/* OpenSCAD Parametric CAD Workspace */}
        {activeWorkspace === 'parametric' && (
          <div className="absolute inset-0 z-20 bg-inherit">
            <ParametricWorkspace
              isDarkMode={isDarkMode}
              onSendToRobotics={partName => {
                setActiveWorkspace('robotics');
              }}
            />
          </div>
        )}

        {/* Blender PBR Studio Render Workspace */}
        {activeWorkspace === 'render' && (
          <div className="absolute inset-0 z-20 bg-inherit">
            <RenderWorkspace
              isDarkMode={isDarkMode}
              onSendToRobotics={sceneName => {
                setActiveWorkspace('robotics');
              }}
            />
          </div>
        )}

        {/* 3D Spatial Assembly & BIM Workspace */}
        {activeWorkspace === 'model' && (
          <div className="absolute inset-0 z-20 bg-inherit">
            <ModelWorkspace isDarkMode={isDarkMode} />
          </div>
        )}

        {/* 2D Workcell & Floorplan CAD Workspace */}
        {activeWorkspace === 'plan' && (
          <div className="absolute inset-0 z-20 bg-inherit">
            <PlanWorkspace isDarkMode={isDarkMode} />
          </div>
        )}

        {/* Meshy Generative AI 3D Studio */}
        {activeWorkspace === 'generative' && (
          <div className="absolute inset-0 z-20 bg-inherit">
            <GenerativeAssetWorkspace
              isDarkMode={isDarkMode}
              onSendToRobotics={assetName => {
                setActiveWorkspace('robotics');
              }}
            />
          </div>
        )}
      </main>

      {/* AgentSam Copilot Drawer */}
      <AgentSamDrawer
        isOpen={showCopilot}
        onClose={() => setShowCopilot(false)}
        isDarkMode={isDarkMode}
        activeWorkspace={activeWorkspace}
        onSwitchWorkspace={setActiveWorkspace}
      />
    </div>
  );
}
