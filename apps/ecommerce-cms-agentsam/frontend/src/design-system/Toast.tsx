/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Design System: Toast System
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  durationMs?: number;
}

interface ToastContextType {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const newToast: ToastMessage = { ...toast, id };
      setToasts((prev) => [...prev, newToast]);

      const duration = toast.durationMs || 4000;
      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((toast) => {
          const typeIcons = {
            success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
            warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
            error: <AlertCircle className="w-4 h-4 text-red-400" />,
            info: <Info className="w-4 h-4 text-sky-400" />
          };

          const borderColors = {
            success: 'border-emerald-500/30',
            warning: 'border-amber-500/30',
            error: 'border-red-500/30',
            info: 'border-sky-500/30'
          };

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 bg-zinc-950/95 border ${borderColors[toast.type]} rounded-2xl shadow-xl backdrop-blur-md animate-slide-up`}
            >
              <div className="mt-0.5 flex-shrink-0">{typeIcons[toast.type]}</div>
              <div className="flex-1 min-w-0">
                <h5 className="text-xs font-semibold text-zinc-100">{toast.title}</h5>
                {toast.description && (
                  <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded-lg"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toasts: [],
      addToast: (toast: Omit<ToastMessage, 'id'>) => console.log('Toast:', toast),
      removeToast: () => {}
    };
  }
  return context;
}
