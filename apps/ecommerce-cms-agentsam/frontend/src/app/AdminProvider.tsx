/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Module: Admin React Context Provider
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AdminHostConfig } from '../platform/contracts/AdminHostConfig';
import { ProviderConnection, ProviderDefinition } from '../platform/contracts/ProviderRegistry';

interface AdminContextValue {
  host: AdminHostConfig;
  currentPath: string;
  queryParams: Record<string, string>;
  currentParams?: Record<string, string>;
  navigate: (path: string, query?: Record<string, string | undefined>) => void;
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  isMobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  isCopilotOpen: boolean;
  setCopilotOpen: (open: boolean) => void;
  connections: ProviderConnection[];
  refreshConnections: () => Promise<void>;
  providers: ProviderDefinition[];
  refreshProviders: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export interface AdminProviderProps {
  host: AdminHostConfig;
  initialPath?: string;
  children: React.ReactNode;
}

export const AdminProvider: React.FC<AdminProviderProps> = ({ host, initialPath, children }) => {
  // Parse initial location
  const parseCurrentLocation = () => {
    if (typeof window === 'undefined') return { path: initialPath || '/admin', query: {} };
    const pathname = window.location.pathname.startsWith('/admin') ? window.location.pathname : (initialPath || '/admin');
    const params = new URLSearchParams(window.location.search);
    const query: Record<string, string> = {};
    params.forEach((val, key) => {
      query[key] = val;
    });
    return { path: pathname, query };
  };

  const initialLoc = parseCurrentLocation();
  const [currentPath, setCurrentPath] = useState<string>(initialLoc.path);
  const [queryParams, setQueryParams] = useState<Record<string, string>>(initialLoc.query);

  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setMobileNavOpen] = useState(false);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isCopilotOpen, setCopilotOpen] = useState(false);

  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const providers = host.providers.listDefinitions();

  const refreshConnections = useCallback(async () => {
    try {
      const list = await host.providers.listConnections();
      setConnections(list);
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  }, [host]);

  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  // Sync with browser history and popstate
  useEffect(() => {
    const onPopState = () => {
      const loc = parseCurrentLocation();
      setCurrentPath(loc.path);
      setQueryParams(loc.query);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Global hotkeys (e.g. ⌘K for command palette)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navigate = useCallback(
    (path: string, query?: Record<string, string | undefined>) => {
      const qs = query
        ? '?' +
          Object.entries(query)
            .filter(([_, v]) => v !== undefined && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
            .join('&')
        : '';
      const target = `${path}${qs}`;
      window.history.pushState({}, '', target);
      setCurrentPath(path);
      const newQuery: Record<string, string> = {};
      if (query) {
        Object.entries(query).forEach(([k, v]) => {
          if (v !== undefined && v !== '') newQuery[k] = v;
        });
      }
      setQueryParams(newQuery);
      setMobileNavOpen(false);
    },
    []
  );

  return (
    <AdminContext.Provider
      value={{
        host,
        currentPath,
        queryParams,
        navigate,
        isSidebarCollapsed,
        setSidebarCollapsed,
        isMobileNavOpen,
        setMobileNavOpen,
        isCommandPaletteOpen,
        setCommandPaletteOpen,
        isCopilotOpen,
        setCopilotOpen,
        connections,
        refreshConnections,
        currentParams: queryParams,
        providers,
        refreshProviders: refreshConnections
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
