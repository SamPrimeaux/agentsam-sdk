/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CalculatorWidget: Rapid utility calculator with expression memory and calculation tape.
 */

import React, { useState } from 'react';
import { Calculator as CalcIcon, History, Trash2, Delete } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const CalculatorWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [history, setHistory] = useState<Array<{ expr: string; result: string }>>([
    { expr: '1024 * 768', result: '786,432' },
    { expr: '45 * 1.8 + 32', result: '113' },
  ]);
  const [showHistory, setShowHistory] = useState(false);

  const handleDigit = (digit: string) => {
    setDisplay((prev) => (prev === '0' || prev === 'Error' ? digit : prev + digit));
  };

  const handleDecimal = () => {
    if (!display.includes('.')) {
      setDisplay((prev) => prev + '.');
    }
  };

  const handleOperator = (op: string) => {
    setEquation(`${display} ${op} `);
    setDisplay('0');
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
  };

  const handleBackspace = () => {
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  const handleEquals = () => {
    if (!equation) return;
    try {
      const fullExpr = equation + display;
      // Sanitize arithmetic expression strictly
      const sanitized = fullExpr.replace(/×/g, '*').replace(/÷/g, '/');
      if (!/^[\d\s+\-*/.()]+$/.test(sanitized)) {
        setDisplay('Error');
        return;
      }
      // eslint-disable-next-line no-eval
      const result = Function(`'use strict'; return (${sanitized})`)();
      const formattedResult = typeof result === 'number' && !isNaN(result)
        ? String(Number(result.toFixed(6)).toLocaleString('en-US'))
        : 'Error';

      setHistory((prev) => [{ expr: fullExpr, result: formattedResult }, ...prev.slice(0, 7)]);
      setDisplay(formattedResult.replace(/,/g, ''));
      setEquation('');
    } catch {
      setDisplay('Error');
    }
  };

  return (
    <WidgetFrame
      id="calculator"
      title="Utility Calculator"
      category="utility"
      subtitle="Expression Tape"
      version="1.0.0"
      icon={<CalcIcon className="w-4 h-4" />}
      actions={
        <button
          onClick={() => setShowHistory(!showHistory)}
          title="Toggle History Tape"
          className={`p-1.5 rounded-md transition-colors ${
            showHistory ? 'text-sky-300 bg-white/10' : 'text-white/40 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5" />
        </button>
      }
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {showHistory ? (
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center justify-between text-xs text-white/50 pb-2 border-b border-white/5">
              <span>History Tape</span>
              <button
                onClick={() => setHistory([])}
                className="hover:text-rose-300 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 py-2 max-h-[180px]">
              {history.length === 0 ? (
                <div className="text-white/30 text-xs text-center py-6">No calculations yet</div>
              ) : (
                history.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setDisplay(item.result.replace(/,/g, ''));
                      setShowHistory(false);
                    }}
                    className="w-full text-right p-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors block text-xs"
                  >
                    <div className="text-white/40 font-mono text-[10px]">{item.expr} =</div>
                    <div className="text-white font-mono font-medium">{item.result}</div>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="w-full py-1.5 text-xs text-center bg-white/10 hover:bg-white/15 rounded-lg text-white/80 transition-colors"
            >
              Back to Keypad
            </button>
          </div>
        ) : (
          <>
            {/* Display Header */}
            <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-right flex flex-col justify-end min-h-[56px]">
              <div className="text-[10px] font-mono text-white/40 h-3 truncate">
                {equation}
              </div>
              <div className="text-2xl font-mono tabular-nums text-white font-medium tracking-tight truncate">
                {display}
              </div>
            </div>

            {/* Keypad Grid */}
            <div className="grid grid-cols-4 gap-1.5 text-xs font-mono">
              <button
                onClick={handleClear}
                className="p-2.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-semibold transition-colors"
              >
                C
              </button>
              <button
                onClick={handleBackspace}
                className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition-colors flex items-center justify-center"
              >
                <Delete className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleOperator('%')}
                className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition-colors"
              >
                %
              </button>
              <button
                onClick={() => handleOperator('÷')}
                className="p-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 transition-colors"
              >
                ÷
              </button>

              <button onClick={() => handleDigit('7')} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">7</button>
              <button onClick={() => handleDigit('8')} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">8</button>
              <button onClick={() => handleDigit('9')} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">9</button>
              <button onClick={() => handleOperator('×')} className="p-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 transition-colors">×</button>

              <button onClick={() => handleDigit('4')} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">4</button>
              <button onClick={() => handleDigit('5')} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">5</button>
              <button onClick={() => handleDigit('6')} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">6</button>
              <button onClick={() => handleOperator('-')} className="p-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 transition-colors">-</button>

              <button onClick={() => handleDigit('1')} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">1</button>
              <button onClick={() => handleDigit('2')} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">2</button>
              <button onClick={() => handleDigit('3')} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">3</button>
              <button onClick={() => handleOperator('+')} className="p-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 transition-colors">+</button>

              <button onClick={() => handleDigit('0')} className="col-span-2 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">0</button>
              <button onClick={handleDecimal} className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">.</button>
              <button
                onClick={handleEquals}
                className="p-2.5 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 font-semibold transition-colors"
              >
                =
              </button>
            </div>
          </>
        )}
      </div>
    </WidgetFrame>
  );
};
