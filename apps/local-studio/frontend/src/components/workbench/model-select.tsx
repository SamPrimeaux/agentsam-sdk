import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MODEL_INVENTORY_CHANGED_EVENT,
  loadEffectiveModelInventory,
  persistEffectiveModelSelection,
  type StudioInventoryPayload,
} from "@/lib/work/model-inventory";
import { DEFAULT_SELECTION, shortLabel, type StudioInventoryModel, type StudioModelSelection } from "@/lib/work/models";
import { useWorkStore } from "@/lib/work/store";
import { cn } from "@/lib/utils";

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

function eligibilityLabel(reason?: string | null) {
  if (reason === "provider_adapter_unavailable") return "No chat adapter yet";
  if (reason === "embedding_model") return "Embedding model";
  if (reason === "specialized_output_model") return "Specialized output model";
  if (reason === "capability_excludes_chat") return "Not a chat model";
  return "Chat capability not reported";
}

function navigateToKeys() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("agentsam:navigate", { detail: { to: "/settings/keys" } }));
}

export function ModelSelect({ compact = false }: { compact?: boolean }) {
  const selection = useWorkStore((s) => s.modelSelection);
  const setModelSelection = useWorkStore((s) => s.setModelSelection);
  const [inventory, setInventory] = useState<StudioInventoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await loadEffectiveModelInventory();
      setInventory(body);
      const models = body.availableModels || [];
      const chatModels = models.filter((model) => model.chat_eligible === true);
      const active = useWorkStore.getState().modelSelection;
      const activeIsEligible = chatModels.some(
        (model) => model.provider === active?.provider && model.model_id === active?.model_id,
      );
      const preferred = body.selection
        ? chatModels.find(
            (model) => model.provider === body.selection?.provider && model.model_id === body.selection?.model_id,
          )
        : null;
      if (preferred && (active?.provider !== preferred.provider || active?.model_id !== preferred.model_id)) {
        setModelSelection({ provider: preferred.provider, model_id: preferred.model_id });
      } else if (!activeIsEligible) {
        const next = chatModels[0];
        setModelSelection(next ? { provider: next.provider, model_id: next.model_id } : DEFAULT_SELECTION);
      }
    } catch {
      setError("Models are unavailable right now. Check provider settings and try again.");
    } finally {
      setLoading(false);
    }
  }, [setModelSelection]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!active) return;
      await refresh();
    };
    void run();
    const onChanged = () => void run();
    window.addEventListener(MODEL_INVENTORY_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    return () => {
      active = false;
      window.removeEventListener(MODEL_INVENTORY_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
    };
  }, [refresh]);

  const eligibleModels = useMemo(
    () => (inventory?.availableModels || []).filter((model) => model.chat_eligible === true),
    [inventory],
  );
  const otherModels = useMemo(
    () => (inventory?.availableModels || []).filter((model) => model.chat_eligible !== true),
    [inventory],
  );
  const groups = useMemo(() => groupModels(eligibleModels), [eligibleModels]);
  const providerLabels = useMemo(
    () => new Map((inventory?.providers || []).map((provider) => [provider.id, provider.label])),
    [inventory],
  );
  const current = eligibleModels.find(
    (model) => model.provider === selection?.provider && model.model_id === selection?.model_id,
  );
  const triggerLabel = current
    ? compact
      ? shortLabel(current)
      : current.label
    : loading
      ? "Checking…"
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
          <span className="max-w-40 truncate">{triggerLabel}</span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[420px] w-80 overflow-y-auto p-1.5">
        <div className="flex items-center justify-between px-2 py-1">
          <DropdownMenuLabel className="p-0">Model</DropdownMenuLabel>
          <button
            type="button"
            aria-label="Refresh model inventory"
            title="Refresh models"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void refresh();
            }}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </button>
        </div>

        {loading && !inventory ? (
          <div className="px-2 py-4 text-xs text-muted-foreground">Checking providers…</div>
        ) : null}
        {error ? (
          <div className="px-2 py-2 text-[11px] leading-4 text-destructive">{error}</div>
        ) : null}
        {!loading && !error && !eligibleModels.length ? (
          <div className="px-2 py-3">
            <div className="text-xs font-medium text-foreground">No runnable models yet</div>
            <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Add a provider credential or configure a local model, then refresh.
            </div>
            <button
              type="button"
              className="mt-2 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted"
              onClick={(event) => {
                event.preventDefault();
                navigateToKeys();
              }}
            >
              Connect provider
            </button>
          </div>
        ) : null}

        {groups.map(([provider, models]) => (
          <div key={provider}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {providerLabels.get(provider) || provider}
            </DropdownMenuLabel>
            {models.map((item) => {
              const next: StudioModelSelection = { provider: item.provider, model_id: item.model_id };
              const selected = selection?.provider === item.provider && selection?.model_id === item.model_id;
              return (
                <DropdownMenuItem
                  key={`${item.provider}:${item.model_id}`}
                  onSelect={() => {
                    setModelSelection(next);
                    void persistEffectiveModelSelection(next);
                  }}
                  className={cn("gap-2", selected && "bg-muted")}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12px]">{item.label}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {item.model_id}
                      {item.context_window ? ` · ctx ${Math.round(Number(item.context_window) / 1000)}k` : ""}
                    </span>
                  </span>
                  {selected ? <Check className="size-3.5 shrink-0" /> : null}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}

        {otherModels.length ? (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowOther((value) => !value);
              }}
            >
              <span>Other model types ({otherModels.length})</span>
              <ChevronDown className={cn("size-3 transition-transform", showOther && "rotate-180")} />
            </button>
            {showOther ? otherModels.map((item) => (
              <div key={`${item.provider}:${item.model_id}`} className="px-2 py-1.5 text-xs opacity-75">
                <div className="truncate text-foreground">{item.label || `${item.provider}:${item.model_id}`}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {eligibilityLabel(item.eligibility_reason)}
                </div>
              </div>
            )) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
