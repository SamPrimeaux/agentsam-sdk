import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  BUILTIN_WIDGET_DEFINITIONS, WIDGET_GALLERY_DEFINITIONS, CLOCK_TIMEZONES,
  ClockWidget, CalculatorWidget, BuiltinWidget,
  evaluateCalculatorExpression, validClockTimeZone,
  formatClockTime, formatClockDate, clockDayPeriod, clockUtcOffset,
} from '../dist/widgets/index.js';

test('clock honors explicit IANA zones and DST with the real Intl clock authority', () => {
  const winter = new Date('2026-01-15T12:34:56.000Z');
  const summer = new Date('2026-07-15T12:34:56.000Z');
  assert.equal(formatClockTime(winter, 'UTC'), '12:34:56');
  assert.equal(formatClockTime(winter, 'America/New_York'), '07:34:56');
  assert.equal(formatClockTime(summer, 'America/New_York'), '08:34:56');
  assert.equal(formatClockTime(winter, 'America/Los_Angeles', true, false), '04:34 AM');
  assert.match(formatClockDate(winter, 'UTC'), /Jan 15, 2026/);
  assert.equal(clockUtcOffset(winter, 'America/New_York'), 'UTC-05:00');
  assert.equal(clockUtcOffset(summer, 'America/New_York'), 'UTC-04:00');
  assert.equal(clockUtcOffset(winter, 'UTC'), 'UTC+00:00');
  assert.equal(clockDayPeriod(winter, 'America/New_York'), 'day');
  assert.equal(clockDayPeriod(winter, 'America/Los_Angeles'), 'night');
  assert.equal(validClockTimeZone('Invalid/Madeup'), '');
  assert.ok(CLOCK_TIMEZONES.length >= 5);
});

test('calculator supports safe arithmetic and rejects code, invalid expressions and unsafe values', () => {
  assert.equal(evaluateCalculatorExpression('24 × 18'), '432');
  assert.equal(evaluateCalculatorExpression('1024 * 768'), '786432');
  assert.equal(evaluateCalculatorExpression('-(3+5) * 2'), '-16');
  assert.equal(evaluateCalculatorExpression('20 % 3'), '2');
  assert.equal(evaluateCalculatorExpression('.5 + 1.25'), '1.75');
  assert.equal(evaluateCalculatorExpression('1/3'), '0.333333333333');
  assert.throws(() => evaluateCalculatorExpression('1 / 0'), /calculation_divide_by_zero/);
  assert.throws(() => evaluateCalculatorExpression('process.exit(1)'), /calculation_invalid/);
  assert.throws(() => evaluateCalculatorExpression('1 + 2 || true'), /calculation_invalid/);
  assert.throws(() => evaluateCalculatorExpression('('.repeat(32)+'1'+')'.repeat(32)), /calculation_too_deep/);
  assert.throws(() => evaluateCalculatorExpression('9'.repeat(130)), /calculation_invalid/);
});

test('both graduated donor utilities are built-in and package render real, safe controls', () => {
  assert.deepEqual(BUILTIN_WIDGET_DEFINITIONS.map(item=>item.id),['queues','countdown','clock','calculator']);
  assert.equal(WIDGET_GALLERY_DEFINITIONS.length,22);
  assert.deepEqual(WIDGET_GALLERY_DEFINITIONS.filter(item=>item.availability==='ready').map(item=>item.id),
    ['queues','countdown','clock','calculator']);
  const clock = renderToStaticMarkup(createElement(ClockWidget));
  assert.match(clock,/Clock timezone/);
  assert.match(clock,/Reading device clock/);
  assert.doesNotMatch(clock,/09:41|RUN-8942|Mock/);
  const calculator = renderToStaticMarkup(createElement(CalculatorWidget));
  assert.match(calculator,/Calculator keypad/);
  assert.match(calculator,/Calculation/);
  assert.doesNotMatch(calculator,/786,432|113|test history|Function\(/);
  const builtin = renderToStaticMarkup(createElement(BuiltinWidget,{widgetId:'calculator'}));
  assert.match(builtin,/Calculation/);
  assert.equal(renderToStaticMarkup(createElement(BuiltinWidget,{widgetId:'unavailable-concept'})), '');
});
