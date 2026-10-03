import type { AgentRunMode } from "@inneranimalmedia/agentsam-contracts";
import {
  AGENT_RUN_MODE_PROFILES,
  agentRunModeProfile,
} from "@inneranimalmedia/agentsam-workbench/agent";
import {
  Bot,
  Bug,
  Check,
  ChevronDown,
  ListChecks,
  MessageCircle,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MODE_ICONS: Record<AgentRunMode, LucideIcon> = {
  agent: Bot,
  plan: ListChecks,
  debug: Bug,
  multitask: Workflow,
  ask: MessageCircle,
};

export function RunModeSelect({
  value,
  onChange,
  compact = false,
}: {
  value: AgentRunMode;
  onChange: (mode: AgentRunMode) => void;
  compact?: boolean;
}) {
  const active = agentRunModeProfile(value);
  const ActiveIcon = MODE_ICONS[value];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-agent-mode-trigger=""
          data-agent-mode={value}
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-[var(--composer-mode-accent)] hover:bg-muted/70"
          aria-label={"Run mode: " + active.label}
          title={active.description}
        >
          <ActiveIcon className="size-3.5" />
          {!compact ? <span>{active.label}</span> : null}
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1.5">
        {AGENT_RUN_MODE_PROFILES.map((profile) => {
          const Icon = MODE_ICONS[profile.id];
          return (
            <DropdownMenuItem
              key={profile.id}
              onSelect={() => onChange(profile.id)}
              className="gap-2.5 px-2.5 py-2"
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">{profile.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {profile.description}
                </span>
              </span>
              {profile.id === value ? <Check className="size-3.5 shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
