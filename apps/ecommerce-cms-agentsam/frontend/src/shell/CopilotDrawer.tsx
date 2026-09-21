/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Shell: CopilotDrawer Component
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAdmin } from '../app/AdminProvider';
import { Drawer } from '../design-system/Drawer';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { Sparkles, Send, Bot, User, CheckCircle2, RefreshCw, Cpu, Layers } from 'lucide-react';

export const CopilotDrawer: React.FC = () => {
  const { host, isCopilotOpen, setCopilotOpen } = useAdmin();
  const [messages, setMessages] = useState<
    { id: string; role: 'user' | 'assistant'; content: string; timestamp: number }[]
  >([
    {
      id: 'init_1',
      role: 'assistant',
      content:
        '👋 AgentSam Copilot online. I am connected to your Completeful POD catalog, D1 link registry, and secret store.\n\nHow can I assist your commerce operations today?',
      timestamp: Date.now()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isSending) return;
    const userText = inputValue.trim();
    setInputValue('');

    const newMsg = {
      id: `usr_${Date.now()}`,
      role: 'user' as const,
      content: userText,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, newMsg]);
    setIsSending(true);

    try {
      // Use host's agentsam adapter
      const reply = await host.agentsam.sendMessage('conv_default', userText, selectedModel);
      setMessages((prev) => [
        ...prev,
        {
          id: `asst_${Date.now()}`,
          role: 'assistant' as const,
          content: reply,
          timestamp: Date.now()
        }
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant' as const,
          content: `⚠️ Failed to process request through AgentSam host gateway: ${err.message}`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Drawer
      isOpen={isCopilotOpen}
      onClose={() => setCopilotOpen(false)}
      title="AgentSam Autonomous Copilot"
      subtitle="Model routing backed by agentsam_model_catalog & MCP tools"
      side="right"
      width="lg"
      footer={
        <div className="w-full flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>MCP Bridge Connected</span>
          </div>
          <span>Cloudflare Workers AI & Gemini</span>
        </div>
      }
    >
      <div className="flex flex-col h-[calc(100vh-14rem)]">
        {/* Model Selector Strip */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 mb-4 text-xs">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-amber-400" />
            <span className="font-medium text-zinc-300">Active Model:</span>
          </div>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-zinc-950 border border-zinc-700/80 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-amber-500"
          >
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast / Multimodal)</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro (Frontier / Reasoning)</option>
            <option value="gpt-4o">GPT-4o (OpenAI Platform)</option>
            <option value="claude-3-7-sonnet">Claude 3.7 Sonnet (Anthropic)</option>
            <option value="cf-llama-3.3-70b">Llama 3.3 70B (Cloudflare Workers AI)</option>
          </select>
        </div>

        {/* Suggested Prompts */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {[
            'Audit Completeful variant margins',
            'Draft Instagram drop caption',
            'Verify webhook signature status',
            'Check low-inventory garments'
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                setInputValue(prompt);
              }}
              className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Message Log */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll space-y-3 pr-1">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2.5 text-xs ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {m.role === 'assistant' && (
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl p-3 leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100 font-sans'
                    : 'bg-zinc-900/80 border border-zinc-800 text-zinc-300 font-sans'
                }`}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}
          {isSending && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 italic p-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>Querying model and checking MCP tool tools...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="pt-3 border-t border-zinc-800 mt-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask AgentSam anything..."
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80 font-sans"
            />
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={!inputValue.trim() || isSending}
              icon={<Send className="w-3.5 h-3.5" />}
            >
              Send
            </Button>
          </form>
        </div>
      </div>
    </Drawer>
  );
};
