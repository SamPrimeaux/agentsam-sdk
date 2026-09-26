import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Cloud,
  Code2,
  Copy,
  Database,
  Eye,
  EyeOff,
  GitPullRequest,
  Globe2,
  HardDrive,
  KeyRound,
  Menu,
  Paintbrush,
  Palette,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  HealthState,
  SettingsCatalogItem,
  SettingsCredential,
  SettingsHost,
  SettingsManifest,
  SettingsModel,
  SettingsSnapshot,
  SettingsTheme,
  SettingsUnitDefinition,
  SettingsUnitId,
} from "../contracts/index";

const ICONS: Record<string, LucideIcon> = {
  settings: Settings,
  bot: Bot,
  sliders: SlidersHorizontal,
  palette: Palette,
  git: GitPullRequest,
  code: Code2,
  network: Globe2,
  theme: Paintbrush,
  storage: Database,
  key: KeyRound,
  usage: BarChart3,
  bell: Bell,
  docs: BookOpen,
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusTone(status: HealthState | SettingsCredential["status"]) {
  if (status === "healthy" || status === "active") {
    return "border-emerald-500/20 bg-emerald-500/8 text-emerald-300";
  }
  if (status === "attention" || status === "expired") {
    return "border-amber-500/20 bg-amber-500/8 text-amber-300";
  }
  if (status === "blocked" || status === "revoked") {
    return "border-red-500/20 bg-red-500/8 text-red-300";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

export function StatusPill({
  status,
  label,
}: {
  status: HealthState | SettingsCredential["status"];
  label?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
        statusTone(status),
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-90" />
      {label ?? status}
    </span>
  );
}

export function SettingsShell({
  manifest,
  activeUnit,
  onNavigate,
  children,
}: {
  manifest: SettingsManifest;
  activeUnit: SettingsUnitId;
  onNavigate: (unit: SettingsUnitId) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const rail = (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cx("flex h-12 shrink-0 items-center border-b border-border/70", collapsed ? "justify-center px-2" : "gap-2 px-3")}>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
          aria-label={collapsed ? "Expand settings navigation" : "Collapse settings navigation"}
        >
          <Menu className="size-4" />
        </button>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold text-foreground">Settings</div>
            <div className="truncate text-[10px] text-muted-foreground">{manifest.productName}</div>
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-label="Settings">
        <div className="space-y-0.5">
          {manifest.units.map((unit) => {
            const Icon = ICONS[unit.icon] ?? CircleDot;
            const active = unit.id === activeUnit;
            return (
              <button
                key={unit.id}
                type="button"
                title={collapsed ? unit.label : undefined}
                onClick={() => {
                  onNavigate(unit.id);
                  setMobileOpen(false);
                }}
                className={cx(
                  "flex min-h-9 w-full items-center rounded-md text-left transition-colors",
                  collapsed ? "justify-center px-2" : "gap-2.5 px-2.5",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-[15px] shrink-0" strokeWidth={1.7} />
                {!collapsed && <span className="truncate text-[12px] font-medium">{unit.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {!collapsed && (
        <div className="shrink-0 border-t border-border/70 p-3">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] font-medium text-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              Local preview
            </div>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              Production-shaped fixtures. No migrations required.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full bg-background text-foreground">
      <aside
        className={cx(
          "hidden shrink-0 border-r border-border/70 bg-background md:block",
          collapsed ? "w-14" : "w-[222px]",
        )}
      >
        {rail}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/70 px-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open settings navigation"
          >
            <Menu className="size-4" />
          </button>
          <span className="text-[12px] font-semibold">Settings</span>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[200] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close settings navigation"
          />
          <aside className="absolute inset-y-0 left-0 w-[86vw] max-w-[320px] border-r border-border bg-background shadow-2xl">
            <div className="absolute right-2 top-2 z-10">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close settings navigation"
              >
                <X className="size-4" />
              </button>
            </div>
            {rail}
          </aside>
        </div>
      )}
    </div>
  );
}

export function SettingsSheet({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[250]">
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />
      <section className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-2xl border border-border bg-background shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[430px] md:rounded-none md:border-y-0 md:border-r-0">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border/70 bg-background/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {description && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

export function SensitiveInput({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-foreground">{label}</span>
      <div className="flex h-9 items-center rounded-md border border-border bg-muted/35 px-2.5 focus-within:border-foreground/30">
        <code className="min-w-0 flex-1 truncate text-[11px] text-foreground">
          {revealed ? value : "••••••••••••••••••••"}
        </code>
        <button
          type="button"
          className="ml-2 flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setRevealed((value) => !value)}
          aria-label={revealed ? "Hide sensitive value" : "Reveal sensitive value"}
        >
          {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={async () => {
            await navigator.clipboard?.writeText(value).catch(() => undefined);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
          aria-label="Copy sensitive value"
        >
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      {description && <span className="mt-1.5 block text-[10px] text-muted-foreground">{description}</span>}
    </label>
  );
}

function PageHeader({
  unit,
  snapshot,
}: {
  unit: SettingsUnitDefinition;
  snapshot: SettingsSnapshot;
}) {
  const Icon = ICONS[unit.icon] ?? CircleDot;
  return (
    <header className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/25">
          <Icon className="size-4" strokeWidth={1.7} />
        </div>
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.025em]">{unit.label}</h1>
          <p className="mt-1 max-w-2xl text-[12px] leading-5 text-muted-foreground">{unit.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <StatusPill status={snapshot.health} />
        <span className="hidden sm:inline">{snapshot.repositoryLabel}</span>
      </div>
    </header>
  );
}

function SegmentNav({
  unit,
  activeView,
  onViewChange,
}: {
  unit: SettingsUnitDefinition;
  activeView?: string;
  onViewChange?: (view: string) => void;
}) {
  if (!unit.views?.length) return null;
  const selected = activeView && unit.views.some((view) => view.id === activeView)
    ? activeView
    : unit.views[0]?.id;
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 py-4">
      {unit.views.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => onViewChange?.(view.id)}
          className={cx(
            "shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
            view.id === selected
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="py-5 first:pt-0">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {description && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function PreferenceRow({
  label,
  description,
  value,
  trailing,
}: {
  label: string;
  description: string;
  value?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-4 border-b border-border/60 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-foreground">{label}</div>
        <div className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0">
        {trailing ?? <span className="text-[11px] text-muted-foreground">{value}</span>}
      </div>
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange?: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={() => onChange?.(!enabled)}
      className={cx(
        "relative h-5 w-9 rounded-full border transition-colors",
        enabled ? "border-foreground/20 bg-foreground" : "border-border bg-muted",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 size-4 rounded-full transition-transform",
          enabled ? "translate-x-[17px] bg-background" : "translate-x-0.5 bg-muted-foreground",
        )}
      />
    </button>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/15 p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[22px] font-semibold tracking-[-0.03em]">{value}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function Catalog({
  items,
  empty = "Nothing configured yet.",
}: {
  items: SettingsCatalogItem[];
  empty?: string;
}) {
  if (!items.length) {
    return <EmptyState title={empty} />;
  }
  return (
    <div className="divide-y divide-border/60 rounded-lg border border-border/70">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 px-3 py-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/20">
            <Boxes className="size-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium">{item.name}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.subtitle}</div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {item.meta && <span className="text-[10px] text-muted-foreground">{item.meta}</span>}
            <StatusPill status={item.status} />
          </div>
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 px-6 text-center">
      <div>
        <Sparkles className="mx-auto size-4 text-muted-foreground" />
        <p className="mt-2 text-[11px] text-muted-foreground">{title}</p>
      </div>
    </div>
  );
}

function ModelTable({ models }: { models: SettingsModel[] }) {
  const columns = {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1.6fr) 1fr 0.8fr 0.8fr auto",
    columnGap: "0.75rem",
    alignItems: "center",
  } as const;

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <div
        className="hidden border-b border-border/70 bg-muted/20 px-3 py-2 text-[9px] font-medium uppercase tracking-[0.11em] text-muted-foreground sm:grid"
        style={columns}
      >
        <span>Model</span>
        <span>Provider</span>
        <span>Tier</span>
        <span>Context</span>
        <span>Status</span>
      </div>
      <div className="divide-y divide-border/60">
        {models.map((model) => (
          <div key={model.id} className="px-3 py-3 sm:grid" style={columns}>
            <div>
              <div className="text-[12px] font-medium">{model.name}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground sm:hidden">
                {model.provider} · {model.tier}
              </div>
            </div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">{model.provider}</div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">{model.tier}</div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">{model.context}</div>
            <StatusPill status={model.status} label={model.enabled ? "Enabled" : "Disabled"} />
          </div>
        ))}
      </div>
    </div>
  );
}

function KeysView({ snapshot }: { snapshot: SettingsSnapshot }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [owner, setOwner] = useState<"you" | "service">("you");
  const [permissions, setPermissions] = useState<"all" | "restricted" | "read-only">("all");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = snapshot.credentials.filter((credential) =>
    [credential.name, credential.trackingId, credential.provider ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  /** Inline template — do not rely on Tailwind scanning this package for arbitrary grid-cols. */
  const KEYS_TABLE_GRID = {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.8fr 1fr 1.15fr 0.9fr 0.8fr 0.9fr 0.9fr 0.7fr",
    columnGap: "0.5rem",
  } as const;

  return (
    <>
      <Section
        title="Credentials"
        description="AgentSam-issued account keys, machine credentials and provider secrets."
        action={
          <button
            type="button"
            onClick={() => {
              setCreatedSecret(null);
              setSheetOpen(true);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Create new secret key
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex h-8 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 sm:max-w-[320px]">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search keys"
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button type="button" className="h-8 rounded-md border border-border px-2.5 text-[10px] text-muted-foreground hover:bg-muted">
            + Add filter
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border/70">
          <div className="agentsam-settings-keys-table min-w-[980px]">
            <div
              className="agentsam-settings-keys-row agentsam-settings-keys-row--head border-b border-border/70 bg-muted/20 px-3 py-2 text-[9px] font-medium uppercase tracking-[0.09em] text-muted-foreground"
              style={KEYS_TABLE_GRID}
            >
              <span>Name</span>
              <span>Status</span>
              <span>Tracking ID</span>
              <span>Secret</span>
              <span>Created</span>
              <span>Expires</span>
              <span>Last used</span>
              <span>Permissions</span>
              <span>Spend</span>
            </div>
            <div className="divide-y divide-border/60">
              {filtered.map((credential) => (
                <div
                  key={credential.id}
                  className="agentsam-settings-keys-row items-center px-3 py-3 text-[10px]"
                  style={KEYS_TABLE_GRID}
                >
                  <div className="min-w-0 pr-2">
                    <div className="truncate font-medium text-foreground">{credential.name}</div>
                    <div className="mt-0.5 truncate text-[9px] capitalize text-muted-foreground">
                      {credential.provider ?? credential.kind}
                    </div>
                  </div>
                  <StatusPill status={credential.status} />
                  <code className="truncate pr-2 text-muted-foreground">{credential.trackingId}</code>
                  <code className="truncate pr-2 text-muted-foreground">{credential.secretPreview}</code>
                  <span className="text-muted-foreground">{credential.created}</span>
                  <span className="text-muted-foreground">{credential.expires}</span>
                  <span className="text-muted-foreground">{credential.lastUsed}</span>
                  <span className="text-muted-foreground">{credential.permissions}</span>
                  <span className="text-muted-foreground">{credential.monthlySpend}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <SettingsSheet
        open={sheetOpen}
        title={createdSecret ? "Copy your secret key" : "Create new secret key"}
        description={
          createdSecret
            ? "This value is shown once in the production flow. Store it somewhere secure."
            : "The Local Studio fixture proves the interaction only; it does not mint a real credential."
        }
        onClose={() => setSheetOpen(false)}
      >
        {createdSecret ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 p-3 text-[11px] leading-5 text-amber-200">
              You will not be able to view this key again after closing this sheet.
            </div>
            <SensitiveInput
              label="AgentSam API key"
              value={createdSecret}
              description="Use as AGENTSAM_API_KEY for account credentials."
            />
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="h-9 w-full rounded-md bg-foreground text-[11px] font-medium text-background"
            >
              Done
            </button>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              setCreatedSecret(
                owner === "you"
                  ? "aak_demo_localhost_7fc2d918"
                  : "brk_demo_localhost_93a1c4ef",
              );
            }}
          >
            <div>
              <span className="mb-1.5 block text-[11px] font-medium">Owned by</span>
              <div className="inline-flex rounded-md border border-border bg-muted/20 p-0.5">
                {[
                  ["you", "You"],
                  ["service", "Service account"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOwner(value as "you" | "service")}
                    className={cx(
                      "rounded px-2.5 py-1.5 text-[10px] font-medium",
                      owner === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                {owner === "you"
                  ? "Account credentials are human-owned and use AGENTSAM_API_KEY."
                  : "Machine credentials are registered to a caller and use AGENTSAM_BRIDGE_KEY."}
              </p>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium">Name</span>
              <input
                defaultValue={owner === "you" ? "Sams-iMac · CLI" : "Local Studio prod"}
                className="h-9 w-full rounded-md border border-border bg-muted/25 px-3 text-[11px] outline-none focus:border-foreground/30"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium">Project</span>
              <select className="h-9 w-full rounded-md border border-border bg-muted/25 px-3 text-[11px] outline-none">
                <option>agentsam-sdk</option>
                <option>Account-wide</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium">Expiration</span>
              <select className="h-9 w-full rounded-md border border-border bg-muted/25 px-3 text-[11px] outline-none">
                <option>Never</option>
                <option>30 days</option>
                <option>90 days</option>
                <option>1 year</option>
              </select>
            </label>

            <div>
              <span className="mb-1.5 block text-[11px] font-medium">Permissions</span>
              <div className="inline-flex flex-wrap rounded-md border border-border bg-muted/20 p-0.5">
                {[
                  ["all", "All"],
                  ["restricted", "Restricted"],
                  ["read-only", "Read only"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPermissions(value as typeof permissions)}
                    className={cx(
                      "rounded px-2.5 py-1.5 text-[10px] font-medium",
                      permissions === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border/70 pt-4">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="h-8 rounded-md border border-border px-3 text-[10px] text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 rounded-md bg-foreground px-3 text-[10px] font-medium text-background"
              >
                Create secret key
              </button>
            </div>
          </form>
        )}
      </SettingsSheet>
    </>
  );
}

function ThemesView({ themes }: { themes: SettingsTheme[] }) {
  return (
    <>
      <AppearancePreferences />
      <Section title="Theme gallery" description="Brand authority projected into reusable product themes.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {themes.map((theme) => (
            <article key={theme.id} className="overflow-hidden rounded-xl border border-border/70 bg-muted/10">
              <div className="relative h-28 border-b border-border/70 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.09),transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.02),rgba(255,255,255,0.06))]">
                <div className="absolute inset-x-4 bottom-4 flex gap-1.5">
                  {theme.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      className="size-6 rounded-full border border-white/15 shadow-sm"
                      style={{ backgroundColor: swatch }}
                      title={swatch}
                    />
                  ))}
                </div>
              </div>
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-medium">{theme.name}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{theme.category}</div>
                  </div>
                  {theme.active && <StatusPill status="healthy" label="Active" />}
                </div>
                <code className="mt-3 block truncate text-[9px] text-muted-foreground">{theme.packageName}</code>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}

function AgentsView({ snapshot, view }: { snapshot: SettingsSnapshot; view: string }) {
  if (view === "models") {
    return (
      <Section title="Model inventory" description="Only configured and available models should appear in production.">
        <ModelTable models={snapshot.models} />
      </Section>
    );
  }
  if (view === "cloud") {
    return (
      <Section title="Cloud agents" description="Persistent and disposable remote execution lanes.">
        <Catalog items={snapshot.cloudAgents} />
      </Section>
    );
  }
  if (view === "policy") {
    return (
      <Section title="Execution policy" description="Deterministic controls stay separate from model selection.">
        <div className="rounded-lg border border-border/70 px-3">
          <PreferenceRow label="Provider routing" description="Do not silently fall back to another provider." value="Fail closed" />
          <PreferenceRow label="Approval boundary" description="Mutating external actions require explicit authorization." value="Required" />
          <PreferenceRow label="Subagent fanout" description="Parallel lanes use registered role profiles." value="Up to 6" />
          <PreferenceRow label="Runtime receipts" description="Capture structured evidence for agent execution." trailing={<Toggle enabled />} />
        </div>
      </Section>
    );
  }

  return (
    <Section title="Agent catalog" description="Configured roles and their current model/runtime relationship.">
      <div className="grid gap-3 md:grid-cols-2">
        {snapshot.agents.map((agent) => (
          <article key={agent.id} className="rounded-lg border border-border/70 bg-muted/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-md border border-border bg-muted/20">
                  <Bot className="size-3.5" />
                </div>
                <div>
                  <div className="text-[12px] font-medium">{agent.name}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{agent.role}</div>
                </div>
              </div>
              <StatusPill status={agent.status} />
            </div>
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{agent.detail}</p>
            <div className="mt-3 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">{agent.model}</div>
          </article>
        ))}
      </div>
    </Section>
  );
}

function CustomizeView({ snapshot, view }: { snapshot: SettingsSnapshot; view: string }) {
  const map: Record<string, SettingsCatalogItem[]> = {
    plugins: snapshot.plugins,
    mcps: snapshot.mcps,
    skills: snapshot.skills,
    subagents: snapshot.subagents,
    rules: snapshot.rules,
    commands: snapshot.commands,
    hooks: snapshot.hooks,
  };
  const labels: Record<string, string> = {
    plugins: "Plugins",
    mcps: "MCP servers",
    skills: "Skills",
    subagents: "Subagents",
    rules: "Rules",
    commands: "Commands",
    hooks: "Hooks",
  };
  return (
    <Section
      title={labels[view] ?? "Extensions"}
      description="One extension surface with normalized status and configuration behavior."
      action={
        <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
          <Plus className="size-3.5" />
          Add
        </button>
      }
    >
      <Catalog items={map[view] ?? snapshot.plugins} />
    </Section>
  );
}

function GeneralView({ snapshot }: { snapshot: SettingsSnapshot }) {
  return (
    <>
      <Section title="Product context" description="Local Studio owns composition; Settings consumes normalized host context.">
        <div className="rounded-lg border border-border/70 px-3">
          <PreferenceRow label="Account" description="Canonical owner for user-created resources." value={snapshot.general.account} />
          <PreferenceRow label="Organization" description="Organizational context; not a substitute for account authority." value={snapshot.general.organization} />
          <PreferenceRow label="Project" description="Current repository/project context." value={snapshot.general.project} />
          <PreferenceRow label="Runtime" description="Current execution host." value={snapshot.general.runtime} />
        </div>
      </Section>
      <AppearancePreferences />
      <Section title="Application" description="Local preferences stay compact and explicit.">
        <div className="rounded-lg border border-border/70 px-3">
          <PreferenceRow label="Update channel" description="Desktop and package update cadence." value={snapshot.general.updateChannel} />
          <PreferenceRow label="Open last project" description="Restore the most recent project at launch." trailing={<Toggle enabled />} />
          <PreferenceRow label="Show runtime receipts" description="Surface deterministic evidence beside agent work." trailing={<Toggle enabled />} />
        </div>
      </Section>
    </>
  );
}

const SHELL_APPEARANCE_KEY = "agentsam-shell-appearance-v1";
const SHELL_ACCENTS = [
  { id: "#8B5CF6", label: "Violet" },
  { id: "#2563EB", label: "Blue" },
  { id: "#0D9488", label: "Teal" },
  { id: "#BE185D", label: "Rose" },
] as const;

function AppearancePreferences() {
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [accent, setAccent] = useState(SHELL_ACCENTS[1].id);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(SHELL_APPEARANCE_KEY) ?? "{}");
      if (raw.theme === "dark" || raw.theme === "light" || raw.theme === "system") setTheme(raw.theme);
      if (typeof raw.accent === "string" && /^#[0-9a-f]{6}$/i.test(raw.accent)) setAccent(raw.accent);
    } catch {
      /* defaults */
    }
  }, []);

  function commit(nextTheme: typeof theme, nextAccent: string) {
    setTheme(nextTheme);
    setAccent(nextAccent);
    localStorage.setItem(SHELL_APPEARANCE_KEY, JSON.stringify({ theme: nextTheme, accent: nextAccent }));
    window.dispatchEvent(
      new CustomEvent("agentsam:shell-appearance", { detail: { theme: nextTheme, accent: nextAccent } }),
    );
  }

  return (
    <Section
      title="Appearance"
      description="Shell theme and accent live here — not in the account overflow menu."
    >
      <div className="rounded-lg border border-border/70 px-3 py-3">
        <div className="mb-3">
          <div className="text-[11px] font-medium">Color mode</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["dark", "light", "system"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => commit(mode, accent)}
                className={cx(
                  "h-8 rounded-md border px-3 text-[10px] font-medium capitalize",
                  theme === mode
                    ? "border-foreground/30 bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium">Accent</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {SHELL_ACCENTS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => commit(theme, option.id)}
                className={cx(
                  "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-[10px] font-medium",
                  accent === option.id
                    ? "border-foreground/30 bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className="size-3 rounded-full" style={{ background: option.id }} />
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Prefer product themes from the Themes unit for gallery projections. Accent here only tints shell chrome.
        </p>
      </div>
    </Section>
  );
}

function DesignView() {
  return (
    <>
      <Section title="Brand contract" description="Brand tokens remain semantic; product surfaces consume the contract rather than hard-coded colors.">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Token families" value="8" detail="Color, type, radius, spacing, motion…" />
          <MetricCard label="Themes" value="3" detail="Installed projections" />
          <MetricCard label="Validation" value="Clean" detail="No unresolved token aliases" />
        </div>
      </Section>
      <Section title="Editor behavior">
        <div className="rounded-lg border border-border/70 px-3">
          <PreferenceRow label="Live preview" description="Apply token changes to preview surfaces immediately." trailing={<Toggle enabled />} />
          <PreferenceRow label="Monaco theme" description="Project brand into code editors where supported." value="AgentSam Graphite" />
          <PreferenceRow label="Reduced motion" description="Honor the operating system preference." value="System" />
        </div>
      </Section>
    </>
  );
}

function GitView({ snapshot }: { snapshot: SettingsSnapshot }) {
  return (
    <>
      <Section title="Repository connection" description="Git provider identity and repository state stay visible but compact.">
        <div className="rounded-lg border border-border/70 px-3">
          <PreferenceRow label="Provider" description="Repository provider used by this project." value={snapshot.git.provider} />
          <PreferenceRow label="Repository" description="Current repository." value={snapshot.git.repository} />
          <PreferenceRow label="Branch" description="Current working branch." value={snapshot.git.branch} />
          <PreferenceRow label="Pull request" description="Review state for the current branch." value={snapshot.git.pullRequests} />
        </div>
      </Section>
      <Section title="Pull request policy">
        <div className="rounded-lg border border-border/70 px-3">
          <PreferenceRow label="Require clean build" description="Block PR creation when the package build fails." trailing={<Toggle enabled />} />
          <PreferenceRow label="Include runtime receipts" description="Attach verification evidence to generated PR descriptions." trailing={<Toggle enabled />} />
        </div>
      </Section>
    </>
  );
}

function CodebaseView({ snapshot }: { snapshot: SettingsSnapshot }) {
  return (
    <>
      <Section title="Repository intelligence" description={snapshot.codebase.policy}>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Indexed files" value={snapshot.codebase.indexedFiles} detail="Current code index" />
          <MetricCard label="Symbols" value={snapshot.codebase.symbols} detail="AST nodes" />
          <MetricCard label="Dependencies" value={snapshot.codebase.dependencies} detail="Graph edges" />
        </div>
      </Section>
      <Section title="Indexing policy">
        <div className="rounded-lg border border-border/70 px-3">
          <PreferenceRow label="Current branch" description="Repository ref used for deterministic inspection." value={snapshot.codebase.branch} />
          <PreferenceRow label="Semantic projection" description="Embeddings augment structural retrieval; they are not source authority." value="Enabled" />
          <PreferenceRow label="Generated files" description="Exclude build output and dependency folders." trailing={<Toggle enabled />} />
        </div>
      </Section>
    </>
  );
}

function NetworkView({ snapshot }: { snapshot: SettingsSnapshot }) {
  return (
    <Section title="Browser & network capabilities" description="Local, OAuth and tunnel state are separate capabilities.">
      <div className="rounded-lg border border-border/70 px-3">
        <PreferenceRow label="Browser runtime" description="Browser automation availability." value={snapshot.network.browser} />
        <PreferenceRow label="Device tunnel" description="Local machine reachability." value={snapshot.network.tunnel} />
        <PreferenceRow label="Cloudflare OAuth" description="Connected infrastructure account." value={snapshot.network.oauth} />
        <PreferenceRow label="Network health" description="Aggregate display only; individual capabilities retain their own status." trailing={<StatusPill status={snapshot.network.health} />} />
      </div>
    </Section>
  );
}

function StorageView({ snapshot }: { snapshot: SettingsSnapshot }) {
  return (
    <Section title="Storage targets" description="Local-first runtime state with explicit hosted targets where durability is required.">
      <div className="grid gap-3 md:grid-cols-2">
        {snapshot.storage.map((target) => (
          <article key={target.id} className="rounded-lg border border-border/70 bg-muted/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <HardDrive className="size-4 text-muted-foreground" />
                <div>
                  <div className="text-[12px] font-medium">{target.name}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{target.kind}</div>
                </div>
              </div>
              <StatusPill status={target.status} />
            </div>
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{target.detail}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function UsageView({ snapshot }: { snapshot: SettingsSnapshot }) {
  return (
    <>
      <Section title="Current usage" description="Usage and cost remain evidence, not hidden routing inputs.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {snapshot.usage.map((metric) => <MetricCard key={metric.label} {...metric} />)}
        </div>
      </Section>
      <Section title="Limits">
        <div className="rounded-lg border border-border/70 px-3">
          <PreferenceRow label="Agent concurrency" description="Maximum simultaneous local/remote agent lanes." value="4" />
          <PreferenceRow label="Terminal sessions" description="Maximum active PTYs per account." value="4" />
          <PreferenceRow label="Usage warnings" description="Notify before a configured budget threshold is exceeded." trailing={<Toggle enabled />} />
        </div>
      </Section>
    </>
  );
}

function NotificationsView({ snapshot }: { snapshot: SettingsSnapshot }) {
  const [items, setItems] = useState(snapshot.notifications);
  return (
    <Section title="Notification preferences" description="Only actionable changes should interrupt the user.">
      <div className="rounded-lg border border-border/70 px-3">
        {items.map((item) => (
          <PreferenceRow
            key={item.id}
            label={item.label}
            description={item.description}
            trailing={
              <Toggle
                enabled={item.enabled}
                onChange={(enabled) =>
                  setItems((current) =>
                    current.map((candidate) =>
                      candidate.id === item.id ? { ...candidate, enabled } : candidate,
                    ),
                  )
                }
              />
            }
          />
        ))}
      </div>
    </Section>
  );
}

function DocsView() {
  return (
    <>
      <Section title="Product documentation" description="Settings should point to the same contracts the product actually uses.">
        <div className="divide-y divide-border/60 rounded-lg border border-border/70">
          {[
            ["Settings host contract", "Normalized adapters between presentation and runtime."],
            ["Identity & OAuth", "Account authority, web clients, native clients and provider connections."],
            ["Keys & vault", "AgentSam-issued credentials, BYOK provider secrets and encryption boundaries."],
            ["Local runtime", "Tauri bootstrap, agentsamd and machine enrollment."],
          ].map(([title, description]) => (
            <button key={title} type="button" className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/35">
              <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium">{title}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">{description}</span>
              </span>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

function KeysSubView({ view, snapshot }: { view: string; snapshot: SettingsSnapshot }) {
  if (view === "credentials") return <KeysView snapshot={snapshot} />;

  if (view === "secrets") {
    return (
      <Section title="Personal secrets" description="BYOK provider values are encrypted at rest and revealed only when the product explicitly permits it.">
        <div className="space-y-3">
          <SensitiveInput label="OpenAI" value="sk-demo-not-a-real-key" description="Fixture only · service=openai · type=api_key" />
          <SensitiveInput label="Cloudflare" value="cf-demo-not-a-real-token" description="Fixture only · service=cloudflare · type=token" />
        </div>
      </Section>
    );
  }

  if (view === "sessions") {
    return (
      <Section title="Sessions & security" description="Active product sessions and security evidence live beside credential management, not inside the credential table.">
        <div className="rounded-lg border border-border/70 px-3">
          <PreferenceRow label="Local Studio · browser" description="Current authenticated web session." value="Active now" />
          <PreferenceRow label="Sams-iMac · CLI" description="Native CLI authorization." value="18 min ago" />
          <PreferenceRow label="Revoke other sessions" description="Keep the current session and invalidate the rest." value="Review" />
        </div>
      </Section>
    );
  }

  return (
    <Section title="Security audit" description="Credential events should be attributable without logging plaintext values.">
      <div className="divide-y divide-border/60 rounded-lg border border-border/70">
        {[
          ["API key used", "Sams-iMac · CLI", "2 min ago"],
          ["Provider secret updated", "OpenAI · default", "Yesterday"],
          ["Service credential rotated", "Local Studio prod", "Sep 24"],
        ].map(([action, target, time]) => (
          <div key={action + target} className="grid grid-cols-[1fr_auto] gap-4 px-3 py-3">
            <div>
              <div className="text-[11px] font-medium">{action}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{target}</div>
            </div>
            <div className="text-[10px] text-muted-foreground">{time}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function renderUnit(unit: SettingsUnitId, snapshot: SettingsSnapshot, view: string) {
  switch (unit) {
    case "general":
      return <GeneralView snapshot={snapshot} />;
    case "agents":
      return <AgentsView snapshot={snapshot} view={view} />;
    case "customize":
      return <CustomizeView snapshot={snapshot} view={view} />;
    case "design":
      return <DesignView />;
    case "git-prs":
      return <GitView snapshot={snapshot} />;
    case "codebase":
      return <CodebaseView snapshot={snapshot} />;
    case "network":
      return <NetworkView snapshot={snapshot} />;
    case "themes":
      return <ThemesView themes={snapshot.themes} />;
    case "storage":
      return <StorageView snapshot={snapshot} />;
    case "keys":
      return <KeysSubView snapshot={snapshot} view={view} />;
    case "usage":
      return <UsageView snapshot={snapshot} />;
    case "notifications":
      return <NotificationsView snapshot={snapshot} />;
    case "docs":
      return <DocsView />;
    default:
      return null;
  }
}

export function SettingsProductPage({
  manifest,
  host,
  unitId,
  requestedView,
  onViewChange,
}: {
  manifest: SettingsManifest;
  host: SettingsHost;
  unitId: SettingsUnitId;
  requestedView?: string;
  onViewChange?: (view: string) => void;
}) {
  const unit = manifest.units.find((candidate) => candidate.id === unitId) ?? manifest.units[0];
  const defaultView = unit?.views?.[0]?.id ?? "";
  const [activeView, setActiveView] = useState(requestedView || defaultView);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    host.snapshot().then((next) => {
      if (!cancelled) setSnapshot(next);
    });
    return () => {
      cancelled = true;
    };
  }, [host]);

  useEffect(() => {
    setActiveView(requestedView || defaultView);
  }, [requestedView, defaultView, unitId]);

  const validView = useMemo(() => {
    if (!unit?.views?.length) return "";
    return unit.views.some((candidate) => candidate.id === activeView)
      ? activeView
      : defaultView;
  }, [activeView, defaultView, unit]);

  if (!unit) return null;

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <PageHeader unit={unit} snapshot={snapshot} />
        <SegmentNav
          unit={unit}
          activeView={validView}
          onViewChange={(view) => {
            setActiveView(view);
            onViewChange?.(view);
          }}
        />
        <div className={unit.views?.length ? "" : "pt-5"}>
          {renderUnit(unit.id, snapshot, validView)}
        </div>
      </div>
    </div>
  );
}
