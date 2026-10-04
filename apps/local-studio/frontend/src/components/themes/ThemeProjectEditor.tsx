import { useEffect, useState, useMemo } from 'react';
// @ts-ignore Portable ecommerce CMS authoring module.
import { createThemeProjectAdapter } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/project';
import { themeProjectStore } from '@/lib/themes/projects';
import { ThemeEditorFrame } from './ThemeEditorFrame';

export function ThemeProjectEditor({ id, page }: { id: string; page?: string }) {
  const [project, setProject] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; void themeProjectStore.get(id).then((project) => { if (!live) return; if (!project) setError('Theme draft not found'); else setProject(project); }, (error) => { if (live) setError(error.message); }); return () => { live = false; }; }, [id]);
  const adapter = useMemo(() => project ? createThemeProjectAdapter(project, themeProjectStore) : null, [project]);
  if (error) return <p role="alert" className="p-6">{error}</p>;
  if (!adapter) return <p role="status" className="p-6 text-muted-foreground">Loading theme draft…</p>;
  return <ThemeEditorFrame adapter={adapter} page={page} />;
}
