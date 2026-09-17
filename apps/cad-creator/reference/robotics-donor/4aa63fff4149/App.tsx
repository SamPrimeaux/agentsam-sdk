/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CadCreatorApp } from './app/CadCreatorApp';
import { defaultPromptParts } from './lib/robotics/perception/provider';
import { DetectedItem, LogEntry } from './types';

// Re-export defaultPromptParts for backward compatibility
export { defaultPromptParts };

interface LogOverlayProps {
  log: LogEntry;
}

/**
 * LogOverlay
 * Draws Gemini detection results (boxes/points) over an image.
 * Uses a normalized 1000x1000 coordinate system.
 */
export function LogOverlay({ log }: LogOverlayProps) {
  if (!log.result || !Array.isArray(log.result)) return null;

  const results = log.result as DetectedItem[];
  const shapes = results.map((item, idx) => {
    if (item.box_2d) {
      const [ymin, xmin, ymax, xmax] = item.box_2d;
      return (
        <rect
          key={idx}
          x={xmin}
          y={ymin}
          width={xmax - xmin}
          height={ymax - ymin}
          fill="rgba(79, 70, 229, 0.15)"
          stroke="#4f46e5"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      );
    } else if (item.point) {
      const [y, x] = item.point;
      return (
        <circle
          key={idx}
          cx={x}
          cy={y}
          r="10"
          fill="#4f46e5"
          stroke="white"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    return null;
  });

  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="absolute inset-0 pointer-events-none w-full h-full z-10"
    >
      {shapes}
    </svg>
  );
}

/**
 * Main Application Entry Point
 * Mounts AgentSam CAD Creator Workbench
 */
export function App() {
  return <CadCreatorApp />;
}
