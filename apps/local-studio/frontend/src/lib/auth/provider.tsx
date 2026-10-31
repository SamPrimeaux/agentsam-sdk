import type { ReactNode } from "react";
import { browserIdentity, useCurrentUserState } from "./use-current-user";

/** Shared session recovery belongs above routes, so an outage cannot become a login redirect. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { error } = useCurrentUserState();
  return <>
    {error ? <div role="alert" className="flex items-center justify-center gap-3 border-b border-border bg-card px-4 py-2 text-sm text-foreground">
      <span>{error}</span><button type="button" className="rounded-md border border-border px-3 py-1 focus-visible:outline focus-visible:outline-2" onClick={() => { void browserIdentity.refresh(); }}>Retry account</button>
    </div> : null}
    {children}
  </>;
}
