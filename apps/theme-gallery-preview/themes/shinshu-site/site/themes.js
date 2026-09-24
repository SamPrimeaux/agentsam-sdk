// Theme System for Shinshu Solutions
// 10 Beautiful Theme Presets

const themes = {
  default: {
    name: 'Default Orange',
    description: 'Warm, welcoming orange theme',
    colors: {
      primary: '#FF8C42',
      primaryDark: '#E67635',
      primaryLight: '#FFB67A',
      cream: '#FFF8F0',
      creamDark: '#F5E6D3',
      textDark: '#1A1A1A',
      textGray: '#4A4A4A',
      white: '#FFFFFF',
    }
  },
  ocean: {
    name: 'Ocean Blue',
    description: 'Calm, professional blue theme',
    colors: {
      primary: '#3B82F6',
      primaryDark: '#2563EB',
      primaryLight: '#60A5FA',
      cream: '#EFF6FF',
      creamDark: '#DBEAFE',
      textDark: '#1E293B',
      textGray: '#64748B',
      white: '#FFFFFF',
    }
  },
  forest: {
    name: 'Forest Green',
    description: 'Natural, earthy green theme',
    colors: {
      primary: '#10B981',
      primaryDark: '#059669',
      primaryLight: '#34D399',
      cream: '#ECFDF5',
      creamDark: '#D1FAE5',
      textDark: '#064E3B',
      textGray: '#047857',
      white: '#FFFFFF',
    }
  },
  sunset: {
    name: 'Sunset Purple',
    description: 'Vibrant, creative purple theme',
    colors: {
      primary: '#8B5CF6',
      primaryDark: '#7C3AED',
      primaryLight: '#A78BFA',
      cream: '#F5F3FF',
      creamDark: '#EDE9FE',
      textDark: '#4C1D95',
      textGray: '#6D28D9',
      white: '#FFFFFF',
    }
  },
  midnight: {
    name: 'Midnight Dark',
    description: 'Modern, sleek dark theme',
    colors: {
      primary: '#6366F1',
      primaryDark: '#4F46E5',
      primaryLight: '#818CF8',
      cream: '#1E293B',
      creamDark: '#0F172A',
      textDark: '#F1F5F9',
      textGray: '#CBD5E1',
      white: '#0F172A',
    }
  },
  cherry: {
    name: 'Cherry Blossom',
    description: 'Soft, elegant pink theme',
    colors: {
      primary: '#EC4899',
      primaryDark: '#DB2777',
      primaryLight: '#F472B6',
      cream: '#FDF2F8',
      creamDark: '#FCE7F3',
      textDark: '#831843',
      textGray: '#BE185D',
      white: '#FFFFFF',
    }
  },
  golden: {
    name: 'Golden Amber',
    description: 'Luxurious, warm gold theme',
    colors: {
      primary: '#F59E0B',
      primaryDark: '#D97706',
      primaryLight: '#FBBF24',
      cream: '#FFFBEB',
      creamDark: '#FEF3C7',
      textDark: '#78350F',
      textGray: '#92400E',
      white: '#FFFFFF',
    }
  },
  teal: {
    name: 'Teal Modern',
    description: 'Fresh, contemporary teal theme',
    colors: {
      primary: '#14B8A6',
      primaryDark: '#0D9488',
      primaryLight: '#5EEAD4',
      cream: '#F0FDFA',
      creamDark: '#CCFBF1',
      textDark: '#134E4A',
      textGray: '#0F766E',
      white: '#FFFFFF',
    }
  },
  warm: {
    name: 'Warm Brown',
    description: 'Cozy, rustic brown theme',
    colors: {
      primary: '#A16207',
      primaryDark: '#854D0E',
      primaryLight: '#CA8A04',
      cream: '#FEF9E7',
      creamDark: '#FEF3C7',
      textDark: '#451A03',
      textGray: '#78350F',
      white: '#FFFFFF',
    }
  },
  cool: {
    name: 'Cool Gray',
    description: 'Minimal, sophisticated gray theme',
    colors: {
      primary: '#6B7280',
      primaryDark: '#4B5563',
      primaryLight: '#9CA3AF',
      cream: '#F9FAFB',
      creamDark: '#F3F4F6',
      textDark: '#111827',
      textGray: '#374151',
      white: '#FFFFFF',
    }
  },
  dark: {
    name: 'Dark Mode',
    description: 'Pure dark theme for night work',
    colors: {
      primary: '#8B5CF6',
      primaryDark: '#7C3AED',
      primaryLight: '#A78BFA',
      cream: '#0F172A',
      creamDark: '#020617',
      textDark: '#F8FAFC',
      textGray: '#CBD5E1',
      white: '#0F172A',
    }
  },
  charcoal: {
    name: 'Charcoal Dark',
    description: 'Professional dark charcoal theme',
    colors: {
      primary: '#F59E0B',
      primaryDark: '#D97706',
      primaryLight: '#FBBF24',
      cream: '#1F2937',
      creamDark: '#111827',
      textDark: '#F9FAFB',
      textGray: '#D1D5DB',
      white: '#111827',
    }
  },
  navy: {
    name: 'Navy Night',
    description: 'Deep navy dark theme',
    colors: {
      primary: '#60A5FA',
      primaryDark: '#3B82F6',
      primaryLight: '#93C5FD',
      cream: '#1E3A8A',
      creamDark: '#1E40AF',
      textDark: '#EFF6FF',
      textGray: '#BFDBFE',
      white: '#1E3A8A',
    }
  },
  emerald: {
    name: 'Emerald Dark',
    description: 'Rich emerald dark theme',
    colors: {
      primary: '#10B981',
      primaryDark: '#059669',
      primaryLight: '#34D399',
      cream: '#064E3B',
      creamDark: '#022C22',
      textDark: '#D1FAE5',
      textGray: '#6EE7B7',
      white: '#022C22',
    }
  },
  crimson: {
    name: 'Crimson Red',
    description: 'Bold, energetic red theme',
    colors: {
      primary: '#EF4444',
      primaryDark: '#DC2626',
      primaryLight: '#F87171',
      cream: '#FEE2E2',
      creamDark: '#FECACA',
      textDark: '#7F1D1D',
      textGray: '#991B1B',
      white: '#FFFFFF',
    }
  },
  sapphire: {
    name: 'Sapphire Blue',
    description: 'Deep, trustworthy blue theme',
    colors: {
      primary: '#1E40AF',
      primaryDark: '#1E3A8A',
      primaryLight: '#3B82F6',
      cream: '#DBEAFE',
      creamDark: '#BFDBFE',
      textDark: '#1E3A8A',
      textGray: '#1E40AF',
      white: '#FFFFFF',
    }
  },
  jade: {
    name: 'Jade Green',
    description: 'Fresh, natural jade theme',
    colors: {
      primary: '#059669',
      primaryDark: '#047857',
      primaryLight: '#10B981',
      cream: '#D1FAE5',
      creamDark: '#A7F3D0',
      textDark: '#064E3B',
      textGray: '#047857',
      white: '#FFFFFF',
    }
  },
  amethyst: {
    name: 'Amethyst Purple',
    description: 'Royal, elegant purple theme',
    colors: {
      primary: '#7C3AED',
      primaryDark: '#6D28D9',
      primaryLight: '#8B5CF6',
      cream: '#EDE9FE',
      creamDark: '#DDD6FE',
      textDark: '#4C1D95',
      textGray: '#5B21B6',
      white: '#FFFFFF',
    }
  },
  slate: {
    name: 'Slate Dark',
    description: 'Modern slate dark theme',
    colors: {
      primary: '#64748B',
      primaryDark: '#475569',
      primaryLight: '#94A3B8',
      cream: '#0F172A',
      creamDark: '#020617',
      textDark: '#F1F5F9',
      textGray: '#CBD5E1',
      white: '#0F172A',
    }
  },
  rose: {
    name: 'Rose Gold',
    description: 'Elegant rose gold theme',
    colors: {
      primary: '#F43F5E',
      primaryDark: '#E11D48',
      primaryLight: '#FB7185',
      cream: '#FFF1F2',
      creamDark: '#FFE4E6',
      textDark: '#881337',
      textGray: '#9F1239',
      white: '#FFFFFF',
    }
  },
  cyan: {
    name: 'Cyan Bright',
    description: 'Vibrant, energetic cyan theme',
    colors: {
      primary: '#06B6D4',
      primaryDark: '#0891B2',
      primaryLight: '#22D3EE',
      cream: '#CFFAFE',
      creamDark: '#A5F3FC',
      textDark: '#164E63',
      textGray: '#155E75',
      white: '#FFFFFF',
    }
  },
  indigo: {
    name: 'Indigo Deep',
    description: 'Deep, calming indigo theme',
    colors: {
      primary: '#4F46E5',
      primaryDark: '#4338CA',
      primaryLight: '#6366F1',
      cream: '#EEF2FF',
      creamDark: '#E0E7FF',
      textDark: '#312E81',
      textGray: '#3730A3',
      white: '#FFFFFF',
    }
  },
  amber: {
    name: 'Amber Dark',
    description: 'Warm amber dark theme',
    colors: {
      primary: '#F59E0B',
      primaryDark: '#D97706',
      primaryLight: '#FBBF24',
      cream: '#1C1917',
      creamDark: '#0C0A09',
      textDark: '#FEF3C7',
      textGray: '#FDE68A',
      white: '#0C0A09',
    }
  }
};

// Apply theme to document
function applyTheme(themeId) {
  const theme = themes[themeId] || themes.default;
  const root = document.documentElement;
  
  // Set CSS custom properties
  root.style.setProperty('--orange-primary', theme.colors.primary);
  root.style.setProperty('--orange-dark', theme.colors.primaryDark);
  root.style.setProperty('--orange-light', theme.colors.primaryLight);
  root.style.setProperty('--cream', theme.colors.cream);
  root.style.setProperty('--cream-dark', theme.colors.creamDark);
  root.style.setProperty('--text-dark', theme.colors.textDark);
  root.style.setProperty('--text-gray', theme.colors.textGray);
  root.style.setProperty('--white', theme.colors.white);
  
  // Store preference
  localStorage.setItem('shinshu_theme', themeId);
  
  // Update theme switcher UI if it exists
  updateThemeSwitcherUI(themeId);
  
  return theme;
}

// Get current theme
function getCurrentTheme() {
  return localStorage.getItem('shinshu_theme') || 'default';
}

// Initialize theme on load
function initTheme() {
  const savedTheme = getCurrentTheme();
  applyTheme(savedTheme);
}

// Update theme switcher UI
function updateThemeSwitcherUI(activeThemeId) {
  const switcher = document.getElementById('theme-switcher');
  if (!switcher) return;
  
  const options = switcher.querySelectorAll('.theme-option');
  options.forEach(opt => {
    opt.classList.remove('active');
    if (opt.dataset.theme === activeThemeId) {
      opt.classList.add('active');
    }
  });
}

// Create theme switcher HTML
function createThemeSwitcher() {
  return `
    <div class="theme-switcher-container">
      <button class="theme-switcher-btn" onclick="toggleThemeSwitcher()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
        </svg>
        <span>Theme</span>
      </button>
      <div class="theme-switcher-dropdown" id="theme-switcher">
        ${Object.keys(themes).map(themeId => {
          const theme = themes[themeId];
          return `
            <div class="theme-option ${themeId === getCurrentTheme() ? 'active' : ''}" 
                 data-theme="${themeId}" 
                 onclick="window.selectTheme('${themeId}')">
              <div class="theme-preview" style="background: ${theme.colors.primary};"></div>
              <div class="theme-info">
                <div class="theme-name">${theme.name}</div>
                <div class="theme-desc">${theme.description}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// Toggle theme switcher dropdown
function toggleThemeSwitcher() {
  const dropdown = document.getElementById('theme-switcher');
  if (dropdown) {
    dropdown.classList.toggle('open');
  }
}

// Select theme
function selectTheme(themeId) {
  applyTheme(themeId);
  const dropdown = document.getElementById('theme-switcher');
  if (dropdown) {
    dropdown.classList.remove('open');
  }
}

// Make functions globally available
if (typeof window !== 'undefined') {
  window.themes = themes;
  window.applyTheme = applyTheme;
  window.getCurrentTheme = getCurrentTheme;
  window.initTheme = initTheme;
  window.createThemeSwitcher = createThemeSwitcher;
  window.toggleThemeSwitcher = toggleThemeSwitcher;
  window.selectTheme = selectTheme;
  
  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }
}
