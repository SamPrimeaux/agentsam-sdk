/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HapticsAdapter: Semantic haptic feedback engine for AgentSam Workbench.
 * Triggers physical confirmations on meaningful gesture & state thresholds.
 * Web-safe capability detection with zero fake sound/shake distractions.
 */

export interface HapticsAdapter {
  selection(): void;
  impact(level: 'light' | 'medium' | 'heavy'): void;
  success(): void;
  warning(): void;
  error(): void;
}

export interface HapticsConfig {
  enabled: boolean;
  reducedMotion: boolean;
  gestureSensitivity: 'normal' | 'reduced';
}

class HapticsEngine implements HapticsAdapter {
  private config: HapticsConfig = {
    enabled: true,
    reducedMotion: false,
    gestureSensitivity: 'normal'
  };

  constructor() {
    try {
      const saved = localStorage.getItem('agentsam_haptics_config');
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch {}
  }

  public updateConfig(partial: Partial<HapticsConfig>) {
    this.config = { ...this.config, ...partial };
    try {
      localStorage.setItem('agentsam_haptics_config', JSON.stringify(this.config));
    } catch {}
  }

  public getConfig(): HapticsConfig {
    return { ...this.config };
  }

  private triggerVibrate(pattern: number | number[]) {
    if (!this.config.enabled) return;
    if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Safe no-op on non-vibrating devices
      }
    }
  }

  /** Subtle tick when selecting items, tabs, or toggling pins */
  public selection() {
    this.triggerVibrate(8);
  }

  /** Physical impact when crossing thresholds, snapping slots, or resizing */
  public impact(level: 'light' | 'medium' | 'heavy') {
    switch (level) {
      case 'light':
        this.triggerVibrate(14);
        break;
      case 'medium':
        this.triggerVibrate(26);
        break;
      case 'heavy':
        this.triggerVibrate(42);
        break;
    }
  }

  /** Soft confirmation pulse on successful add, remove, or undo */
  public success() {
    this.triggerVibrate([10, 30, 15]);
  }

  /** Restrained warning on blocked action or invalid drop */
  public warning() {
    this.triggerVibrate([20, 40, 20]);
  }

  /** Distinct alert on error or rejection */
  public error() {
    this.triggerVibrate([30, 40, 30, 40, 40]);
  }
}

export const haptics = new HapticsEngine();
