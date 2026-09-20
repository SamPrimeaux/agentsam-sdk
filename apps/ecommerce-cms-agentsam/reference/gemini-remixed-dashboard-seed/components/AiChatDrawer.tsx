/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  Trash2,
  Minimize2,
  Maximize2,
  Wand2,
  Layers,
  Truck,
  Cpu,
  RefreshCw,
  Copy,
  Check,
  Zap,
  ArrowRight,
  MessageSquare
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage, ChatRole } from '../types';
import { sendChatMessage } from '../services/geminiService';

interface AiChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPromptToStudio?: (prompt: string) => void;
}

export const AiChatDrawer: React.FC<AiChatDrawerProps> = ({
  isOpen,
  onClose,
  onApplyPromptToStudio
}) => {
  const [role, setRole] = useState<ChatRole>('designer');
  const [model, setModel] = useState<string>('gemini-3.5-flash');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_1',
      role: 'assistant',
      content: `### Welcome to FuelnFreeTime Apparel AI Copilot 🔥
I am your dedicated **AI Apparel Designer & Completeful Fulfillment Assistant**.

How can I help you today?
- 🎨 **Generate bold merchandise graphics** (desert rally badges, motorcycle club crests, vintage typography).
- 📦 **Analyze Completeful POD costs & retail markups** against authoritative fulfillment quotes.
- ⚡ **Diagnose Completeful webhooks & D1 link schemas** (\`completeful_order_links\`, \`completeful_variant_links\`).`,
      timestamp: Date.now(),
      modelUsed: 'gemini-3.5-flash',
      suggestedPrompts: [
        'Design a vintage off-road piston badge for heavy hoodie',
        'How does Completeful fulfillment quote pricing work vs retail total?',
        'Show completeful_variant_links table mapping'
      ]
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now()
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(newHistory, role, model);
      
      const assistantMessage: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: response.text,
        timestamp: Date.now(),
        modelUsed: model,
        suggestedPrompts: response.suggestedPrompts,
        actionPayload: response.actionPayload
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: `⚠️ **Request Error**: ${err.message || "Failed to communicate with Gemini model. Please ensure your API Key is valid."}`,
        timestamp: Date.now(),
        modelUsed: model
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearHistory = () => {
    setMessages([
      {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: `Conversation cleared. Ready for new FuelnFreeTime art direction or Completeful queries!`,
        timestamp: Date.now(),
        modelUsed: model,
        suggestedPrompts: [
          'Design an overland skull & compass patch',
          'Calculate POD profit margin for $18.50 quote',
          'Simulate order:sent-to-production webhook'
        ]
      }
    ]);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-l border-zinc-800 shadow-2xl flex flex-col transition-all duration-300 ${
        isExpanded ? 'w-full md:w-[700px]' : 'w-full md:w-[460px]'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-white">FuelnFreeTime AI Copilot</h3>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono px-1.5 py-0.5 rounded border border-amber-500/30">
                Gemini
              </span>
            </div>
            <p className="text-xs text-zinc-400">Design & Completeful POD Assistant</p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-zinc-400">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={clearHistory}
            className="p-1.5 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Clear Chat"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors ml-1 font-bold"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Role & Model Control Bar */}
      <div className="p-3 bg-zinc-900/40 border-b border-zinc-800/80 space-y-2 text-xs">
        {/* Role Selector */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-zinc-500 font-medium">Role:</span>
          <div className="flex gap-1">
            <button
              onClick={() => setRole('designer')}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                role === 'designer'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <Wand2 size={12} />
              Apparel Designer
            </button>
            <button
              onClick={() => setRole('fulfillment')}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                role === 'fulfillment'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <Truck size={12} />
              POD Specialist
            </button>
            <button
              onClick={() => setRole('architect')}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                role === 'architect'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <Cpu size={12} />
              D1 Architect
            </button>
          </div>
        </div>

        {/* Model Selector */}
        <div className="flex items-center justify-between gap-1 pt-1 border-t border-zinc-800/50">
          <span className="text-zinc-500 font-medium">Model:</span>
          <div className="flex items-center gap-1">
            {[
              { id: 'gemini-3.5-flash', label: '3.5 Flash', badge: 'General' },
              { id: 'gemini-3.1-pro-preview', label: '3.1 Pro', badge: 'Complex' },
              { id: 'gemini-3.1-flash-lite', label: '3.1 Lite', badge: 'Fast' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  model === m.id
                    ? 'bg-zinc-700 text-white font-bold border border-zinc-600'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={m.badge}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 text-amber-400">
                  <Bot size={15} />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-4 ${
                  isUser
                    ? 'bg-gradient-to-br from-amber-600 to-red-600 text-white rounded-tr-none shadow-lg'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none shadow-md'
                }`}
              >
                {!isUser ? (
                  <div className="prose prose-invert prose-sm max-w-none space-y-2 text-zinc-200">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                )}

                {/* Assistant Footer & Action Prompts */}
                {!isUser && (
                  <div className="mt-3 pt-2 border-t border-zinc-800/80 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="font-mono">{msg.modelUsed || 'gemini'}</span>
                      <button
                        onClick={() => handleCopy(msg.content, msg.id)}
                        className="hover:text-zinc-300 flex items-center gap-1 transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check size={12} className="text-emerald-400" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={12} /> Copy
                          </>
                        )}
                      </button>
                    </div>

                    {/* Suggested Prompts */}
                    {msg.suggestedPrompts && msg.suggestedPrompts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {msg.suggestedPrompts.map((s, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSend(s)}
                            className="text-left text-[11px] px-2.5 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-all flex items-center gap-1 group"
                          >
                            <span>{s}</span>
                            <ArrowRight size={10} className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-amber-600 flex items-center justify-center flex-shrink-0 text-white">
                  <User size={15} />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 justify-start items-center text-zinc-400 text-xs animate-pulse pl-2">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-amber-400">
              <RefreshCw size={14} className="animate-spin" />
            </div>
            <span>FuelnFreeTime AI is formulating response using {model}...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/60">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative flex items-center"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Ask ${role === 'designer' ? 'for graphic art direction...' : role === 'fulfillment' ? 'about Completeful orders & quotes...' : 'about D1 link tables...'}`}
            rows={2}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 pr-12 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2.5 bottom-3.5 p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 disabled:opacity-30 disabled:hover:bg-amber-500 transition-colors shadow-md"
            title="Send Message"
          >
            <Send size={15} />
          </button>
        </form>
        <p className="text-[10px] text-zinc-500 mt-2 text-center">
          Press <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400">Enter</kbd> to send, <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400">Shift+Enter</kbd> for newline
        </p>
      </div>
    </div>
  );
};
