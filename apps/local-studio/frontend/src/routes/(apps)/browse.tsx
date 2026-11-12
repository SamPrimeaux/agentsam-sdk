import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { openBrowserSideStage } from '@/lib/work/open-browser-side-stage';

/**
 * Historical deep links only. Browser has no standalone destination or new
 * global navigation entry: open the existing Side Stage tab in the host shell.
 */
export const Route = createFileRoute('/(apps)/browse')({ component: LegacyBrowserRedirect });

function LegacyBrowserRedirect() {
  useEffect(() => {
    openBrowserSideStage();
    // The dedicated route is retired; a full-path replacement is only for legacy links.
    window.location.replace('/admin/home');
  }, []);
  return <div role="status" className="grid h-full place-items-center text-sm text-muted-foreground">Opening Browser in Side Stage…</div>;
}
