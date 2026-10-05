/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GestureManager: Centralized physics-based gesture engine powered by Framer Motion.
 * Coordinates:
 *  1. Press-and-hold physics detection for Edit Mode elevation with haptic pulses.
 *  2. Swipe-to-reveal contextual action strips with velocity thresholds and spring snaps.
 *  3. Physics-based grid snapping calculations with boundary collision & threshold feedback.
 *  4. Deep integration with the universal Haptics Adapter.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  MotionValue,
  PanInfo
} from 'motion/react';
import { haptics } from '../haptics';

// ============================================================================
// CONFIGURATION & CONTRACT TYPES
// ============================================================================

export interface GridSnapConfig {
  colWidth: number;
  rowHeight: number;
  colGap: number;
  rowGap: number;
  cols: number;
  thresholdRatio?: number; // 0.25 to 0.5 of cell width before snapping occurs
  bounds?: {
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
  };
}

export interface GridSnapResult {
  snappedX: number;
  snappedY: number;
  colIndex: number;
  rowIndex: number;
  hasChanged: boolean;
  distance: number;
}

export interface SwipeActionConfig {
  revealWidth: number;       // Max distance to reveal action strip (default: 135)
  triggerThreshold: number;  // Distance threshold to trigger open state (default: 65)
  dismissThreshold: number;  // Distance threshold to trigger instant hide/dismiss (default: 160)
  flingVelocity: number;     // Negative velocity to trigger dismiss on fling (default: 320)
  dragElastic: number;       // Rubber-band resistance elasticity (default: 0.12)
  spring: {
    stiffness: number;
    damping: number;
    mass: number;
  };
}

export interface LongPressConfig {
  delayMs: number;           // Press duration before activating edit mode (default: 450ms)
  movementTolerance: number; // Max pixels of pointer drift before cancelling hold (default: 8px)
  hapticLevel: 'light' | 'medium' | 'heavy';
  liftScale: number;         // Scale factor when lifted in edit mode (default: 1.025)
}

export type GesturePhase = 'idle' | 'holding' | 'dragging' | 'revealing' | 'snapping';

export interface GestureSessionState {
  activeWidgetId: string | null;
  phase: GesturePhase;
  isEditMode: boolean;
  dragOrigin: { x: number; y: number };
  currentOffset: { x: number; y: number };
  lastGridSnap: { col: number; row: number } | null;
}

export type GestureEventType =
  | 'hold_start'
  | 'edit_mode_entered'
  | 'drag_start'
  | 'drag_move'
  | 'reveal_threshold_crossed'
  | 'revealed'
  | 'dismissed'
  | 'grid_snapped'
  | 'session_ended';

export type GestureEventListener = (event: GestureEventType, payload: any) => void;

// ============================================================================
// CENTRALIZED GESTURE MANAGER ORCHESTRATOR
// ============================================================================

export class GestureManagerOrchestrator {
  private static instance: GestureManagerOrchestrator;
  private listeners = new Set<GestureEventListener>();
  private session: GestureSessionState = {
    activeWidgetId: null,
    phase: 'idle',
    isEditMode: false,
    dragOrigin: { x: 0, y: 0 },
    currentOffset: { x: 0, y: 0 },
    lastGridSnap: null
  };

  public static getInstance(): GestureManagerOrchestrator {
    if (!GestureManagerOrchestrator.instance) {
      GestureManagerOrchestrator.instance = new GestureManagerOrchestrator();
    }
    return GestureManagerOrchestrator.instance;
  }

  // Preset spring tunings for fluid physics
  public static readonly SPRINGS = {
    snappy: { type: 'spring' as const, stiffness: 480, damping: 28, mass: 0.8 },
    gentle: { type: 'spring' as const, stiffness: 320, damping: 26, mass: 1 },
    bouncy: { type: 'spring' as const, stiffness: 420, damping: 18, mass: 0.9 },
    lift: { type: 'spring' as const, stiffness: 400, damping: 24, mass: 0.7 }
  };

  public static readonly DEFAULT_SWIPE_CONFIG: SwipeActionConfig = {
    revealWidth: 135,
    triggerThreshold: 65,
    dismissThreshold: 160,
    flingVelocity: 320,
    dragElastic: 0.12,
    spring: { stiffness: 420, damping: 28, mass: 0.85 }
  };

  public static readonly DEFAULT_LONG_PRESS_CONFIG: LongPressConfig = {
    delayMs: 450,
    movementTolerance: 8,
    hapticLevel: 'medium',
    liftScale: 1.025
  };

  public static readonly DEFAULT_GRID_CONFIG: GridSnapConfig = {
    colWidth: 320,
    rowHeight: 220,
    colGap: 20,
    rowGap: 20,
    cols: 3,
    thresholdRatio: 0.3
  };

  /**
   * Calculates physics grid snapping coordinates based on container geometry.
   * Compares continuous pixel offset with discreet column/row slots.
   */
  public calculateGridSnap(
    point: { x: number; y: number },
    config: GridSnapConfig = GestureManagerOrchestrator.DEFAULT_GRID_CONFIG
  ): GridSnapResult {
    const stepX = config.colWidth + config.colGap;
    const stepY = config.rowHeight + config.rowGap;

    // Calculate nearest column and row indices
    const rawCol = point.x / (stepX || 1);
    const rawRow = point.y / (stepY || 1);

    const targetCol = Math.max(0, Math.min(config.cols - 1, Math.round(rawCol)));
    const targetRow = Math.max(0, Math.round(rawRow));

    const snappedX = targetCol * stepX;
    const snappedY = targetRow * stepY;

    // Determine if crossing within snapping threshold
    const distX = Math.abs(point.x - snappedX);
    const distY = Math.abs(point.y - snappedY);
    const distance = Math.hypot(distX, distY);

    const last = this.session.lastGridSnap;
    const hasChanged = !last || last.col !== targetCol || last.row !== targetRow;

    if (hasChanged) {
      this.session.lastGridSnap = { col: targetCol, row: targetRow };
    }

    return {
      snappedX,
      snappedY,
      colIndex: targetCol,
      rowIndex: targetRow,
      hasChanged,
      distance
    };
  }

  /** Global Edit Mode Coordinator */
  public setEditMode(enabled: boolean) {
    if (this.session.isEditMode !== enabled) {
      this.session.isEditMode = enabled;
      if (enabled) {
        haptics.impact('medium');
        this.emit('edit_mode_entered', { enabled: true });
      } else {
        haptics.selection();
        this.emit('session_ended', { editMode: false });
      }
    }
  }

  public getEditMode(): boolean {
    return this.session.isEditMode;
  }

  public startSession(widgetId: string, origin: { x: number; y: number }) {
    this.session = {
      ...this.session,
      activeWidgetId: widgetId,
      phase: 'holding',
      dragOrigin: origin,
      currentOffset: { x: 0, y: 0 }
    };
    this.emit('hold_start', { widgetId, origin });
  }

  public updateSession(offset: { x: number; y: number }, phase: GesturePhase) {
    this.session.currentOffset = offset;
    this.session.phase = phase;
    this.emit('drag_move', { widgetId: this.session.activeWidgetId, offset, phase });
  }

  public endSession() {
    const prevId = this.session.activeWidgetId;
    this.session.activeWidgetId = null;
    this.session.phase = 'idle';
    this.session.lastGridSnap = null;
    this.emit('session_ended', { widgetId: prevId });
  }

  public getSession(): Readonly<GestureSessionState> {
    return this.session;
  }

  public subscribe(listener: GestureEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: GestureEventType, payload: any) {
    for (const listener of this.listeners) {
      try {
        listener(event, payload);
      } catch (err) {
        console.error('[GestureManager] Listener error:', err);
      }
    }
  }
}

export const GestureManager = GestureManagerOrchestrator.getInstance();

// ============================================================================
// REACT HOOK: useWidgetGestures
// ============================================================================

export interface UseWidgetGesturesOptions {
  id: string;
  isEditMode?: boolean;
  onLongPress?: () => void;
  onSwipeReveal?: (revealed: boolean) => void;
  onSwipeDismiss?: () => void;
  onGridSnap?: (snap: GridSnapResult) => void;
  swipeConfig?: Partial<SwipeActionConfig>;
  longPressConfig?: Partial<LongPressConfig>;
  gridConfig?: Partial<GridSnapConfig>;
  allowSwipe?: boolean;
  allowDragToReorder?: boolean;
  disabled?: boolean;
}

export interface UseWidgetGesturesReturn {
  x: MotionValue<number>;
  y: MotionValue<number>;
  isHeld: boolean;
  isRevealed: boolean;
  isDragging: boolean;
  currentGridSnap: { col: number; row: number } | null;
  revealProgress: MotionValue<number>;
  actionScale: MotionValue<number>;
  snapOpen: () => void;
  snapClose: () => void;
  dragProps: {
    drag: 'x' | 'y' | boolean;
    dragConstraints: { left: number; right: number; top?: number; bottom?: number };
    dragElastic: number;
    onDragStart: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    onDrag: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    onDragEnd: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  cardMotionProps: {
    style: {
      x: MotionValue<number>;
      y: MotionValue<number>;
      scale?: any;
    };
    animate: any;
    whileTap: any;
  };
}

export function useWidgetGestures({
  id,
  isEditMode = false,
  onLongPress,
  onSwipeReveal,
  onSwipeDismiss,
  onGridSnap,
  swipeConfig: customSwipe,
  longPressConfig: customLongPress,
  gridConfig: customGrid,
  allowSwipe = true,
  allowDragToReorder = false,
  disabled = false
}: UseWidgetGesturesOptions): UseWidgetGesturesReturn {
  const swipeConfig = { ...GestureManagerOrchestrator.DEFAULT_SWIPE_CONFIG, ...customSwipe };
  const longPressConfig = { ...GestureManagerOrchestrator.DEFAULT_LONG_PRESS_CONFIG, ...customLongPress };
  const gridConfig = { ...GestureManagerOrchestrator.DEFAULT_GRID_CONFIG, ...customGrid };

  // Motion physics drag coordinates
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Dynamic transforms for underlying action surface
  const revealProgress = useTransform(
    x,
    [-swipeConfig.revealWidth, -30, 0],
    [1, 0.4, 0]
  );
  const actionScale = useTransform(
    x,
    [-swipeConfig.revealWidth, -40],
    [1, 0.8]
  );

  const [isHeld, setIsHeld] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentGridSnap, setCurrentGridSnap] = useState<{ col: number; row: number } | null>(null);

  const holdTimerRef = useRef<number | null>(null);
  const startPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasTriggeredRevealThresholdRef = useRef(false);
  const lastSnapSlotRef = useRef<{ col: number; row: number } | null>(null);

  // Sync global edit mode
  useEffect(() => {
    if (isEditMode) {
      setIsHeld(true);
    } else if (!holdTimerRef.current) {
      setIsHeld(false);
    }
  }, [isEditMode]);

  // Snap programmatically open
  const snapOpen = useCallback(() => {
    setIsRevealed(true);
    haptics.selection();
    animate(x, -swipeConfig.revealWidth, {
      type: 'spring',
      ...swipeConfig.spring
    });
    onSwipeReveal?.(true);
  }, [x, swipeConfig, onSwipeReveal]);

  // Snap programmatically closed
  const snapClose = useCallback(() => {
    setIsRevealed(false);
    haptics.selection();
    animate(x, 0, {
      type: 'spring',
      ...swipeConfig.spring
    });
    onSwipeReveal?.(false);
  }, [x, swipeConfig, onSwipeReveal]);

  // Pointer press-and-hold detector for edit mode
  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    startPointerPosRef.current = { x: e.clientX, y: e.clientY };
    hasTriggeredRevealThresholdRef.current = false;

    GestureManager.startSession(id, { x: e.clientX, y: e.clientY });

    holdTimerRef.current = window.setTimeout(() => {
      setIsHeld(true);
      haptics.impact(longPressConfig.hapticLevel);
      GestureManager.setEditMode(true);
      onLongPress?.();
    }, longPressConfig.delayMs);
  };

  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!isEditMode) {
      setIsHeld(false);
    }
  };

  const handlePointerUpOrCancel = () => {
    cancelHold();
    startPointerPosRef.current = null;
    GestureManager.endSession();
  };

  // Continuous physics drag event handler
  const handleDragStart = () => {
    setIsDragging(true);
    cancelHold();
  };

  const handleDrag = (_: any, info: PanInfo) => {
    if (disabled) return;

    // Movement tolerance check to cancel long-press if dragging initiated
    if (startPointerPosRef.current && holdTimerRef.current) {
      const dist = Math.hypot(
        info.offset.x,
        info.offset.y
      );
      if (dist > longPressConfig.movementTolerance) {
        cancelHold();
      }
    }

    // 1. Swipe-to-Reveal Logic (Horizontal left swipe)
    if (allowSwipe && !allowDragToReorder) {
      if (info.offset.x <= -swipeConfig.triggerThreshold && !hasTriggeredRevealThresholdRef.current) {
        hasTriggeredRevealThresholdRef.current = true;
        haptics.impact('light');
        GestureManager.updateSession(info.offset, 'revealing');
      } else if (info.offset.x > -swipeConfig.triggerThreshold) {
        hasTriggeredRevealThresholdRef.current = false;
      }
    }

    // 2. Grid Snapping Logic (2D Reorder / Dragging)
    if (allowDragToReorder || isEditMode) {
      const snap = GestureManager.calculateGridSnap(info.point, gridConfig);
      if (snap.hasChanged) {
        haptics.selection();
        setCurrentGridSnap({ col: snap.colIndex, row: snap.rowIndex });
        lastSnapSlotRef.current = { col: snap.colIndex, row: snap.rowIndex };
        onGridSnap?.(snap);
      }
      GestureManager.updateSession(info.offset, 'snapping');
    }
  };

  // Drag Release & Spring Snap Dynamics
  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    handlePointerUpOrCancel();

    if (disabled) return;

    // 1. Swipe dismissal & reveal handling
    if (allowSwipe && !allowDragToReorder) {
      // High velocity fling or long swipe beyond dismiss threshold -> Trigger Dismiss / Hide
      const isFling = info.velocity.x < -swipeConfig.flingVelocity && info.offset.x < -40;
      const isOverExtended = info.offset.x <= -swipeConfig.dismissThreshold;

      if (isFling || isOverExtended) {
        haptics.success();
        onSwipeDismiss?.();
        // Return back to 0 cleanly
        animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
        setIsRevealed(false);
        return;
      }

      // Crossed trigger threshold -> Snap open action strip
      if (info.offset.x <= -swipeConfig.triggerThreshold) {
        snapOpen();
      } else {
        // Snap closed
        snapClose();
      }
    }

    // 2. Reorder / Grid snap finalize
    if (allowDragToReorder || isEditMode) {
      // Animate back to resting position or slot
      animate(x, 0, { type: 'spring', ...GestureManagerOrchestrator.SPRINGS.snappy });
      animate(y, 0, { type: 'spring', ...GestureManagerOrchestrator.SPRINGS.snappy });
    }
  };

  const dragType: 'x' | 'y' | boolean = disabled
    ? false
    : (allowDragToReorder || isEditMode)
      ? true
      : allowSwipe
        ? 'x'
        : false;

  const dragConstraints = (allowDragToReorder || isEditMode)
    ? { left: -100, right: 100, top: -80, bottom: 80 }
    : { left: -swipeConfig.revealWidth - 20, right: 0 };

  return {
    x,
    y,
    isHeld,
    isRevealed,
    isDragging,
    currentGridSnap,
    revealProgress,
    actionScale,
    snapOpen,
    snapClose,
    dragProps: {
      drag: dragType,
      dragConstraints,
      dragElastic: swipeConfig.dragElastic,
      onDragStart: handleDragStart,
      onDrag: handleDrag,
      onDragEnd: handleDragEnd,
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUpOrCancel,
      onPointerCancel: handlePointerUpOrCancel
    },
    cardMotionProps: {
      style: {
        x,
        y
      },
      animate: {
        scale: isHeld ? longPressConfig.liftScale : 1,
        transition: GestureManagerOrchestrator.SPRINGS.lift
      },
      whileTap: {
        scale: isHeld ? longPressConfig.liftScale : 0.99
      }
    }
  };
}
