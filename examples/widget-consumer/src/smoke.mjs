import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BUILTIN_WIDGET_DEFINITIONS,
  CalculatorWidget,
  ClockWidget,
  evaluateCalculatorExpression,
  formatClockTime,
} from '@inneranimalmedia/agentsam-workbench/widgets';

assert.equal(formatClockTime(new Date('2026-06-01T00:00:00Z'), 'UTC'), '00:00:00');
assert.equal(evaluateCalculatorExpression('24 * 18'), '432');
assert.ok(BUILTIN_WIDGET_DEFINITIONS.some(widget => widget.id === 'clock'));
assert.ok(BUILTIN_WIDGET_DEFINITIONS.some(widget => widget.id === 'calculator'));
assert.match(renderToStaticMarkup(createElement(ClockWidget)), /Clock timezone/);
assert.match(renderToStaticMarkup(createElement(CalculatorWidget)), /Calculator keypad/);
console.log('WIDGET_PACKED_CONSUMER_PASS');
