/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * @inneranimalmedia/agentsam-themes
 * Reusable packaged theme system for AgentSam Studio & Local Workbench.
 * 6 pristine atmospheres: Weather Auto, Azure Sky, Deep Slate, Twilight, Aurora, Emerald.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeId =
  | 'weather-auto'
  | 'azure-sky'
  | 'deep-slate'
  | 'twilight'
  | 'aurora'
  | 'emerald';

export interface ThemeTokens {
  id: ThemeId;
  name: string;
  subtitle: string;
  description: string;
  paletteType: 'adaptive' | 'light-slate' | 'graphite' | 'violet' | 'teal' | 'jade';
  preview: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    bgGradient: string;
    cardPreviewBg: string;
  };
  canvas: {
    background: string;
    overlay: string;
    ambientVignette: string;
    isDark: boolean;
  };
  glass: {
    cardFill: string;
    cardBorder: string;
    cardHighlight: string;
    cardShadow: string;
    backdropBlur: string;
    innerGlow: string;
  };
  dock: {
    background: string;
    border: string;
    tileBg: string;
    tileActive: string;
    tileHover: string;
    pillIndicator: string;
  };
  text: {
    primary: string;
    secondary: string;
    subtle: string;
    accent: string;
  };
  status: {
    success: string;
    warning: string;
    danger: string;
    info: string;
  };
  charts: {
    palette: string[];
    gridColor: string;
    tooltipBg: string;
  };
}

export const THEME_REGISTRY: Record<ThemeId, ThemeTokens> = {
  'weather-auto': {
    id: 'weather-auto',
    name: 'Weather Auto',
    subtitle: 'Adaptive Atmospheric',
    description: 'Dynamic cool cyan and soft sky accents adapting seamlessly to live forecast conditions.',
    paletteType: 'adaptive',
    preview: {
      primaryColor: '#38bdf8',
      secondaryColor: '#0ea5e9',
      accentColor: '#34d399',
      bgGradient: 'from-sky-450 via-sky-350 to-emerald-250',
      cardPreviewBg: 'rgba(15, 23, 42, 0.45)'
    },
    canvas: {
      background: 'from-sky-500 via-sky-400 to-emerald-300',
      overlay: 'rgba(0, 0, 0, 0.15)',
      ambientVignette: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.15) 0%, transparent 70%)',
      isDark: false
    },
    glass: {
      cardFill: 'rgba(15, 23, 42, 0.42)',
      cardBorder: 'rgba(255, 255, 255, 0.18)',
      cardHighlight: 'rgba(255, 255, 255, 0.25)',
      cardShadow: '0 12px 32px -4px rgba(0, 0, 0, 0.25)',
      backdropBlur: '32px',
      innerGlow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
    },
    dock: {
      background: 'rgba(15, 23, 42, 0.65)',
      border: 'rgba(255, 255, 255, 0.18)',
      tileBg: 'rgba(255, 255, 255, 0.1)',
      tileActive: 'rgba(56, 189, 248, 0.25)',
      tileHover: 'rgba(255, 255, 255, 0.2)',
      pillIndicator: '#38bdf8'
    },
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.75)',
      subtle: 'rgba(255, 255, 255, 0.45)',
      accent: '#38bdf8'
    },
    status: {
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
      info: '#38bdf8'
    },
    charts: {
      palette: ['#38bdf8', '#34d399', '#f59e0b', '#818cf8', '#ec4899'],
      gridColor: 'rgba(255, 255, 255, 0.1)',
      tooltipBg: '#0f172a'
    }
  },

  'azure-sky': {
    id: 'azure-sky',
    name: 'Azure Sky',
    subtitle: 'Clear Blue Canvas',
    description: 'Clean high-contrast cerulean and cool frost surfaces engineered for maximum daylight scannability.',
    paletteType: 'light-slate',
    preview: {
      primaryColor: '#0284c7',
      secondaryColor: '#38bdf8',
      accentColor: '#0ea5e9',
      bgGradient: 'from-sky-600 via-blue-500 to-indigo-400',
      cardPreviewBg: 'rgba(12, 28, 54, 0.55)'
    },
    canvas: {
      background: 'from-sky-700 via-blue-600 to-sky-400',
      overlay: 'rgba(0, 0, 0, 0.18)',
      ambientVignette: 'radial-gradient(circle at 50% 20%, rgba(56,189,248,0.2) 0%, transparent 60%)',
      isDark: true
    },
    glass: {
      cardFill: 'rgba(8, 24, 48, 0.48)',
      cardBorder: 'rgba(186, 230, 253, 0.22)',
      cardHighlight: 'rgba(255, 255, 255, 0.3)',
      cardShadow: '0 16px 36px -6px rgba(2, 44, 90, 0.45)',
      backdropBlur: '36px',
      innerGlow: 'inset 0 1px 0 0 rgba(224, 242, 254, 0.25)'
    },
    dock: {
      background: 'rgba(8, 24, 48, 0.75)',
      border: 'rgba(186, 230, 253, 0.25)',
      tileBg: 'rgba(255, 255, 255, 0.12)',
      tileActive: 'rgba(56, 189, 248, 0.3)',
      tileHover: 'rgba(255, 255, 255, 0.22)',
      pillIndicator: '#38bdf8'
    },
    text: {
      primary: '#ffffff',
      secondary: 'rgba(240, 249, 255, 0.8)',
      subtle: 'rgba(186, 230, 253, 0.55)',
      accent: '#7dd3fc'
    },
    status: {
      success: '#4ade80',
      warning: '#facc15',
      danger: '#f87171',
      info: '#38bdf8'
    },
    charts: {
      palette: ['#38bdf8', '#60a5fa', '#34d399', '#f472b6', '#a78bfa'],
      gridColor: 'rgba(255, 255, 255, 0.12)',
      tooltipBg: '#081830'
    }
  },

  'deep-slate': {
    id: 'deep-slate',
    name: 'Deep Slate',
    subtitle: 'Graphite & Mineral Calm',
    description: 'Hardware-grade graphite and carbon foundation. Ultra-low noise, flat mineral surface with surgical frost.',
    paletteType: 'graphite',
    preview: {
      primaryColor: '#94a3b8',
      secondaryColor: '#64748b',
      accentColor: '#38bdf8',
      bgGradient: 'from-slate-950 via-zinc-900 to-neutral-900',
      cardPreviewBg: 'rgba(24, 24, 27, 0.72)'
    },
    canvas: {
      background: 'from-slate-950 via-zinc-900 to-neutral-950',
      overlay: 'rgba(0, 0, 0, 0.45)',
      ambientVignette: 'radial-gradient(circle at 50% 0%, rgba(148,163,184,0.06) 0%, transparent 65%)',
      isDark: true
    },
    glass: {
      cardFill: 'rgba(24, 24, 27, 0.68)',
      cardBorder: 'rgba(255, 255, 255, 0.12)',
      cardHighlight: 'rgba(255, 255, 255, 0.15)',
      cardShadow: '0 20px 40px -8px rgba(0, 0, 0, 0.6)',
      backdropBlur: '40px',
      innerGlow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08)'
    },
    dock: {
      background: 'rgba(18, 18, 20, 0.85)',
      border: 'rgba(255, 255, 255, 0.14)',
      tileBg: 'rgba(255, 255, 255, 0.06)',
      tileActive: 'rgba(255, 255, 255, 0.16)',
      tileHover: 'rgba(255, 255, 255, 0.12)',
      pillIndicator: '#cbd5e1'
    },
    text: {
      primary: '#f8fafc',
      secondary: 'rgba(248, 250, 252, 0.72)',
      subtle: 'rgba(248, 250, 252, 0.42)',
      accent: '#38bdf8'
    },
    status: {
      success: '#22c55e',
      warning: '#eab308',
      danger: '#ef4444',
      info: '#0ea5e9'
    },
    charts: {
      palette: ['#38bdf8', '#94a3b8', '#34d399', '#f59e0b', '#a855f7'],
      gridColor: 'rgba(255, 255, 255, 0.07)',
      tooltipBg: '#18181b'
    }
  },

  'twilight': {
    id: 'twilight',
    name: 'Twilight',
    subtitle: 'Deep Violet & Plum Glass',
    description: 'Sophisticated nocturnal palette of deep plum and violet-black with soft lavender highlights.',
    paletteType: 'violet',
    preview: {
      primaryColor: '#c084fc',
      secondaryColor: '#a855f7',
      accentColor: '#38bdf8',
      bgGradient: 'from-indigo-950 via-purple-950 to-slate-950',
      cardPreviewBg: 'rgba(30, 16, 50, 0.62)'
    },
    canvas: {
      background: 'from-slate-950 via-purple-950 to-indigo-950',
      overlay: 'rgba(0, 0, 0, 0.35)',
      ambientVignette: 'radial-gradient(circle at 50% 10%, rgba(168,85,247,0.14) 0%, transparent 60%)',
      isDark: true
    },
    glass: {
      cardFill: 'rgba(28, 16, 44, 0.58)',
      cardBorder: 'rgba(233, 213, 255, 0.18)',
      cardHighlight: 'rgba(243, 232, 255, 0.28)',
      cardShadow: '0 20px 45px -8px rgba(15, 6, 28, 0.65)',
      backdropBlur: '36px',
      innerGlow: 'inset 0 1px 0 0 rgba(233, 213, 255, 0.16)'
    },
    dock: {
      background: 'rgba(24, 12, 38, 0.85)',
      border: 'rgba(216, 180, 254, 0.2)',
      tileBg: 'rgba(255, 255, 255, 0.08)',
      tileActive: 'rgba(192, 132, 252, 0.25)',
      tileHover: 'rgba(255, 255, 255, 0.16)',
      pillIndicator: '#c084fc'
    },
    text: {
      primary: '#faf5ff',
      secondary: 'rgba(250, 245, 255, 0.75)',
      subtle: 'rgba(233, 213, 255, 0.45)',
      accent: '#c084fc'
    },
    status: {
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
      info: '#818cf8'
    },
    charts: {
      palette: ['#c084fc', '#38bdf8', '#f472b6', '#34d399', '#fbbf24'],
      gridColor: 'rgba(255, 255, 255, 0.08)',
      tooltipBg: '#1e1032'
    }
  },

  'aurora': {
    id: 'aurora',
    name: 'Aurora',
    subtitle: 'Boreal Teal & Emerald Wave',
    description: 'Atmospheric deep marine with luminous teal and emerald northern-lights accents.',
    paletteType: 'teal',
    preview: {
      primaryColor: '#2dd4bf',
      secondaryColor: '#14b8a6',
      accentColor: '#38bdf8',
      bgGradient: 'from-teal-950 via-slate-900 to-sky-950',
      cardPreviewBg: 'rgba(10, 32, 36, 0.58)'
    },
    canvas: {
      background: 'from-teal-950 via-slate-950 to-emerald-950',
      overlay: 'rgba(0, 0, 0, 0.32)',
      ambientVignette: 'radial-gradient(circle at 60% 0%, rgba(45,212,191,0.16) 0%, transparent 60%)',
      isDark: true
    },
    glass: {
      cardFill: 'rgba(10, 30, 34, 0.56)',
      cardBorder: 'rgba(153, 246, 228, 0.18)',
      cardHighlight: 'rgba(204, 251, 241, 0.26)',
      cardShadow: '0 20px 40px -8px rgba(4, 20, 24, 0.6)',
      backdropBlur: '36px',
      innerGlow: 'inset 0 1px 0 0 rgba(153, 246, 228, 0.16)'
    },
    dock: {
      background: 'rgba(8, 24, 28, 0.85)',
      border: 'rgba(153, 246, 228, 0.22)',
      tileBg: 'rgba(255, 255, 255, 0.08)',
      tileActive: 'rgba(45, 212, 191, 0.26)',
      tileHover: 'rgba(255, 255, 255, 0.16)',
      pillIndicator: '#2dd4bf'
    },
    text: {
      primary: '#f0fdfa',
      secondary: 'rgba(240, 253, 250, 0.75)',
      subtle: 'rgba(153, 246, 228, 0.48)',
      accent: '#2dd4bf'
    },
    status: {
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
      info: '#2dd4bf'
    },
    charts: {
      palette: ['#2dd4bf', '#38bdf8', '#a7f3d0', '#f59e0b', '#818cf8'],
      gridColor: 'rgba(255, 255, 255, 0.09)',
      tooltipBg: '#0a1e22'
    }
  },

  'emerald': {
    id: 'emerald',
    name: 'Emerald',
    subtitle: 'Dark Jade & Operations Mint',
    description: 'Industrial mission-control jade and deep forest obsidian. Built for operations, monitoring, and infrastructure.',
    paletteType: 'jade',
    preview: {
      primaryColor: '#10b981',
      secondaryColor: '#059669',
      accentColor: '#34d399',
      bgGradient: 'from-emerald-950 via-zinc-900 to-teal-950',
      cardPreviewBg: 'rgba(12, 30, 22, 0.62)'
    },
    canvas: {
      background: 'from-emerald-950 via-slate-950 to-neutral-950',
      overlay: 'rgba(0, 0, 0, 0.38)',
      ambientVignette: 'radial-gradient(circle at 40% 10%, rgba(16,185,129,0.14) 0%, transparent 60%)',
      isDark: true
    },
    glass: {
      cardFill: 'rgba(12, 28, 20, 0.62)',
      cardBorder: 'rgba(167, 243, 208, 0.18)',
      cardHighlight: 'rgba(209, 250, 229, 0.25)',
      cardShadow: '0 20px 42px -8px rgba(4, 20, 12, 0.62)',
      backdropBlur: '38px',
      innerGlow: 'inset 0 1px 0 0 rgba(167, 243, 208, 0.15)'
    },
    dock: {
      background: 'rgba(10, 24, 16, 0.85)',
      border: 'rgba(167, 243, 208, 0.22)',
      tileBg: 'rgba(255, 255, 255, 0.08)',
      tileActive: 'rgba(16, 185, 129, 0.26)',
      tileHover: 'rgba(255, 255, 255, 0.16)',
      pillIndicator: '#10b981'
    },
    text: {
      primary: '#ecfdf5',
      secondary: 'rgba(236, 253, 245, 0.75)',
      subtle: 'rgba(167, 243, 208, 0.45)',
      accent: '#34d399'
    },
    status: {
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#3b82f6'
    },
    charts: {
      palette: ['#10b981', '#34d399', '#38bdf8', '#f59e0b', '#6ee7b7'],
      gridColor: 'rgba(255, 255, 255, 0.08)',
      tooltipBg: '#0c1c14'
    }
  }
};

interface ThemeContextType {
  activeThemeId: ThemeId;
  activeTheme: ThemeTokens;
  setTheme: (id: ThemeId) => void;
  availableThemes: ThemeTokens[];
}

const ThemeContext = createContext<ThemeContextType>({
  activeThemeId: 'deep-slate',
  activeTheme: THEME_REGISTRY['deep-slate'],
  setTheme: () => {},
  availableThemes: Object.values(THEME_REGISTRY)
});

export const ThemeProvider: React.FC<{
  initialTheme?: ThemeId;
  children: React.ReactNode;
}> = ({ initialTheme = 'deep-slate', children }) => {
  const [activeThemeId, setActiveThemeId] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem('agentsam_active_theme');
      if (saved && saved in THEME_REGISTRY) return saved as ThemeId;
    } catch {}
    return initialTheme;
  });

  const setTheme = (id: ThemeId) => {
    if (id in THEME_REGISTRY) {
      setActiveThemeId(id);
      try {
        localStorage.setItem('agentsam_active_theme', id);
      } catch {}
    }
  };

  const activeTheme = THEME_REGISTRY[activeThemeId] || THEME_REGISTRY['deep-slate'];

  return (
    <ThemeContext.Provider
      value={{
        activeThemeId,
        activeTheme,
        setTheme,
        availableThemes: Object.values(THEME_REGISTRY)
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export { ThemeSelector } from './ThemeSelector';
export type { ThemeSelectorProps } from './ThemeSelector';
