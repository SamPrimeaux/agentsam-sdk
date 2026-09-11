import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Send, 
  Sparkles, 
  RotateCw, 
  Layers, 
  FileScan, 
  Video, 
  Image as ImageIcon, 
  Compass, 
  CheckCircle2, 
  Wand2,
  Box
} from 'lucide-react';
import { ChatMessage, ProjectState, UserRole } from '@inneranimalmedia/agentsam-cad-shared';
import { getPermissions } from '../lib/permissions';

interface Props {
  project: ProjectState;
  onApplyPlan: (plan: Partial<ProjectState>) => void;
  onOpenVeoModal: () => void;
  onOpenImageGenModal: () => void;
  onOpenSketchModal: () => void;
  userRole?: UserRole;
}

export const AgentSidebar: React.FC<Props> = ({
  project,
  onApplyPlan,
  onOpenVeoModal,
  onOpenImageGenModal,
  onOpenSketchModal,
  userRole = 'Editor',
}) => {
  const permissions = getPermissions(userRole);
  const isViewer = userRole === 'Viewer';
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_init',
      role: 'agent',
      text: "Hello, I'm AgentSam, your AI architectural design copilot. I can generate parametric 2D/3D BIM plans, parse hand sketches, synthesize photorealistic renders, and create cinematic Veo walkthrough videos. What would you like to design today?",
      timestamp: Date.now(),
      suggestedPrompts: [
        'Design a 24x30 modern villa with master bedroom & ensuite bath',
        'Build a 14x16 open living room with marble kitchen island',
        'Add 2 interior partition walls with 36" doors and 48" windows',
        'Create a Scandinavian minimalist studio with hardwood floors',
      ],
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (textToSend?: string) => {
    const prompt = textToSend || inputPrompt;
    if (!prompt.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      text: prompt,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          currentProject: project,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to generate architectural plan');
      }

      // Automatically apply new/updated elements to the canvas & 3D BIM
      if (data.walls || data.rooms || data.furniture) {
        onApplyPlan(data);
      }

      const agentMsg: ChatMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'agent',
        text: data.explanation || `I have synthesized the architectural plan with ${data.walls?.length || 0} walls, ${data.doors?.length || 0} doors, and ${data.furniture?.length || 0} fixtures according to your dimensions. Both 2D and 3D BIM views have updated.`,
        timestamp: Date.now(),
        planData: data,
        suggestedPrompts: [
          'Add large floor-to-ceiling glass windows',
          'Add a contemporary sectional sofa and coffee table',
          'Switch floor material to polished Carrara marble',
          'Animate this floor plan with Veo video generator',
        ],
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      console.error('Agent generation failed:', err);
      const errorMsg: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'agent',
        text: `Sorry, I encountered an issue: ${err.message}. Please try again or refine your architectural dimensions.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="w-72 md:w-80 h-full bg-[#252525] border-r border-[#333] flex flex-col select-none shrink-0">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-[#333] flex items-center justify-between bg-[#252525]">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white flex items-center space-x-1.5">
              <span>AgentSam Copilot</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            </h2>
            <p className="text-[10px] text-gray-400 font-mono">BIM & Multimodal Copilot</p>
          </div>
        </div>

        {/* AI Action shortcuts */}
        <div className="flex items-center space-x-1">
          <button
            onClick={onOpenSketchModal}
            title="Sketch to BIM Vision"
            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-[#333] rounded transition"
          >
            <FileScan className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpenImageGenModal}
            title="Gemini Image Studio"
            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-[#333] rounded transition"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpenVeoModal}
            title="Veo Video Animator"
            className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-[#333] rounded transition"
          >
            <Video className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Multimodal Quick Banner */}
      <div className="px-3 py-1.5 border-b border-[#333] bg-[#1E1E1E] flex items-center justify-between text-[11px] text-blue-400">
        <div className="flex items-center space-x-1.5">
          <Sparkles className="w-3 h-3 text-blue-400 shrink-0" />
          <span>Multimodal Architectural AI</span>
        </div>
        <button
          onClick={onOpenVeoModal}
          className="text-[10px] font-medium text-emerald-400 hover:underline flex items-center space-x-1"
        >
          <Video className="w-3 h-3" />
          <span>Veo</span>
        </button>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`p-2.5 rounded text-xs leading-relaxed max-w-[92%] shadow-sm ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1E1E1E] text-[#E0E0E0] border border-[#333]'
              }`}
            >
              {m.text}

              {/* Suggested prompts list */}
              {m.suggestedPrompts && (
                <div className="mt-2.5 pt-2 border-t border-[#333] space-y-1">
                  <span className="text-[10px] uppercase font-bold text-gray-500 block tracking-wider">
                    Quick Suggestions:
                  </span>
                  {m.suggestedPrompts.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(s)}
                      className="w-full text-left p-1.5 rounded bg-[#252525] hover:bg-[#333] border border-[#333] text-[11px] text-gray-300 hover:text-white transition flex items-center justify-between group"
                    >
                      <span className="line-clamp-1">{s}</span>
                      <Wand2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition shrink-0 ml-1 text-blue-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[9px] text-gray-500 mt-1 px-1 font-mono">
              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 p-2.5 rounded bg-[#1E1E1E] border border-[#333] text-gray-300 text-xs w-max animate-pulse">
            <RotateCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>AgentSam is computing parametric BIM coordinates...</span>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Chat Input Bar */}
      <div className="p-2.5 border-t border-[#333] bg-[#252525] space-y-1.5">
        {isViewer ? (
          <div className="p-2.5 rounded bg-purple-950/40 border border-purple-800/50 text-[11px] text-purple-300">
            <span className="font-semibold block mb-0.5">👁️ Viewer Mode Active</span>
            <span className="text-purple-300/80">
              Only Owners and Editors can prompt AgentSam to generate or modify floor plans. You can view chat logs and inspect 2D/3D BIM.
            </span>
          </div>
        ) : (
          <>
            <div className="relative">
              <textarea
                rows={2}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Prompt AgentSam (e.g., '16x20 living room with balcony & 6-inch walls')..."
                className="w-full bg-[#1E1E1E] border border-[#333] rounded p-2 pr-9 text-xs text-white focus:outline-none focus:border-blue-500 resize-none placeholder:text-gray-500"
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading || !inputPrompt.trim()}
                className="absolute right-2 bottom-2.5 p-1 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between text-[9px] text-gray-500 px-0.5 font-mono">
              <span>Shift + Enter for new line</span>
              <span className="text-gray-400">Enter to generate</span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
