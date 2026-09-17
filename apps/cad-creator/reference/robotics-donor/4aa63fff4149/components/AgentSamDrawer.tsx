/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Bot,
  ChevronRight,
  Code2,
  Cpu,
  Layers,
  MessageSquare,
  Send,
  Sparkles,
  Wand2,
  Wrench,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { WorkspaceId } from '../app/workspaceRegistry';

interface AgentSamDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  activeWorkspace: WorkspaceId;
  onSwitchWorkspace: (workspace: WorkspaceId) => void;
}

interface ChatMessage {
  id: string;
  sender: 'sam' | 'user';
  text: string;
  actions?: Array<{ label: string; action: () => void }>;
}

export function AgentSamDrawer({
  isOpen,
  onClose,
  isDarkMode,
  activeWorkspace,
  onSwitchWorkspace
}: AgentSamDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'sam',
      text: 'Hello! I am AgentSam, your Physical Design & Robotics Copilot. I can synthesize OpenSCAD parametric code, configure Blender PBR studio scenes, verify Franka Panda 7-DOF kinematics, and run real-time physics simulations.',
      actions: [
        {
          label: 'Design Parametric Gripper (OpenSCAD)',
          action: () => onSwitchWorkspace('parametric')
        },
        {
          label: 'Run 500Hz MuJoCo Physics',
          action: () => onSwitchWorkspace('robotics')
        },
        {
          label: 'Photoreal Render (Blender)',
          action: () => onSwitchWorkspace('render')
        }
      ]
    }
  ]);
  const [inputText, setInputText] = useState('');

  if (!isOpen) return null;

  const handleSend = () => {
    if (!inputText.trim()) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: inputText
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');

    setTimeout(() => {
      const lower = userMsg.text.toLowerCase();
      let reply = 'I have analyzed your request and prepared the design pipeline.';
      const actions: Array<{ label: string; action: () => void }> = [];

      if (lower.includes('gripper') || lower.includes('finger') || lower.includes('scad') || lower.includes('cad')) {
        reply = 'I generated a parametric OpenSCAD solid model with customizable thickness and anti-slip friction grooves. Would you like to inspect it in the Parametric Workspace?';
        actions.push({ label: 'Open OpenSCAD Workspace', action: () => onSwitchWorkspace('parametric') });
      } else if (lower.includes('render') || lower.includes('material') || lower.includes('blender')) {
        reply = 'Blender Studio is set up with Cycles Raytracing, three-point studio softbox, and Titanium PBR shader. Ready for raytrace bake.';
        actions.push({ label: 'Open Blender Workspace', action: () => onSwitchWorkspace('render') });
      } else if (lower.includes('mesh') || lower.includes('ai') || lower.includes('generate')) {
        reply = 'Meshy AI is ready to synthesize 3D geometry from natural language prompts and automatically inject collision meshes into MuJoCo.';
        actions.push({ label: 'Open Meshy AI Workspace', action: () => onSwitchWorkspace('generative') });
      } else {
        reply = `I have logged this requirement for the ${activeWorkspace} environment. The physics engine is tracking telemetry at 500 Hz with analytical inverse kinematics.`;
        actions.push({ label: 'Switch to Robotics Studio', action: () => onSwitchWorkspace('robotics') });
      }

      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: 'sam',
          text: reply,
          actions
        }
      ]);
    }, 600);
  };

  const panelBg = isDarkMode
    ? 'bg-slate-900/95 border-l border-white/10 text-slate-100 shadow-2xl backdrop-blur-2xl'
    : 'bg-white/95 border-l border-slate-200 text-slate-800 shadow-2xl backdrop-blur-2xl';
  const bubbleSam = isDarkMode ? 'bg-slate-800/80 border-white/5 text-slate-200' : 'bg-slate-100/90 border-slate-200 text-slate-800';
  const bubbleUser = 'bg-indigo-600 text-white shadow-md';
  const inputBg = isDarkMode ? 'bg-slate-950 border-white/10 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800';

  return (
    <div
      id="agent-sam-copilot-drawer"
      className={`fixed top-0 bottom-0 right-0 w-full sm:w-[420px] z-50 flex flex-col ${panelBg} animate-in slide-in-from-right duration-200`}
    >
      {/* Header */}
      <div className="p-4 border-b border-inherit flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-400 p-0.5 shadow-md flex items-center justify-center overflow-hidden">
            <img
              src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/2a047804-2626-4529-4324-f5a800f48500/avatar"
              alt="AgentSam Copilot"
              className="w-full h-full object-cover rounded-[9px]"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h3 className="text-sm font-bold leading-tight flex items-center gap-1.5">
              AgentSam Copilot
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                CAD + AI
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">Physical Design & Kinematics Assistant</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-slate-200/20 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] p-3.5 rounded-2xl text-xs leading-relaxed border ${
                msg.sender === 'user' ? bubbleUser : bubbleSam
              }`}
            >
              {msg.text}
            </div>

            {/* Quick Action Suggestion Buttons */}
            {msg.actions && msg.actions.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5 w-full max-w-[88%]">
                {msg.actions.map((act, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      act.action();
                      onClose();
                    }}
                    className="py-1.5 px-2.5 rounded-xl text-[11px] font-semibold bg-white/5 hover:bg-indigo-600 hover:text-white border border-inherit text-left flex items-center justify-between group transition-all"
                  >
                    <span>{act.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input Bar */}
      <div className="p-3.5 border-t border-inherit shrink-0">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask AgentSam to generate CAD, calculate torque..."
            className={`w-full py-2.5 pl-3.5 pr-10 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${inputBg}`}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="absolute right-2 p-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-500 transition-colors shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
