import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_COMPANION_SETTINGS, resolveCompanion, type CompanionProfile, type CompanionSettings } from './companions';
import { broadcastCompanionSettings, loadCompanionSettings, saveCompanionSettings } from './companion-client';

type CompanionContextValue = {
  settings: CompanionSettings;
  activeCompanion: CompanionProfile;
  loading: boolean;
  saving: boolean;
  error: string;
  refresh: () => Promise<void>;
  save: (next: CompanionSettings) => Promise<void>;
};

const CompanionContext = createContext<CompanionContextValue | null>(null);

export function CompanionProvider({ children, accountKey = 'anonymous' }: { children: ReactNode; accountKey?: string }) {
  const [settings, setSettings] = useState<CompanionSettings>(DEFAULT_COMPANION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const next = await loadCompanionSettings();
      if (sequence !== requestSequence.current) return;
      setSettings(next);
      await broadcastCompanionSettings(next);
    } catch (caught) {
      if (sequence === requestSequence.current) setError(caught instanceof Error ? caught.message : 'Companion settings are unavailable.');
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSettings(DEFAULT_COMPANION_SETTINGS);
    setSaving(false);
    setError('');
    void refresh();
  }, [refresh, accountKey]);

  const save = useCallback(async (next: CompanionSettings) => {
    const sequence = requestSequence.current;
    setSaving(true);
    setError('');
    try {
      const saved = await saveCompanionSettings(next);
      if (sequence !== requestSequence.current) return;
      setSettings(saved);
      await broadcastCompanionSettings(saved);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('agentsam:companions-changed', { detail: saved }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Companion settings could not be saved.';
      if (sequence === requestSequence.current) setError(message);
      throw caught;
    } finally {
      if (sequence === requestSequence.current) setSaving(false);
    }
  }, []);

  const value = useMemo<CompanionContextValue>(() => ({
    settings,
    activeCompanion: resolveCompanion(settings.activeId, settings.customCompanions),
    loading,
    saving,
    error,
    refresh,
    save,
  }), [settings, loading, saving, error, refresh, save]);

  return <CompanionContext.Provider value={value}>{children}</CompanionContext.Provider>;
}

export function useCompanionSettings(): CompanionContextValue {
  const value = useContext(CompanionContext);
  if (!value) throw new Error('useCompanionSettings must be used inside CompanionProvider');
  return value;
}

export function useActiveCompanion(): CompanionProfile {
  const value = useContext(CompanionContext);
  return value?.activeCompanion || resolveCompanion('geaux');
}
