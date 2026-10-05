/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized gestures package exports for AgentSam Workbench & Local Studio.
 */

export {
  GestureManager,
  GestureManagerOrchestrator,
  useWidgetGestures
} from './GestureManager';

export type {
  GridSnapConfig,
  GridSnapResult,
  SwipeActionConfig,
  LongPressConfig,
  GesturePhase,
  GestureSessionState,
  GestureEventType,
  GestureEventListener,
  UseWidgetGesturesOptions,
  UseWidgetGesturesReturn
} from './GestureManager';

export { GestureWidgetFrame } from './GestureWidgetFrame';
export type { GestureWidgetFrameProps } from './GestureWidgetFrame';
