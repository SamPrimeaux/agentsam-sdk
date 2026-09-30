import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortLabel, type StudioInventoryModel, type StudioModelSelection } from "@/lib/work/models";
import { useWorkStore } from "@/lib/work/store";
import { cn } from "@/lib/utils";
import { invokeStudioService, isPackagedDesktop, resolveDesktopStudioAccountId } from "@/lib/desktop/tauri";

type InventoryPayload = {
  ok?: boolean;
  error?: string;
  providers?: Array<{ id: string; label: string; configured: boolean; source: string | null }>;
  availableModels?: StudioInventoryModel[];
};

function groupModels(models: StudioInventoryModel[]) {
  const groups = new Map<string, StudioInventoryModel[]>();
  for (const model of models) {
    const key = model.provider || "unknown";
    const list = groups.get(key) || [];
    list.push(model);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

export function ModelSelect({ compact = false }: { compact?: boolean }) {
  const selection = useWorkStore((s) => s.modelSelection);
  const setModelSelection = useWorkStore((s) => s.setModelSelection);
  const [inventory, setInventory] = useState<InventoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const userId =
          (typeof window !== "undefined" && window.localStorage.getItem("agentsam-user-id")) ||
          "studio-local";
        let body: InventoryPayload;
        if (isPackagedDesktop()) {
          const accountId = await resolveDesktopStudioAccountId();
          const bridged = await invokeStudioService({
            operation: "inventory",
            account_id: accountId,
          });
          try {
            body = JSON.parse(bridged.body || "{}") as InventoryPayload;
          } catch {
            throw new Error("inventory_invalid_response_" + bridged.status);
          }
          if (!bridged.ok || body.ok === false) {
            throw new Error(body.error || "inventory_http_" + bridged.status);
          }
        } else {
          const res = await fetch("/api/llm/inventory", {
            headers: { "X-User-Id": userId },
          });
          body = (await res.json()) as InventoryPayload;
          if (!res.ok || body.ok === false) {
            throw new Error(body.error || "inventory_http_" + res.status);
          }
        }
        if (cancelled) return;
        setInventory(body);
        const models = body.availableModels || [];
        if (models.length && (!selection?.provider || !selection?.model_id)) {
          const first = models[0]!;
          setModelSelection({ provider: first.provider, model_id: first.model_id });
        }
      } catch (err) {
        if (!cancelled) setError("Models are unavailable right now. Check your provider connection in Settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setModelSelection]);

  const groups = useMemo(() => groupModels(inventory?.availableModels || []), [inventory]);
  const current = (inventory?.availableModels || []).find(
    (m) => m.provider === selection?.provider && m.model_id === selection?.model_id,
  );
  const triggerLabel = current
    ? compact
      ? shortLabel(current)
      : current.label
    : loading
      ? "…"
      : "Select model";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
            compact && "px-1.5",
          )}
          aria-label="Select model"
        >
          <span className="max-w-36 truncate">{triggerLabel}</span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        {error ? (
          <div className="px-2 py-1.5 text-[11px] text-destructive">{error}</div>
        ) : null}
        {!loading && !(inventory?.availableModels || []).length ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            No model providers connected
            <div className="mt-1 text-[11px]">Connect a provider in Settings / vault</div>
          </div>
        ) : null}
        {groups.map(([provider, models]) => (
          <div key={provider}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {provider}
            </DropdownMenuLabel>
            {models.map((item) => {
              const sel: StudioModelSelection = { provider: item.provider, model_id: item.model_id };
              const active =
                selection?.provider === item.provider && selection?.model_id === item.model_id;
              return (
                <DropdownMenuItem
                  key={`${item.provider}:${item.model_id}`}
                  onSelect={() => setModelSelection(sel)}
                  className={cn(active && "bg-muted")}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{item.label}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {item.model_id}
                      {item.context_window
                        ? ` · ctx ${Math.round(Number(item.context_window) / 1000)}k`
                        : ""}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
