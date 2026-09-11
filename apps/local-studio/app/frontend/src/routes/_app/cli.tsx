import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TerminalPane } from "@/components/workbench/terminal";
import { useActiveProject } from "@/lib/work/store";

export const Route = createFileRoute("/_app/cli")({
  component: CliPage,
});

function CliPage() {
  const project = useActiveProject();

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button asChild size="icon" variant="ghost" className="size-11 md:hidden">
          <Link to="/trails" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1 px-1">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">CLI</p>
          <p className="truncate font-mono text-xs text-clay">{project.name} · live wrangler feed</p>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <TerminalPane variant="page" />
      </div>
    </div>
  );
}
