import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STUDIO_MODELS, getModel } from "@/lib/work/models";
import { useWorkStore } from "@/lib/work/store";
import { cn } from "@/lib/utils";

export function ModelSelect({ compact = false }: { compact?: boolean }) {
  const modelId = useWorkStore((s) => s.modelId);
  const setModelId = useWorkStore((s) => s.setModelId);
  const model = getModel(modelId);

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
          <span className="max-w-28 truncate">{compact ? model.short : model.label}</span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        {STUDIO_MODELS.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() => setModelId(item.id)}
            className={cn(item.id === modelId && "bg-muted")}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{item.label}</span>
              <span className="text-[11px] text-muted-foreground">{item.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
