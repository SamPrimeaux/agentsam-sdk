import { useId, useState } from 'react';
import { evaluateCalculatorExpression } from './calculator';

export type CalculatorHistoryEntry = { expression: string; result: string };
const KEYS = ['C', 'DEL', '(', ')', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '%', '+', 'History', '='] as const;

/** Working, bounded calculator with device-local session history; no fake tape. */
export function CalculatorWidget() {
  const inputId = useId();
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CalculatorHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  function calculate() {
    try {
      const answer = evaluateCalculatorExpression(expression);
      setHistory(rows => [{ expression, result: answer }, ...rows].slice(0, 12));
      setResult(answer); setExpression(answer); setError(null);
    } catch (failure) {
      setResult(null);
      setError(failure instanceof Error && failure.message === 'calculation_divide_by_zero'
        ? 'Division by zero is undefined' : 'Invalid calculation');
    }
  }
  function press(key: string) {
    if (key === 'History') { setShowHistory(value => !value); return; }
    if (key === 'C') { setExpression(''); setResult(null); setError(null); return; }
    if (key === 'DEL') { setExpression(value => value.slice(0, -1)); setResult(null); setError(null); return; }
    if (key === '=') { calculate(); return; }
    setExpression(value => (value.length < 128 ? value + key : value));
    setResult(null); setError(null);
  }

  return <div className="agentsam-calculator">
    <div className="agentsam-calculator__display">
      <label htmlFor={inputId} className="agentsam-calculator__label">Expression</label>
      <input id={inputId} aria-label="Calculation" type="text" inputMode="decimal"
        value={expression} placeholder="0" maxLength={128}
        onChange={event => {
          if (/^[\d\s+\-*/%.()×÷]*$/.test(event.target.value)) {
            setExpression(event.target.value); setError(null); setResult(null);
          }
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); calculate(); }
          if (event.key === 'Escape') { setExpression(''); setResult(null); setError(null); }
        }}
      />
      {result !== null ? <output className="agentsam-calculator__result" aria-live="polite">= {result}</output> : null}
      {error ? <p className="agentsam-calculator__error" role="alert">{error}</p> : null}
    </div>
    {showHistory ? (
      <div className="agentsam-calculator__history">
        <div className="agentsam-calculator__history-header">
          <span>Calculation history</span>
          <button type="button" className="agentsam-widget-button" onClick={() => setHistory([])}>Clear history</button>
        </div>
        {history.length ? <ol>{history.map((entry, index) => (
          <li key={index}><button type="button" className="agentsam-widget-button"
            onClick={() => { setExpression(entry.result); setShowHistory(false); setResult(entry.result); setError(null); }}>
            {entry.expression} = <strong>{entry.result}</strong>
          </button></li>
        ))}</ol> : <p>No calculations yet</p>}
      </div>
    ) : (
      <div className="agentsam-calculator__keys" aria-label="Calculator keypad">
        {KEYS.filter(key => key !== 'History').map(key => (
          <button key={key} type="button" aria-label={key === 'DEL' ? 'Backspace' : key === 'C' ? 'Clear calculation' : key}
            className={'agentsam-widget-button' + (key === '=' ? ' agentsam-widget-button--primary' : '')}
            onClick={() => press(key)}>{key}</button>
        ))}
      </div>
    )}
    <button type="button" className="agentsam-widget-button agentsam-calculator__toggle"
      aria-expanded={showHistory} onClick={() => setShowHistory(value => !value)}>
      {showHistory ? 'Back to calculator' : 'History'}
    </button>
  </div>;
}
