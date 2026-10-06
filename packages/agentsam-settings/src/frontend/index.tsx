import { SettingsThemeGallery } from "./themes";
import { WidgetGalleryPreview } from "./WidgetGalleryPreview";
export { SettingsThemeGallery } from "./themes";
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
  Clock3,
  Cloud,
  Code2,
  Copy,
  Cpu,
  Database,
  Eye,
  EyeOff,
  GitPullRequest,
  Globe2,
  HardDrive,
  KeyRound,
  Menu,
  Megaphone,
  ExternalLink,
  ArrowUpRight,
  Paintbrush,
  Palette,
  Plug,
  Plus,
  RefreshCw,
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
  SettingsCatalogKind,
  SettingsCredential,
  SettingsHost,
  SettingsManifest,
  SettingsModel,
  SettingsPlugin,
  SettingsDiscoveredPlugin,
  SettingsPluginDiscovery,
  SettingsSnapshot,
  SettingsWidget,
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
  runtime: Cpu,
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
  railStatus,
  rootLabel = manifest.productName,
  onExit,
}: {
  manifest: SettingsManifest;
  activeUnit: SettingsUnitId;
  onNavigate: (unit: SettingsUnitId) => void;
  children: ReactNode;
  /** Sidebar footer — live vault when unset uses production copy. */
  railStatus?: { title: string; detail: string };
  /** Compact breadcrumb root supplied by the host product. */
  rootLabel?: string;
  /** Returns to the host product without coupling Settings to a router. */
  onExit?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeLabel = manifest.units.find((unit) => unit.id === activeUnit)?.label ?? "Settings";
  const status = railStatus ?? {
    title: activeUnit === "keys" ? "Account vault" : "Local Studio",
    detail:
      activeUnit === "keys"
        ? "Secrets encrypt to your account. No project scope."
        : "Settings shell. Keys use the live vault.",
  };

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
              {status.title}
            </div>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{status.detail}</p>
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
        <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border/70 px-3 text-[11px]">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Open settings navigation"
          >
            <Menu className="size-3.5" />
          </button>
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="rounded px-1.5 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {rootLabel}
            </button>
          ) : (
            <span className="px-1.5 py-1 font-medium text-muted-foreground">{rootLabel}</span>
          )}
          <ChevronRight className="size-3 text-muted-foreground/70" />
          <span className="px-1 py-1 font-medium text-foreground">Settings</span>
          <ChevronRight className="hidden size-3 text-muted-foreground/70 sm:block" />
          <span className="hidden truncate px-1 py-1 text-muted-foreground sm:block">{activeLabel}</span>
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
  onSelect,
}: {
  items: SettingsCatalogItem[];
  empty?: string;
  onSelect?: (item: SettingsCatalogItem) => void;
}) {
  if (!items.length) {
    return <EmptyState title={empty} />;
  }
  return (
    <div className="divide-y divide-border/60 rounded-lg border border-border/70">
      {items.map((item) => {
        const content = (
          <>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/20">
              <Boxes className="size-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-[12px] font-medium">{item.name}</div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.subtitle}</div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              {item.meta && <span className="text-[10px] text-muted-foreground">{item.meta}</span>}
              <StatusPill status={item.status} />
            </div>
            {onSelect ? <ChevronRight className="size-3.5 text-muted-foreground" /> : null}
          </>
        );
        return onSelect ? (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/35"
          >
            {content}
          </button>
        ) : (
          <div key={item.id} className="flex items-center gap-3 px-3 py-3">
            {content}
          </div>
        );
      })}
    </div>
  );
}

function ExtensionTile({
  name,
  subtitle,
  imageUrl,
  imageAlt,
  imageFit = "contain",
  icon,
  badge,
  muted = false,
  onClick,
}: {
  name: string;
  subtitle: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  imageFit?: "contain" | "cover";
  icon?: ReactNode;
  badge?: ReactNode;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "group min-w-0 rounded-2xl border border-transparent p-2.5 text-center transition",
        "hover:border-border/80 hover:bg-muted/25 focus-visible:border-foreground/30 focus-visible:outline-none",
        muted && "opacity-55",
      )}
    >
      <div className="relative mx-auto size-16">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-[16px] border border-white/10 bg-gradient-to-br from-muted/90 via-muted/45 to-background shadow-[0_8px_26px_rgba(0,0,0,0.24)] ring-1 ring-black/10 transition-transform group-hover:-translate-y-0.5">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={imageAlt || ""}
              className={cx("size-full", imageFit === "cover" ? "object-cover" : "object-contain p-2.5")}
            />
          ) : (
            icon ?? <Boxes className="size-6 text-muted-foreground" />
          )}
        </div>
        {badge ? <div className="absolute -bottom-1 -right-1">{badge}</div> : null}
      </div>
      <div className="mt-2 truncate text-[11px] font-medium text-foreground">{name}</div>
      <div className="mt-0.5 truncate text-[9px] text-muted-foreground">{subtitle}</div>
    </button>
  );
}


/**
 * Installed state comes exclusively from SettingsSnapshot/plugins (the host's
 * real registry). Discoverable entries come from an operator-configured,
 * manifest-driven catalog. Neither a discovery card nor D1 installation is
 * proof of a connected, executable tool.
 */
function PluginCustomizeView({
  plugins,
  host,
  onChanged,
}: {
  plugins: SettingsPlugin[];
  host: SettingsHost;
  onChanged: () => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<SettingsPluginDiscovery | null>(null);
  const [loading, setLoading] = useState(Boolean(host.discoverPlugins));
  const [catalogError, setCatalogError] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const discovered = catalog?.plugins || [];
  const installed = plugins.find(plugin => plugin.id === selectedKey || plugin.pluginKey === selectedKey) ?? null;
  const selectedCatalog = discovered.find(plugin =>
    plugin.pluginKey === selectedKey || plugin.pluginKey === installed?.pluginKey
  ) ?? null;
  const selected = selectedCatalog || installed;
  const name = selected?.name || "Plugin";
  const details = selectedCatalog?.description || installed?.subtitle || "";
  const categories = useMemo(() => [
    "all",
    ...new Set(discovered.map(plugin => plugin.category).filter(Boolean)),
  ], [discovered]);
  const filtered = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return discovered.filter(plugin => (
      (activeCategory === "all" || plugin.category === activeCategory) &&
      (!needle || [plugin.name, plugin.subtitle, plugin.description, plugin.publisher,
        ...(plugin.keywords || []), ...(plugin.capabilities || [])]
        .some(value => value.toLowerCase().includes(needle)))
    ));
  }, [discovered, activeCategory, searchTerm]);

  async function refresh() {
    if (!host.discoverPlugins) {
      setCatalogError("This host has not configured plugin discovery.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setCatalogError("");
    try {
      const result = await host.discoverPlugins();
      setCatalog(result);
      if (result.errors?.length) {
        setCatalogError("Some configured plugin catalogs are unavailable. Existing installations are unaffected.");
      }
      if (!result.configuredSources) {
        setCatalogError("No trusted plugin catalogs are configured for this host.");
      }
    } catch {
      setCatalogError("Plugin discovery is unavailable. Installed plugins are still accessible.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, [host]);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await operation();
      await onChanged();
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "plugin_action_failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(label + " copied");
    } catch {
      setActionError("Clipboard unavailable; select and copy the text directly.");
    }
  }

  const stateFor = (entry: SettingsDiscoveredPlugin) => {
    const row = plugins.find(plugin=>plugin.pluginKey === entry.pluginKey);
    if (row?.setupStatus === "connected" && row.enabled && row.toolCount > 0 && row.healthStatus === "healthy") return "Connected";
    return row || entry.installationId ? "Needs connection" : "Available";
  };

  function iconFor(plugin: { name: string; keywords?: string[] }, size = "size-6") {
    const signal = [plugin.name, ...(plugin.keywords ?? [])].join(" ").toLowerCase();
    if (/brand|identity|design/.test(signal)) return <Palette className={size}/>;
    if (/campaign|marketing|promotion/.test(signal)) return <Megaphone className={size}/>;
    return <Plug className={size}/>;
  }
  const stateClasses = (state: string) => state === "Connected"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : state === "Available"
      ? "border-sky-400/30 bg-sky-400/10 text-sky-300"
      : "border-amber-400/25 bg-amber-400/10 text-amber-300";
  const anySelected = Boolean(selected);

  return (
    <>
      <section className="space-y-6 pb-8">
        <div className="relative overflow-hidden rounded-[22px] border border-border/70 bg-gradient-to-br from-muted/55 via-background to-violet-500/[0.065] p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-violet-500/[0.08] blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Plug className="size-3.5 text-violet-400" /> AgentSam integrations
              </p>
              <h2 className="text-[25px] font-semibold tracking-[-0.05em] sm:text-[30px]">Make AgentSam yours.</h2>
              <p className="mt-2 max-w-lg text-[12px] leading-relaxed text-muted-foreground">
                Browse real published plugins, inspect their capabilities, and manage the integrations connected to your account.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-2 text-[10px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-400"/>
              <span><b className="text-foreground">{plugins.length}</b> installed</span>
              <span className="text-border">/</span>
              <span><b className="text-foreground">{discovered.length}</b> discoverable</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.025em]">Installed <ChevronRight className="size-4 text-muted-foreground"/></h3>
              <p className="mt-1 text-[11px] text-muted-foreground">Actual plugins saved in this account's registry.</p>
            </div>
            <button type="button" onClick={()=>void (async()=>{await onChanged();await refresh();})()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
              <RefreshCw className={cx("size-3.5",loading && "animate-spin")}/> Refresh
            </button>
          </div>
          {plugins.length ? (
            <div className="flex gap-3 overflow-x-auto pb-2" aria-label="Installed plugins">
              {plugins.map(plugin=>{
                const matched = discovered.find(entry=>entry.pluginKey===plugin.pluginKey);
                return (
                  <button type="button" key={plugin.id} onClick={()=>{setSelectedKey(plugin.id);setActionError("");setNotice("");}}
                    aria-label={"View installed "+plugin.name}
                    className="group flex w-[100px] shrink-0 flex-col items-center gap-2 rounded-xl p-2 text-center hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                    <span className="relative flex size-[67px] items-center justify-center overflow-hidden rounded-[20px] border border-border/90 bg-muted/35 text-foreground/85 shadow-[0_8px_20px_-14px_rgba(0,0,0,0.5)]">
                      {plugin.iconUrl ? <img src={plugin.iconUrl} alt={plugin.iconAlt || ""} className={cx("size-full",plugin.iconFit==="cover"?"object-cover":"object-contain p-2.5")}/> : iconFor(matched ?? plugin,"size-7")}
                      <span className={cx("absolute bottom-1 right-1 size-2.5 rounded-full border-2 border-background",plugin.setupStatus==="connected"&&plugin.enabled?"bg-emerald-400":"bg-amber-400")}/>
                    </span>
                    <span className="w-full truncate text-[11px] font-medium text-foreground">{plugin.name}</span>
                    <span className="w-full truncate text-[9px] text-muted-foreground">{plugin.setupStatus==="connected"?"Connected":plugin.setupStatus==="unconfigured"?"Needs setup":plugin.setupStatus}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/85 bg-muted/10 p-5">
              <Plug className="size-5 shrink-0 text-muted-foreground"/>
              <div className="text-[11px] leading-relaxed text-muted-foreground">No plugins installed in this account yet. Explore the verified catalog below.</div>
            </div>
          )}
        </div>

        <div className="space-y-4 border-t border-border/65 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-[16px] font-semibold tracking-[-0.025em]">Discover plugins</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">Published plugin packages from configured, verified catalog sources.</p>
            </div>
            <span className="text-[11px] text-muted-foreground">{filtered.length} plugins</span>
          </div>
          <label className="relative block w-full max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
            <input type="search" aria-label="Search plugins" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
              placeholder="Search plugins and capabilities"
              className="h-11 w-full rounded-[14px] border border-border/85 bg-muted/15 pl-10 pr-3 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-violet-400/70 focus:ring-2 focus:ring-violet-400/15"/>
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter plugins by category">
            {categories.map(category=>(
              <button key={category} type="button" aria-pressed={activeCategory===category} onClick={()=>setActiveCategory(category)}
                className={cx("shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-colors",
                  activeCategory===category ? "border-foreground/80 bg-foreground font-medium text-background" :
                    "border-border/70 bg-background/45 text-muted-foreground hover:text-foreground")}>
                {category==="all"?"All plugins":category}
              </button>
            ))}
          </div>
          {catalogError ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.065] p-3 text-[11px] text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0"/>
              <span>{catalogError}</span>
            </div>
          ) : null}
          {loading && !catalog ? <div className="rounded-2xl border border-border/70 p-8 text-center text-[12px] text-muted-foreground">Loading verified plugin catalog…</div>
            : filtered.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map(plugin=>{
                  const state=stateFor(plugin);
                  return (
                    <button key={plugin.pluginKey} type="button" onClick={()=>{setSelectedKey(plugin.pluginKey);setActionError("");setNotice("");}}
                      aria-label={"Explore "+plugin.name}
                      className="group flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-border/75 bg-background/60 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-muted/20 hover:shadow-[0_14px_35px_-24px_rgba(0,0,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                      <div className="relative flex min-h-[124px] items-end overflow-hidden bg-gradient-to-br from-violet-400/[0.15] via-sky-400/[0.035] to-fuchsia-400/[0.11] p-4">
                        <div className="absolute -right-8 -top-10 size-40 rounded-full border border-violet-400/15 bg-violet-400/[0.065]"/>
                        <div className="relative flex w-full items-end justify-between gap-3">
                          <span className="flex size-14 items-center justify-center overflow-hidden rounded-[18px] border border-foreground/15 bg-background/75 text-violet-300 shadow-lg">
                            {plugin.iconUrl
                              ? <img src={plugin.iconUrl} alt="" loading="lazy" className="size-full object-contain p-1.5"/>
                              : iconFor(plugin,"size-7")}
                          </span>
                          <span className={cx("rounded-full border px-2 py-1 text-[10px] font-medium",stateClasses(state))}>{state}</span>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <p className="text-[13px] font-semibold tracking-[-0.02em] text-foreground">{plugin.name}</p>
                        <p className="line-clamp-2 min-h-[34px] text-[11px] leading-[1.6] text-muted-foreground">{plugin.subtitle || plugin.description}</p>
                        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/65 pt-3">
                          <span className="text-[10px] text-muted-foreground">{plugin.toolCount} tools · {plugin.skillCount} skills</span>
                          <span className="flex items-center gap-1 text-[11px] font-medium text-foreground/80">Explore <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5"/></span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-9 text-center text-[11px] text-muted-foreground">
                {catalog?.plugins.length ? "No plugins match these filters." : "No discoverable plugins available from configured catalogs."}
                {(searchTerm || activeCategory!=="all") ? <button type="button" onClick={()=>{setSearchTerm("");setActiveCategory("all");}} className="ml-2 underline underline-offset-4">Clear filters</button> : null}
              </div>
            )}
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Installing a plugin records it in this account. OAuth authorization, tool registration and verified connection health are separate requirements before tools can execute.
          </p>
        </div>
      </section>

      <SettingsSheet open={anySelected} title={name} description={selected?.subtitle}
        onClose={()=>{setSelectedKey(null);setActionError("");setNotice("");}}>
        {selected ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="flex size-[70px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-border/80 bg-gradient-to-br from-violet-400/20 to-sky-400/10 text-violet-300">
                {selectedCatalog?.iconUrl
                  ? <img src={selectedCatalog.iconUrl} alt="" className="size-full object-contain p-2"/>
                  : installed?.iconUrl
                    ? <img src={installed.iconUrl} alt={installed.iconAlt||""} className="size-full object-contain p-2"/>
                    : iconFor(selectedCatalog ?? installed ?? {name},"size-8")}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-[16px] font-semibold tracking-[-0.025em]">{name}</p>
                <p className="text-[11px] text-muted-foreground">{selectedCatalog?.publisher || installed?.providerKey || "Plugin provider"}</p>
                <span className={cx("inline-block rounded-full border px-2 py-0.5 text-[10px]",stateClasses(
                  selectedCatalog ? stateFor(selectedCatalog) : installed?.setupStatus==="connected"&&installed.enabled?"Connected":"Needs connection"))}>
                  {selectedCatalog ? stateFor(selectedCatalog) : installed?.setupStatus==="connected"&&installed.enabled?"Connected":"Needs connection"}
                </span>
              </div>
            </div>

            <p className="text-[12px] leading-[1.8] text-muted-foreground">{details}</p>

            {selectedCatalog?.examples.length ? (
              <div className="space-y-3">
                <p className="text-[12px] font-semibold">Ideas to try</p>
                <div className="space-y-2 rounded-[18px] border border-sky-300/25 bg-gradient-to-br from-sky-300/20 via-indigo-400/15 to-violet-400/15 p-3">
                  {selectedCatalog.examples.slice(0,3).map((prompt,index)=>(
                    <button key={index} type="button" onClick={()=>void copyText(prompt,"Example prompt")}
                      aria-label={"Copy example prompt "+(index+1)}
                      className="group flex w-full items-center gap-3 rounded-[14px] border border-white/10 bg-background/75 px-3.5 py-3.5 text-left transition-colors hover:bg-background/90">
                      <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground/90">{prompt}</span>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><Copy className="size-3.5"/></span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Copy an example to use in a host where this plugin is authorized.</p>
              </div>
            ) : null}

            {selectedCatalog?.capabilities.length || installed?.capabilities.length ? (
              <div className="space-y-2">
                <p className="text-[12px] font-semibold">Capabilities</p>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedCatalog?.capabilities || installed?.capabilities || []).map(capability=>(
                    <span key={capability} className="rounded-lg border border-border/80 bg-muted/20 px-2.5 py-1.5 text-[10px] text-foreground/80">{capability}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-border/80 px-3">
              {selectedCatalog ? <>
                <PreferenceRow label="Developer" description="Publisher of the plugin package." value={selectedCatalog.publisher}/>
                <PreferenceRow label="Version" description="Published plugin manifest version." value={selectedCatalog.version}/>
                <PreferenceRow label="Transport" description="Declared MCP transport protocol." value={selectedCatalog.transport}/>
                <PreferenceRow label="Permissions" description="Connection and authorization requirements." value="OAuth authorization required"/>
                <PreferenceRow label="Tools / skills" description="Capabilities declared by the published manifest." value={selectedCatalog.toolCount+" tools · "+selectedCatalog.skillCount+" skills"}/>
              </> : null}
              {installed ? <>
                <PreferenceRow label="Connection status" description="Recorded connection state for this account." value={installed.setupStatus}/>
                <PreferenceRow label="Health" description="Runtime-reported health status." value={installed.healthStatus}/>
                <PreferenceRow label="Tools registered" description="Actual executable tools registered for this installation." value={String(installed.toolCount)}/>
                <PreferenceRow label="Authentication" description="Required credential type." value={installed.authType}/>
                {!(installed.installationKey==="catalog-v1" && installed.setupStatus!=="connected") && host.setPluginEnabled ?
                  <PreferenceRow label="Enabled" description="Controls participation in the active runtime."
                    trailing={<Toggle enabled={installed.enabled} onChange={value=>void run(()=>host.setPluginEnabled!(installed.id,value))}/>} />
                  : null}
              </> : null}
            </div>

            {selectedCatalog ? (
              <div className="flex flex-wrap gap-2 text-[11px]">
                {([
                  ["Website",selectedCatalog.websiteUrl],
                  ["Privacy",selectedCatalog.privacyUrl],
                  ["Terms",selectedCatalog.termsUrl],
                  ["Support",selectedCatalog.supportUrl],
                ] as const).filter(item=>Boolean(item[1])).map(([label,url])=>
                  <a key={label} href={url || undefined} target="_blank" rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-muted-foreground hover:text-foreground">{label}<ExternalLink className="size-3"/></a>
                )}
              </div>
            ) : null}
            {actionError ? <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-[11px] text-red-300">{actionError}</div> : null}
            {notice ? <div role="status" className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-[11px] text-emerald-300">{notice}</div> : null}

            <div className="space-y-2 border-t border-border/70 pt-4">
              {selectedCatalog && !plugins.some(plugin=>plugin.pluginKey===selectedCatalog.pluginKey) && host.installPluginFromCatalog ? (
                <button type="button" disabled={busy} onClick={()=>void run(()=>host.installPluginFromCatalog!(selectedCatalog.pluginKey))}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[12px] font-semibold text-background disabled:opacity-40">
                  <Plus className="size-4"/> Add to Studio
                </button>
              ) : null}
              {selectedCatalog && plugins.some(plugin=>plugin.pluginKey===selectedCatalog.pluginKey && plugin.setupStatus!=="connected") ? (
                <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-amber-300">Installed · authorization required.</span> This plugin's MCP tools will not run in Studio until a supported OAuth connection and tool registration flow is completed.
                </div>
              ) : null}
              {installed?.setupUrl && host.beginPluginSetup ? (
                <button type="button" disabled={busy} onClick={()=>void run(()=>host.beginPluginSetup!(installed.id))}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[11px] font-semibold text-background disabled:opacity-40">
                  {installed.setupStatus==="connected"?"Reconnect":"Connect plugin"} <ArrowUpRight className="size-3.5"/>
                </button>
              ) : null}
              {selectedCatalog ? (
                <button type="button" onClick={()=>void copyText(selectedCatalog.endpointUrl,"MCP endpoint")}
                  className="h-10 w-full rounded-full border border-border px-4 text-[11px] font-medium hover:bg-muted">
                  <Copy className="mr-1.5 inline size-3.5"/> Copy MCP endpoint
                </button>
              ) : null}
              {installed?.installationKey==="catalog-v1" && host.removeCatalogPlugin ? (
                <button type="button" disabled={busy} onClick={()=>void run(async()=>{await host.removeCatalogPlugin!(installed.id);setSelectedKey(null);})}
                  className="h-9 w-full text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  Remove installation
                </button>
              ) : null}
              {installed?.disconnectUrl && installed.setupStatus==="connected" && host.disconnectPlugin ? (
                <button type="button" disabled={busy} onClick={()=>void run(()=>host.disconnectPlugin!(installed.id))}
                  className="h-9 w-full rounded-full border border-border px-4 text-[11px] text-muted-foreground hover:bg-muted">Disconnect</button>
              ) : null}
            </div>
          </div>
        ) : null}
      </SettingsSheet>
    </>
  );
}

function WidgetCustomizeView({
  widgets,
  host,
  onChanged,
}: {
  widgets: SettingsWidget[];
  host: SettingsHost;
  onChanged: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const selected = widgets.find((widget) => widget.id === selectedId) ?? null;
  const ready = widgets.filter((widget) => widget.availability !== "demo").length;
  const previewCount = widgets.length - ready;
  const categories = [
    { id: "all", label: "All widgets" },
    { id: "utility", label: "Utilities" },
    { id: "glance", label: "At a glance" },
    { id: "agent/runtime", label: "Agent & runtime" },
    { id: "navigation", label: "Navigation" },
    { id: "content", label: "Content" },
    { id: "weather", label: "Weather" },
  ];
  const filtered = useMemo(() => widgets.filter((widget) => {
    if (activeCategory !== "all" && widget.category !== activeCategory) return false;
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    return [widget.name, widget.description, widget.category || "", widget.ownerPackage || "", ...(widget.tags || [])]
      .some((value) => value.toLowerCase().includes(query));
  }), [widgets, activeCategory, searchTerm]);

  async function setVisible(visible: boolean) {
    if (!selected || selected.availability === "demo" || !host.setWidgetVisible) return;
    await host.setWidgetVisible(selected.id, visible);
    await onChanged();
  }

  const categoryLabel = (id: string | undefined) =>
    categories.find((category) => category.id === id)?.label ?? "Widget";

  return (
    <>
      <section className="space-y-6 pb-8">
        <div className="relative overflow-hidden rounded-[22px] border border-border/70 bg-gradient-to-br from-muted/50 via-background to-violet-500/[0.055] p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-violet-500/[0.085] blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Boxes className="size-3.5 text-violet-400" /> Workbench collection
              </div>
              <h2 className="text-[24px] font-semibold tracking-[-0.045em] sm:text-[28px]">Your widget library</h2>
              <p className="mt-2 max-w-lg text-[12px] leading-[1.7] text-muted-foreground">
                Explore the original widget concepts, inspect their designs and enable widgets as they become real, portable capabilities.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start rounded-full border border-border/80 bg-background/65 px-3 py-2 text-[10px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span><strong className="font-semibold text-foreground">{ready}</strong> ready</span>
              <span className="mx-0.5 text-foreground/15">/</span>
              <span><strong className="font-semibold text-foreground">{previewCount}</strong> concepts</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="relative block w-full sm:max-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                aria-label="Search widgets"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search widgets or capabilities"
                className="h-10 w-full rounded-xl border border-border/80 bg-background/70 pl-10 pr-3 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-violet-400/70 focus:ring-2 focus:ring-violet-400/10"
              />
            </label>
            <span className="text-[11px] text-muted-foreground">{filtered.length} of {widgets.length} widgets</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter widgets by category">
            {categories.filter((category) => category.id === "all" || widgets.some((widget) => widget.category === category.id)).map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
                className={cx(
                  "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
                  activeCategory === category.id
                    ? "border-foreground/80 bg-foreground text-background"
                    : "border-border/75 bg-background/40 text-muted-foreground hover:border-foreground/25 hover:text-foreground"
                )}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((widget) => {
              const demo = widget.availability === "demo";
              return (
                <button
                  type="button"
                  key={widget.id}
                  onClick={() => setSelectedId(widget.id)}
                  className="group min-w-0 overflow-hidden rounded-[19px] border border-border/75 bg-background/65 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-muted/20 hover:shadow-[0_14px_38px_-22px_rgba(0,0,0,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  aria-label={`Preview ${widget.name}${demo ? " concept" : " widget"}`}
                >
                  <div className="relative h-[158px] overflow-hidden border-b border-border/60 bg-gradient-to-br from-muted/50 via-muted/20 to-violet-400/[0.075] px-5 py-4">
                    <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-violet-400/[0.07] blur-2xl" />
                    <div className="relative h-full"><WidgetGalleryPreview id={widget.id} /></div>
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold tracking-[-0.015em] text-foreground">{widget.name}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{categoryLabel(widget.category)}</p>
                      </div>
                      <span className={cx(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium",
                        demo ? "border-border bg-muted/45 text-muted-foreground" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                      )}>
                        {demo ? "Concept" : "Ready"}
                      </span>
                    </div>
                    <p className="line-clamp-2 min-h-[31px] text-[10px] leading-[1.55] text-muted-foreground">{widget.description}</p>
                    <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
                      <span className="text-[10px] text-muted-foreground">{demo ? "Sample preview" : widget.visible ? "Visible in Utilities" : "Hidden in Utilities"}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-foreground/80">
                        Explore <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Search className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-3 text-[12px] font-medium">No widgets match your search.</p>
            <button type="button" className="mt-2 text-[11px] text-muted-foreground underline underline-offset-4" onClick={() => {setSearchTerm("");setActiveCategory("all");}}>Clear filters</button>
          </div>
        )}
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Concept previews use sample artwork/data and do not connect to, control, or represent live AgentSam systems. They become installable after their package adapters and safety checks are completed.
        </p>
      </section>

      <SettingsSheet
        open={Boolean(selected)}
        title={selected?.name || "Widget"}
        description={selected?.description}
        onClose={() => setSelectedId(null)}
      >
        {selected ? (
          <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-muted/45 to-violet-400/[0.06] p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Design preview</span>
                <span className="rounded-full border border-border bg-background/75 px-2 py-0.5 text-[9px] text-muted-foreground">
                  {selected.availability === "demo" ? "Concept · sample data" : "Packaged widget"}
                </span>
              </div>
              <div className="mx-auto h-40 max-w-sm"><WidgetGalleryPreview id={selected.id} /></div>
            </div>
            <div className="rounded-lg border border-border/70 px-3">
              <PreferenceRow label="Status" description="Availability of this widget implementation." value={selected.availability === "demo" ? "Design concept · not yet installed" : "Ready to use"} />
              <PreferenceRow label="Category" description="Widget library grouping." value={categoryLabel(selected.category)} />
              {selected.ownerPackage ? <PreferenceRow label="Proposed owner" description="Target package authority for this widget." value={selected.ownerPackage} /> : null}
              <PreferenceRow label="Sizes" description="Supported presentation sizes." value={selected.sizes.join(", ")} />
              {selected.availability !== "demo" ? (
                <>
                  <PreferenceRow label="Preference scope" description="Where the current visibility choice is stored." value={selected.preferenceScope} />
                  <PreferenceRow
                    label="Visible"
                    description="Show this widget in the Utilities surface."
                    trailing={<Toggle enabled={selected.visible} onChange={(value) => void setVisible(value)} />}
                  />
                </>
              ) : (
                <p className="py-3 text-[11px] leading-relaxed text-muted-foreground">
                  Preview only. This design will be enabled once its renderer, source adapter, and permissions are connected to a real package. No demo controls will mutate production data.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
              {selected.availability !== "demo" && host.openWidget ? (
                <button type="button" onClick={() => host.openWidget?.(selected.id)} className="h-9 rounded-lg bg-foreground px-4 text-[11px] font-medium text-background">Open widget</button>
              ) : null}
              {selected.availability !== "demo" && host.setWidgetVisible ? (
                <button type="button" onClick={() => void setVisible(!selected.visible)} className="h-9 rounded-lg border border-border px-4 text-[11px] hover:bg-muted">{selected.visible ? "Hide widget" : "Show widget"}</button>
              ) : null}
              <button type="button" onClick={() => setSelectedId(null)} className="h-9 rounded-lg border border-border px-4 text-[11px] text-muted-foreground hover:bg-muted">Close preview</button>
            </div>
          </div>
        ) : null}
      </SettingsSheet>
    </>
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
  if (!models.length) return <EmptyState title="No runnable models yet." />;

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
              <div className="flex items-center gap-1.5 text-[12px] font-medium">
                <span className="truncate">{model.name}</span>
                {model.selected ? (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Selected
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground sm:hidden">
                {model.provider} · {model.source || model.tier}
              </div>
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-[11px] text-muted-foreground">{model.provider}</div>
              {model.source ? <div className="truncate text-[9px] text-muted-foreground/70">{model.source}</div> : null}
            </div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">{model.tier}</div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">{model.context}</div>
            <StatusPill status={model.status} label={model.enabled ? "Runnable" : "Other"} />
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
                defaultValue={owner === "you" ? "Dev machine · CLI" : "Local Studio prod"}
                className="h-9 w-full rounded-md border border-border bg-muted/25 px-3 text-[11px] outline-none focus:border-foreground/30"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium">Project</span>
              <select className="h-9 w-full rounded-md border border-border bg-muted/25 px-3 text-[11px] outline-none">
                <option>Current project</option>
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

function ThemesView({ themes, host, onChanged }: { themes: SettingsTheme[]; host: SettingsHost; onChanged: () => void }) {
  return <><AppearancePreferences /><SettingsThemeGallery themes={themes} host={host} onChanged={onChanged} /></>;
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
      {!snapshot.agents.length ? (
        <EmptyState title="No configured agents yet." />
      ) : (
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
      )}
    </Section>
  );
}

function CustomizeView({
  snapshot,
  view,
  host,
  onChanged,
}: {
  snapshot: SettingsSnapshot;
  view: string;
  host: SettingsHost;
  onChanged: () => Promise<void>;
}) {
  if (view === "plugins") {
    return <PluginCustomizeView plugins={snapshot.plugins} host={host} onChanged={onChanged} />;
  }
  if (view === "widgets") {
    return <WidgetCustomizeView widgets={snapshot.widgets} host={host} onChanged={onChanged} />;
  }

  const map: Record<SettingsCatalogKind, SettingsCatalogItem[]> = {
    plugins: snapshot.plugins,
    mcps: snapshot.mcps,
    skills: snapshot.skills,
    subagents: snapshot.subagents,
    rules: snapshot.rules,
    commands: snapshot.commands,
    hooks: snapshot.hooks,
  };
  const labels: Record<SettingsCatalogKind, string> = {
    plugins: "Plugins",
    mcps: "MCP servers",
    skills: "Skills",
    subagents: "Subagents",
    rules: "Rules",
    commands: "Commands",
    hooks: "Hooks",
  };
  const kind = (view in map ? view : "plugins") as SettingsCatalogKind;
  const canWrite = Boolean(host.upsertCatalogItem);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<{
    id: string;
    name: string;
    subtitle: string;
    meta: string;
    status: HealthState;
  }>({ id: "", name: "", subtitle: "", meta: "", status: "unknown" });

  function openAdd() {
    setDraft({ id: "", name: "", subtitle: "", meta: "", status: "unknown" });
    setSheetOpen(true);
  }

  function openEdit(item: SettingsCatalogItem) {
    setDraft({
      id: item.id,
      name: item.name,
      subtitle: item.subtitle,
      meta: item.meta ?? "",
      status: item.status,
    });
    setSheetOpen(true);
  }

  async function save() {
    if (!host.upsertCatalogItem) return;
    const name = draft.name.trim();
    if (!name) return;
    const id = draft.id || `${kind}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
    await host.upsertCatalogItem(kind, {
      id,
      name,
      subtitle: draft.subtitle.trim() || "Configured in Local Studio",
      meta: draft.meta.trim() || undefined,
      status: draft.status,
    });
    await onChanged();
    setSheetOpen(false);
  }

  async function remove() {
    if (!draft.id || !host.removeCatalogItem) return;
    await host.removeCatalogItem(kind, draft.id);
    await onChanged();
    setSheetOpen(false);
  }

  const singular = labels[kind].replace(/s$/, "");

  return (
    <>
      <Section
        title={labels[kind]}
        description="One extension surface with normalized status and configuration behavior."
        action={
          <button
            type="button"
            onClick={openAdd}
            disabled={!canWrite}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            Add
          </button>
        }
      >
        <Catalog items={map[kind]} onSelect={canWrite ? openEdit : undefined} />
      </Section>

      <SettingsSheet
        open={sheetOpen}
        title={draft.id ? `Edit ${singular}` : `Add ${singular}`}
        description="Saved through the Settings host so each product can provide its own persistence adapter."
        onClose={() => setSheetOpen(false)}
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium">Name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className="h-9 w-full rounded-md border border-border bg-muted/20 px-3 text-[12px] outline-none focus:border-foreground/30"
              placeholder={`New ${singular.toLowerCase()}`}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium">Description</span>
            <input
              value={draft.subtitle}
              onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))}
              className="h-9 w-full rounded-md border border-border bg-muted/20 px-3 text-[12px] outline-none focus:border-foreground/30"
              placeholder="What this extension does"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium">Metadata</span>
            <input
              value={draft.meta}
              onChange={(event) => setDraft((current) => ({ ...current, meta: event.target.value }))}
              className="h-9 w-full rounded-md border border-border bg-muted/20 px-3 text-[12px] outline-none focus:border-foreground/30"
              placeholder="Package, endpoint, command, or source"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium">Status</span>
            <select
              value={draft.status}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as HealthState }))}
              className="h-9 w-full rounded-md border border-border bg-muted/20 px-3 text-[12px] outline-none focus:border-foreground/30"
            >
              <option value="unknown">Unknown</option>
              <option value="healthy">Healthy</option>
              <option value="attention">Attention</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>

          <div className="flex items-center justify-between border-t border-border/70 pt-4">
            <div>
              {draft.id && host.removeCatalogItem ? (
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="h-8 rounded-md px-2.5 text-[10px] text-red-300 hover:bg-red-500/10"
                >
                  Delete
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="h-8 rounded-md border border-border px-3 text-[10px] text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!draft.name.trim()}
                className="h-8 rounded-md bg-foreground px-3 text-[10px] font-medium text-background disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </SettingsSheet>
    </>
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

const SHELL_APPEARANCE_STORAGE_ID = "agentsam-shell-appearance-v1";
const SHELL_ACCENTS = [
  { id: "#8B5CF6", label: "Violet" },
  { id: "#2563EB", label: "Blue" },
  { id: "#0D9488", label: "Teal" },
  { id: "#BE185D", label: "Rose" },
] as const;


export type ShellAppearancePreference = {
  theme: "dark" | "light" | "system";
  accent: string;
};

export function readShellAppearancePreference(
  storage?: Pick<Storage, "getItem">,
): ShellAppearancePreference | null {
  const source =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!source) return null;
  try {
    const value = source.getItem(SHELL_APPEARANCE_STORAGE_ID);
    if (!value) return null;
    const raw = JSON.parse(value) as Partial<ShellAppearancePreference>;
    if (raw.theme !== "dark" && raw.theme !== "light" && raw.theme !== "system") return null;
    if (typeof raw.accent !== "string" || !/^#[0-9a-f]{6}$/i.test(raw.accent)) return null;
    return { theme: raw.theme, accent: raw.accent };
  } catch {
    return null;
  }
}

function AppearancePreferences() {
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [accent, setAccent] = useState<string>(SHELL_ACCENTS[1].id);

  useEffect(() => {
    const saved = readShellAppearancePreference();
    if (!saved) return;
    setTheme(saved.theme);
    setAccent(saved.accent);
  }, []);

  function commit(nextTheme: typeof theme, nextAccent: string) {
    setTheme(nextTheme);
    setAccent(nextAccent);
    localStorage.setItem(SHELL_APPEARANCE_STORAGE_ID, JSON.stringify({ theme: nextTheme, accent: nextAccent }));
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
          <PreferenceRow label="Dev machine · CLI" description="Native CLI authorization." value="18 min ago" />
          <PreferenceRow label="Revoke other sessions" description="Keep the current session and invalidate the rest." value="Review" />
        </div>
      </Section>
    );
  }

  return (
    <Section title="Security audit" description="Credential events should be attributable without logging plaintext values.">
      <div className="divide-y divide-border/60 rounded-lg border border-border/70">
        {[
          ["API key used", "Dev machine · CLI", "2 min ago"],
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

function renderUnit(
  unit: SettingsUnitId,
  snapshot: SettingsSnapshot,
  view: string,
  host: SettingsHost,
  onChanged: () => Promise<void>,
) {
  switch (unit) {
    case "general":
      return <GeneralView snapshot={snapshot} />;
    case "agents":
      return <AgentsView snapshot={snapshot} view={view} />;
    case "customize":
      return <CustomizeView snapshot={snapshot} view={view} host={host} onChanged={onChanged} />;
    case "design":
      return <DesignView />;
    case "git-prs":
      return <GitView snapshot={snapshot} />;
    case "codebase":
      return <CodebaseView snapshot={snapshot} />;
    case "network":
      return <NetworkView snapshot={snapshot} />;
    case "themes":
      return <ThemesView themes={snapshot.themes} host={host} onChanged={onChanged} />;
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
    const refresh = () => {
      void host.snapshot().then((next) => {
        if (!cancelled) setSnapshot(next);
      });
    };
    refresh();
    const unsubscribe = host.subscribe?.(unitId, refresh);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [host, unitId]);

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
          {renderUnit(unit.id, snapshot, validView, host, async () => {
            setSnapshot(await host.snapshot());
          })}
        </div>
      </div>
    </div>
  );
}

