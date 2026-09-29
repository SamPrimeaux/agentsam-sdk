import { createContext, useContext, type ReactNode } from 'react';
import type { CmsEditorController } from './useCmsEditorController';

const CmsEditorContext = createContext<CmsEditorController | null>(null);

export function CmsEditorProvider({
  value,
  children,
}: {
  value: CmsEditorController;
  children: ReactNode;
}) {
  return <CmsEditorContext.Provider value={value}>{children}</CmsEditorContext.Provider>;
}

export function useCmsEditor() {
  const ctx = useContext(CmsEditorContext);
  if (!ctx) throw new Error('useCmsEditor requires CmsEditorProvider');
  return ctx;
}
