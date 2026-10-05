# AgentSam Studio — Centralized GestureManager & Physics Interaction System

The `GestureManager` is the centralized physics interaction engine powering all widget gestures across AgentSam Studio, Local Studio, and workbench surfaces. Built with Framer Motion (`motion/react`) and integrated with the universal `haptics` adapter, it provides native iOS/iPadOS-grade fluid dynamics for long-press edit mode, swipe-to-reveal contextual action strips, rubber-band resistance, and physics-based grid snapping.

---

## 📁 File Map & Architecture

```text
src/
├── packages/
│   ├── contracts/
│   │   └── widgets/
│   │       ├── database.ts              # Canonical D1 & SQLite entity contracts
│   │       └── index.ts                 # Widget taxonomy, envelopes, registry definitions
│   │
│   ├── workbench/
│   │   ├── gestures/
│   │   │   ├── GestureManager.ts        # Central singleton orchestrator & useWidgetGestures hook
│   │   │   ├── GestureWidgetFrame.tsx   # Universal motion container consuming GestureManager
│   │   │   ├── index.ts                 # Barrel exports for gestures, hooks, and types
│   │   │   └── README.md                # Gesture system documentation & API specification
│   │   │
│   │   ├── haptics.ts                   # Universal semantic haptic feedback engine
│   │   ├── widgetStore.ts               # Local & server layout persistence, size class cycling
│   │   └── widgets/
│   │       ├── WidgetFrame.tsx          # Re-exports GestureWidgetFrame for drop-in compatibility
│   │       ├── CountdownWidget.tsx      # Absolute deadline timer (drift-free during tab sleep)
│   │       ├── ClockWidget.tsx          # World timezone & precision clock
│   │       ├── CalculatorWidget.tsx     # Memory tape calculation utility
│   │       ├── QuickControlsWidget.tsx  # Runtime toggles (turbo, telemetry, atmosphere)
│   │       ├── GlanceMetricsWidget.tsx  # Real-time operational telemetry sparklines
│   │       ├── GlanceJobsWidget.tsx     # Cron runs and background task trigger actions
│   │       ├── GlanceQueuesWidget.tsx   # Message backlog and priority lane depths
│   │       ├── RuntimeStateWidget.tsx   # Cluster health, node sandbox isolation
│   │       ├── CloudflareObservabilityWidget.tsx # Workers Observability MCP telemetry
│   │       ├── GitHubActivityWidget.tsx # PR checks, branch sync, and commit feed
│   │       ├── LauncherWidget.tsx       # Fast command palette and query launcher
│   │       ├── RecentItemsWidget.tsx    # Query history and dashboard artifacts
│   │       ├── ShortcutsWidget.tsx      # Hotkey cheatsheet
│   │       ├── ContentListWidget.tsx    # Checklist with priority tags
│   │       ├── ContentMediaWidget.tsx   # Live radar simulation & ambient Web Audio generator
│   │       ├── ArtifactPreviewWidget.tsx# Code & schema inspector
│   │       ├── ActiveRunWidget.tsx      # Step tracker, thought streaming, tool inspection
│   │       ├── TokenCostWidget.tsx      # Real-time token counter & USD compute tally
│   │       ├── QueueStatusWidget.tsx    # Pipeline concurrency & worker distribution
│   │       ├── ApprovalsWidget.tsx      # Human-in-the-loop external tool gatekeeper
│   │       ├── TaskProgressWidget.tsx   # Multi-stage workflow milestone stepper
│   │       └── WeatherAgentWidget.tsx   # Open-Meteo weather agent widget
│   │
│   ├── themes/
│   │   └── index.tsx                    # 6 packaged themes (deep slate, stone, azure, etc.)
│   └── plugins/
│       └── index.ts                     # Plugin registry & MCP connector types
│
├── server/
│   ├── db.ts                            # Authoritative SQLite database & migrations
│   ├── dataAdapters.ts                  # Projections of runtime truth into widget envelopes
│   └── routes.ts                        # Express API routes & SSE live streams
│
├── components/
│   ├── UtilitiesSurface.tsx             # /widgets Utilities surface with grid snapping
│   ├── AppDock.tsx                      # Floating physical app dock with icon launching
│   ├── AddWidgetSheet.tsx               # Widget library sheet with size previews
│   ├── SplitWorkbench.tsx               # Dual-pane Weather Agent + Workbench
│   └── Dashboard.tsx                    # Weather dashboard agent with 3D visualizations
│
└── App.tsx                              # App shell coordinating surfaces, themes, and docks
```

---

## ⚡ Core Interactions

### 1. Long-Press for Edit Mode
- **Detection**: Configurable pointer-down duration (`450ms` default) with pointer drift tolerance (`8px`). If the user moves their finger/pointer beyond 8px, hold detection cancels cleanly so normal scrolling or dragging is uninhibited.
- **Physical Feedback**: Emits a `medium` haptic impact pulse via `haptics.impact('medium')`.
- **Card Elevation**: Smoothly elevates the card along the z-axis using spring physics:
  - Scales to `1.025`
  - Increases shadow to `0 24px 48px -12px rgba(0,0,0,0.6)`
  - Illuminates the outer border highlight
  - Opens the inline widget action drawer with size class cycler, pin toggle, and reorder controls.

### 2. Swipe-to-Reveal Contextual Action Strip
- **Unidirectional Drag Constraints**: Restrains horizontal dragging to the left (`dragConstraints={{ left: -140, right: 0 }}`) with rubber-band elasticity (`dragElastic={0.12}`).
- **Reveal Layer Interpolation**: The underlying action surface scales (`actionScale`: `0.8 -> 1.0`) and fades (`revealProgress`: `0.0 -> 1.0`) dynamically in lockstep with the drag distance.
- **Haptic Threshold**: Triggers a crisp `haptics.impact('light')` when crossing the `-60px` reveal threshold.
- **Spring Snapping**: Releasing past the trigger threshold automatically snaps the action strip open at `-130px` using a damped spring (`stiffness: 420, damping: 28`). Releasing before snaps it back to `0px`.
- **Fling-to-Dismiss / Hide**: High-velocity left flings (`velocity.x < -300px/s` or swipe offset `< -160px`) dismiss the widget with a `haptics.success()` vibration and immediately trigger the floating Undo Toast.

### 3. Physics-Based Grid Snapping
- **Continuous to Discrete Projection**: `GestureManager.calculateGridSnap(point, config)` maps continuous pixel motion into discrete column and row indices based on container width, column count, and gutter dimensions.
- **Slot Boundary Haptic Feedback**: When dragging cards across grid slot boundaries, a subtle `haptics.selection()` tick is fired upon slot changes (`hasChanged: true`).
- **Spring Slot Placement**: Upon drag release, the card springs cleanly into the calculated target slot or returns to rest with zero jank (`stiffness: 480, damping: 28`).

---

## 🛠 API Reference

### `GestureManager`
The singleton orchestrator accessible via `GestureManager`:

```typescript
import { GestureManager } from '@inneranimalmedia/agentsam-workbench/gestures';

// Set global edit mode (triggers haptic pulse and updates all active widgets)
GestureManager.setEditMode(true);

// Calculate grid snap for any (x, y) point
const snap = GestureManager.calculateGridSnap(
  { x: 340, y: 230 },
  { colWidth: 320, rowHeight: 220, colGap: 20, rowGap: 20, cols: 3 }
);
// Returns: { snappedX: 340, snappedY: 240, colIndex: 1, rowIndex: 1, hasChanged: true, distance: 10 }

// Subscribe to global gesture events
const unsubscribe = GestureManager.subscribe((event, payload) => {
  console.log(`[GestureManager] Event: ${event}`, payload);
});
```

### `useWidgetGestures(options)`
Custom React hook managing full gesture lifecycle for any widget:

```typescript
import { useWidgetGestures } from '@inneranimalmedia/agentsam-workbench/gestures';

function MyWidget({ id, onHide }) {
  const {
    x,
    isHeld,
    isRevealed,
    revealProgress,
    actionScale,
    dragProps,
    cardMotionProps,
    snapOpen,
    snapClose
  } = useWidgetGestures({
    id,
    isEditMode: false,
    onLongPress: () => {
      console.log('Entered edit mode');
    },
    onSwipeDismiss: () => {
      onHide();
    },
    swipeConfig: {
      revealWidth: 130,
      triggerThreshold: 60,
      dismissThreshold: 160,
      flingVelocity: 300
    }
  });

  return (
    <div className="relative overflow-hidden rounded-[22px]">
      {/* Background action strip */}
      <motion.div style={{ opacity: revealProgress }}>
        <motion.div style={{ scale: actionScale }}>
          <button onClick={onHide}>Hide</button>
        </motion.div>
      </motion.div>

      {/* Front interactive card */}
      <motion.div
        {...dragProps}
        style={{ ...cardMotionProps.style }}
        animate={cardMotionProps.animate}
        whileTap={cardMotionProps.whileTap}
      >
        Widget Content
      </motion.div>
    </div>
  );
}
```

---

## 📳 Haptics Integration Matrix

| Gesture Event | Target Action | Haptic Level | Pattern |
| :--- | :--- | :--- | :--- |
| **Long-Press Threshold** | Card lifts into Edit Mode | `medium` impact | `26ms` pulse |
| **Swipe Reveal Threshold** | Passing -60px drag boundary | `light` impact | `14ms` tick |
| **Grid Slot Boundary** | Dragging into adjacent column/row | `selection` | `8ms` micro-tick |
| **Fling / Dismiss** | Fast left fling hiding card | `success` | `[10ms, 30ms, 15ms]` double pulse |
| **Size Class Cycle** | Toggling S / M / L / XL | `selection` | `8ms` tick |
| **Pin / Unpin** | Toggling top pin state | `selection` | `8ms` tick |
| **Undo Toast Restore** | Restoring removed widget | `success` | `[10ms, 30ms, 15ms]` pulse |
