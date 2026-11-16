import "./agent-profiles.css";
import { useShellAppearance } from "../appearance";
import { SettingsBillingPanel } from "./billing";
import { SettingsAccountPanel } from "./account";
import { SettingsDesignSpecSheet } from "./design-spec";
import { SettingsStoragePanel } from "./storage";
export { SettingsBillingPanel } from "./billing";
import { SettingsThemeGallery } from "./themes";
import { WidgetGalleryPreview } from "./WidgetGalleryPreview";
import { CatalogRegistryView, type CatalogRegistryKind } from "./catalog-registry";
import { BuiltinWidget } from "@inneranimalmedia/agentsam-workbench/widgets";
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
  ChevronLeft,
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
  FolderOpen,
  GitPullRequest,
  Globe2,
  HardDrive,
  Image as ImageIcon,
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
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  HealthState,
  SettingsCatalogItem,
  SettingsCatalogKind,
  SettingsCredential,
  SettingsHost,
  SettingsAgent,
  SettingsAgentDraft,
  SettingsAgentPolicy,
  SettingsGeneralPreferences,
  SettingsManifest,
  SettingsModel,
  SettingsNotificationChannels,
  SettingsNotificationProfile,
  SettingsPlugin,
  SettingsDiscoveredPlugin,
  SettingsPluginDiscovery,
  SettingsPluginRepository,
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

/** Verified, same-origin catalog SVG, tinted by CSS currentColor for every host theme. */
function PublisherMark({url,className = "size-4"}: {url?: string | null; className?: string}) {
  if (!url) return null;
  const mask = `url("${url}")`;
  return <span role="img" aria-label="Plugin publisher mark" className={cx("inline-block shrink-0 bg-current",className)}
    style={{WebkitMaskImage:mask,maskImage:mask,WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",
      WebkitMaskPosition:"center",maskPosition:"center",WebkitMaskSize:"contain",maskSize:"contain"}}/>;
}

function statusTone(status: HealthState | SettingsCredential["status"]) {
  if (status === "healthy" || status === "active") {
    return "border-emerald-500/20 bg-emerald-500/8 text-[var(--settings-success-ink)]";
  }
  if (status === "attention" || status === "expired") {
    return "border-amber-500/20 bg-amber-500/8 text-[var(--settings-warning-ink)]";
  }
  if (status === "blocked" || status === "revoked") {
    return "border-red-500/20 bg-red-500/8 text-[var(--settings-danger-ink)]";
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

/** Portable icon help: hover and keyboard-focus visible, independent of host tooltip providers. */
function Tooltip({text,children}:{text:string;children:ReactNode}) {
  return <span className="group relative inline-flex">
    {children}
    <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-[300] mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-foreground shadow-lg group-hover:block group-focus-within:block">
      {text}
    </span>
  </span>;
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
  /** Optional status supplied by the host product. */
  railStatus?: { title: string; detail: string };
  /** Compact breadcrumb root supplied by the host product. */
  rootLabel?: string;
  /** Returns to the host product without coupling Settings to a router. */
  onExit?: () => void;
}) {
  const {theme:settingsTheme} = useShellAppearance();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeLabel = manifest.units.find((unit) => unit.id === activeUnit)?.label ?? "Settings";
  const status = railStatus ?? {
    title: activeUnit === "keys" ? "Account vault" : manifest.productName,
    detail:
      activeUnit === "keys"
        ? "Manage your saved credentials."
        : "Manage your account and preferences.",
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
    <div style={{'--settings-warning-ink':settingsTheme === 'light' ? '#8a5a00' : '#fcd34d','--settings-success-ink':settingsTheme === 'light' ? '#11643f' : '#6ee7b7','--settings-danger-ink':settingsTheme === 'light' ? '#b42323' : '#fca5a5'} as React.CSSProperties} className="flex h-full min-h-0 w-full bg-background text-foreground max-md:[&_button]:min-h-11">
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
          <Tooltip text="Open settings navigation">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-violet-400 md:hidden"
            aria-label="Open settings navigation"
          >
            <Menu className="size-3.5" />
          </button>
          </Tooltip>
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
              <Tooltip text="Close settings navigation">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-violet-400"
                aria-label="Close settings navigation"
              >
                <X className="size-4" />
              </button>
              </Tooltip>
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
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const previousFocus = useRef<HTMLElement|null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )].filter(element=>element.getClientRects().length>0);
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length-1];
      if(event.shiftKey && (document.activeElement===first || !panelRef.current.contains(document.activeElement))){
        event.preventDefault();last.focus();
      }else if(!event.shiftKey && (document.activeElement===last || !panelRef.current.contains(document.activeElement))){
        event.preventDefault();first.focus();
      }
    };
    document.addEventListener("keydown",onKeyDown);
    return () => {
      document.removeEventListener("keydown",onKeyDown);
      previousFocus.current?.focus();
    };
  },[open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[250]">
      <div
        role="presentation"
        aria-hidden="true"
        onPointerDown={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="absolute inset-0 flex h-[100dvh] flex-col overflow-hidden bg-background shadow-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[min(88dvh,860px)] md:w-[min(720px,calc(100vw-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-border"
      >
        <header className="z-10 flex shrink-0 items-start justify-between gap-4 border-b border-border/70 bg-background px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>}
          </div>
          <Tooltip text="Close dialog (Esc)">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 md:size-9"
            aria-label="Close dialog"
            title="Close dialog (Esc)"
          >
            <X className="size-4" />
          </button>
          </Tooltip>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6">{children}</div>
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
     round hover:bg-muted hover:text-foreground"
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


/** Plugin detail lives in the Settings content area, not a second drawer over the workspace. */
function PluginDetailPage({open,title,description,onBack,children,agentProfile=false}:{
  open:boolean; title:string; description?:string; onBack:()=>void; children:ReactNode; agentProfile?:boolean;
}) {
  const pageRef=useRef<HTMLElement>(null);
  useEffect(()=>{if(open)pageRef.current?.focus();},[open]);
  if (!open) return null;
  return <section ref={pageRef} tabIndex={-1} aria-label={(agentProfile ? "Agent profile: " : "Plugin details: ") + title}
    className={cx("mx-auto w-full max-w-3xl space-y-6 pb-12", agentProfile && "agent-profiles")}>
    <div className={agentProfile ? "agent-profile-lead space-y-3" : "space-y-6"}>
      <nav aria-label={agentProfile ? "Agent profile navigation" : "Plugin breadcrumb"} className="flex items-center gap-2 text-[12px] text-muted-foreground">
        {agentProfile
          ? <button type="button" onClick={onBack} aria-label="Back to agents" className="agent-profile-back"><ChevronLeft className="size-5"/></button>
          : <button type="button" onClick={onBack} className="min-h-9 rounded-lg px-2 transition hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30">Plugins</button>}
        {!agentProfile && <ChevronRight className="size-3.5"/>}
        <span className="truncate text-foreground">{agentProfile ? "Agents" : title}</span>
      </nav>
      <header className={agentProfile ? "space-y-2" : "border-b border-border/65 pb-4"}>
        <h2 className={cx("font-semibold tracking-[-0.03em] text-foreground", agentProfile ? "text-[31px]" : "text-[21px]")}>{title}</h2>
        {description ? <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{description}</p>:null}
      </header>
    </div>
    {children}
  </section>;
}

/**
 * Installed state comes exclusively from SettingsSnapshot/plugins (the host's
 * real registry). Discoverable entries come from an operator-configured,
 * manifest-driven catalog. Neither a discovery card nor D1 installation is
 * proof of a connected, executable tool.
 */
function PluginCustomizeView({
  plugins,
  pluginsError,
  host,
  onChanged,
}: {
  plugins: SettingsPlugin[];
  pluginsError?: string | null;
  host: SettingsHost;
  onChanged: () => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<SettingsPluginDiscovery | null>(null);
  const [loading, setLoading] = useState(Boolean(host.discoverPlugins));
  const [catalogError, setCatalogError] = useState("");
  const [focusedPluginId,setFocusedPluginId] = useState<string | null>(null);
  const [workspace,setWorkspace] = useState<{pluginKey:string;contextTool:string;result:unknown}|null>(null);
  const [workspaceError,setWorkspaceError] = useState("");
  const [workspaceBusy,setWorkspaceBusy] = useState(false);
  const [gitRepositories,setGitRepositories] = useState<SettingsPluginRepository[] | null>(null);
  const [gitRepositoriesError,setGitRepositoriesError] = useState("");
  const [gitRepositoriesBusy,setGitRepositoriesBusy] = useState(false);
  const [gitRepositoriesHasMore,setGitRepositoriesHasMore] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const key = new URLSearchParams(window.location.search).get("plugin");
    return key && /^[a-z0-9][a-z0-9_.-]{1,100}$/i.test(key) ? key : null;
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [directoryTab, setDirectoryTab] = useState<"public" | "personal">("public");
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
  const platformDefaults = useMemo(() => {
    const needle=searchTerm.trim().toLowerCase();
    return (catalog?.platformPlugins||[]).filter(plugin=>
      !needle || [plugin.name,plugin.pluginKey,plugin.kind,plugin.category,plugin.description,
        plugin.provider,...plugin.capabilities].some(text=>text.toLowerCase().includes(needle))
    );
  },[catalog,searchTerm]);
  const filteredInstalled = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return plugins.filter(plugin => !needle || [
      plugin.name, plugin.subtitle, plugin.providerKey, plugin.pluginKey, ...plugin.capabilities,
    ].some(value => value.toLowerCase().includes(needle)));
  }, [plugins, searchTerm]);
  const selectPlugin = (key: string) => {
    setSelectedKey(key);
    setGitRepositories(null);
    setGitRepositoriesError("");
    setGitRepositoriesHasMore(false);
    setActionError("");
    setNotice("");
  };
  async function readGitRepositories(pluginId: string) {
    setGitRepositoriesBusy(true);
    setGitRepositoriesError("");
    try {
      if (!host.listPluginRepositories) throw new Error("GitHub repository browsing is not available on this host.");
      const result=await host.listPluginRepositories(pluginId);
      setGitRepositories(result.repositories);
      setGitRepositoriesHasMore(result.hasMore);
    } catch (error) {
      setGitRepositories(null);
      setGitRepositoriesError(error instanceof Error ? error.message : "Unable to access your GitHub repositories.");
    } finally {
      setGitRepositoriesBusy(false);
    }
  }

  async function openWorkspace(id:string) {
    setSelectedKey(null);
    setFocusedPluginId(id);
    setWorkspace(null);
    setWorkspaceBusy(true);
    setWorkspaceError("");
    try {
      if(!host.readPluginWorkspace)throw new Error("Plugin workspace is unavailable on this host.");
      setWorkspace(await host.readPluginWorkspace(id));
    }catch(error){
      setWorkspaceError(error instanceof Error?error.message:"Unable to read the connected workspace.");
    }finally{
      setWorkspaceBusy(false);
    }
  }

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
        setCatalogError("No external plugin directory is configured. Platform definitions remain available below.");
      }
    } catch {
      setCatalogError("External plugin discovery is unavailable. Existing account installations are unchanged.");
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

  // Native/API OAuth connectors use provider-backed operations, not MCP tool rows.
  // Only remote catalog MCP products require tool registration to be considered runnable.
  const isRunnable = (row: SettingsPlugin | null | undefined) => Boolean(
    row?.setupStatus === "connected" && row.enabled && row.toolCount > 0 && row.healthStatus === "healthy"
  );
  const isConnected = (row: SettingsPlugin | null | undefined) => Boolean(
    row?.setupStatus === "connected" && row.enabled && row.healthStatus === "healthy" &&
    (row.installationKey !== "catalog-v1" || row.toolCount > 0)
  );
  const installedState = (row: SettingsPlugin) => isConnected(row)
    ? "Connected" : row.setupStatus === "connected" && row.installationKey === "catalog-v1"
      ? "Verify tools" : row.setupStatus === "connected" ? "Check connection" : "Needs connection";
  const stateFor = (entry: SettingsDiscoveredPlugin) => {
    const row = plugins.find(plugin=>plugin.pluginKey === entry.pluginKey);
    return row ? installedState(row) : entry.installationId ? "Needs connection" : "Available";
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
      : "border-amber-400/25 bg-amber-400/10 text-[var(--settings-warning-ink)]";
  const anySelected = Boolean(selected);

  const focusedPlugin=plugins.find(item=>item.id===focusedPluginId);
  if(focusedPlugin) {
    const result=workspace?.result;
    const envelope=result && typeof result==="object" && !Array.isArray(result)
      ? result as Record<string,unknown>:null;
    const data=envelope?.data && typeof envelope.data==="object"
      ? envelope.data as Record<string,unknown>:envelope;
    const brandContract=data?.latestContract && typeof data.latestContract==="object"
      ? data.latestContract as Record<string,unknown>:null;
    const briefs=Array.isArray(data?.briefs)?data.briefs:[];
    const concepts=Array.isArray(data?.concepts)?data.concepts:[];
    const isBrand=workspace?.pluginKey==="agentsam-brand" || focusedPlugin.pluginKey==="agentsam-brand";
    return (
      <section className="space-y-5 pb-8" aria-label={focusedPlugin.name+" workspace"}>
        <button type="button" onClick={()=>{setFocusedPluginId(null);setWorkspace(null);}}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-[12px] text-muted-foreground hover:bg-muted/25 hover:text-foreground">
          <ChevronRight className="size-4 rotate-180"/> Back to plugins
        </button>
        <header className="flex items-start gap-3 border-b border-border/70 pb-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-muted/25">
            {focusedPlugin.iconUrl ? <img src={focusedPlugin.iconUrl} alt="" className="size-10 object-contain"/> : iconFor(focusedPlugin)}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">{isBrand?"Brand workspace":"Campaign workspace"}</h2>
            <p className="text-[12px] text-muted-foreground">
              {isBrand?"Approved brand identity, supporting evidence and saved contract.":"Briefs, campaign concepts and plans for this authorized workspace."}
            </p>
            <span className="mt-2 inline-block text-[10px] text-[var(--settings-success-ink)]">Connected · {focusedPlugin.toolCount} registered tools</span>
          </div>
          <button type="button" disabled={workspaceBusy} onClick={()=>void openWorkspace(focusedPlugin.id)}
            className="ml-auto rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground" aria-label="Refresh workspace">
            <RefreshCw className={cx("size-4",workspaceBusy&&"animate-spin")}/>
          </button>
        </header>
        {workspaceBusy ? <p className="text-[12px] text-muted-foreground">Reading your authorized plugin workspace…</p> : null}
        {workspaceError ? <p role="alert" className="rounded-xl border border-amber-500/30 p-4 text-[12px] text-[var(--settings-warning-ink)]">
          {workspaceError}. Reconnect the plugin or verify the registered context tool.
        </p> : null}
        {workspace && !workspaceError ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-xl border border-border/70 bg-muted/15 p-4">
                <p className="text-[11px] text-muted-foreground">Workspace</p>
                <p className="mt-1 break-all text-[12px] font-medium">{String(data?.workspaceId||(data?.workspace as Record<string,unknown>|undefined)?.display_name||"Account workspace")}</p>
              </article>
              <article className="rounded-xl border border-border/70 bg-muted/15 p-4">
                <p className="text-[11px] text-muted-foreground">{isBrand?"Saved contract":"Saved briefs"}</p>
                <p className="mt-1 text-lg font-semibold">{isBrand?(brandContract?"1":"0"):briefs.length}</p>
              </article>
              <article className="rounded-xl border border-border/70 bg-muted/15 p-4">
                <p className="text-[11px] text-muted-foreground">{isBrand?"Connected sources":"Concepts"}</p>
                <p className="mt-1 text-lg font-semibold">{isBrand?(Array.isArray(data?.connections)?data.connections.length:0):concepts.length}</p>
              </article>
            </div>
            {isBrand ? (
              <article className="rounded-xl border border-border/70 p-4">
                <h3 className="text-[14px] font-semibold">Brand identity and contract</h3>
                {brandContract ? (
                  <>
                    <p className="mt-1 text-[11px] text-muted-foreground">Your latest saved BrandContract · status: {String(brandContract.status||"unknown")}</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                        <p className="text-[10px] text-muted-foreground">Contract version</p>
                        <p className="mt-1 text-[12px] font-medium">{String(brandContract.schema_version||"Unspecified")}</p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                        <p className="text-[10px] text-muted-foreground">Last updated</p>
                        <p className="mt-1 text-[12px] font-medium">{String(brandContract.updated_at||"Unknown")}</p>
                      </div>
                    </div>
                    <details className="mt-4 rounded-lg border border-border/70 bg-muted/10 p-3">
                      <summary className="cursor-pointer text-[12px] font-medium">Inspect saved contract and evidence</summary>
                      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">{JSON.stringify(brandContract,null,2)}</pre>
                    </details>
                  </>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed border-border p-5 text-[12px] text-muted-fort app routes remain available where provided.":"Use the connected plugin flow when supported. A definition alone cannot authorize a connection."}</p>
                      {plugin.category==='entertainment' && plugin.provider==='inneranimalmedia' &&
                        ['inneranimalmedia-meauxgames','inneranimalmedia-wizard-chess-3d'].includes(plugin.pluginKey) &&
                        !plugin.installed && host.installPluginFromCatalog ? (
                          <button type="button" disabled={busy} onClick={()=>void run(()=>host.installPluginFromCatalog!(plugin.pluginKey))}
                            className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted/25 disabled:opacity-50">
                            Install {plugin.name}
                          </button>
                        ):null}
                    </div>
                  </details>)}
                </div>:<p className="text-[11px] text-muted-foreground">{catalog?"No platform capabilities match this search.":"Loading registered platform capabilities…"}</p>}
              </section>
              <p className="text-[11px] leading-5 text-muted-foreground">Installing a catalog plugin records it in this account. OAuth authorization, tool registration and verified connection health are separate requirements before MCP tools can execute.</p>
            </div>
          ) : (
            <div role="tabpanel" className="space-y-3">
              <div>
                <h3 className="text-[15px] font-semibold">Your plugins</h3>
                <p className="mt-1 text-[11px] text-muted-foreground">Manage your existing connections and installed integrations.</p>
              </div>
              {filteredInstalled.length ? (
                <div className="divide-y divide-border/60 rounded-xl border border-border/70">
                  {filteredInstalled.map(plugin=>(
                    <button type="button" key={plugin.id} onClick={()=>selectPlugin(plugin.id)}
                      className="flex min-h-[72px] w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/25">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] border border-border/80 bg-muted/20">
                        {plugin.iconUrl ? <img src={plugin.iconUrl} alt="" className="size-8 object-contain"/> : iconFor(plugin,"size-5")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{plugin.name}</span>
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">{plugin.subtitle}</span>
                      </span>
                      <span className="hidden text-[11px] text-muted-foreground sm:inline">{installedState(plugin)}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground"/>
                    </button>
                  ))}
                </div>
              ) : <p className="rounded-xl border border-dashed border-border p-7 text-[12px] text-muted-foreground">
                {pluginsError || (plugins.length ? "No installed plugins match your search." : "No plugins installed in this account yet.")}
              </p>}
            </div>
          )}
        </section>
      </section> : null}

      <PluginDetailPage open={anySelected} title={name} description={selected?.subtitle}
        onBack={()=>{setSelectedKey(null);setActionError("");setNotice("");}}>
        {selected ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-border/80 bg-muted/25 text-foreground">
                {selectedCatalog?.iconUrl
                  ? <img src={selectedCatalog.iconUrl} alt="" className="size-full object-contain p-2"/>
                  : installed?.iconUrl
                    ? <img src={installed.iconUrl} alt={installed.iconAlt||""} className="size-full object-contain p-2"/>
                    : iconFor(selectedCatalog ?? installed ?? {name},"size-8")}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-[16px] font-semibold tracking-[-0.025em]">{name}</p>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <PublisherMark url={selectedCatalog?.publisherIconUrl} className="size-3 text-foreground"/>
                  {selectedCatalog?.publisher || installed?.providerKey || "Plugin provider"}</p>
                <span className={cx("inline-block rounded-full border px-2 py-0.5 text-[10px]",stateClasses(
                  selectedCatalog ? stateFor(selectedCatalog) : installed ? installedState(installed) : "Available"))}>
                  {selectedCatalog ? stateFor(selectedCatalog) : installed ? installedState(installed) : "Available"}
                </span>
              </div>
            </div>

            <p className="text-[12px] leading-[1.8] text-muted-foreground">{details}</p>

            {selectedCatalog?.toolPermissions?.length ? (
              <section className="space-y-2" aria-label="Published tool permissions">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold">Published MCP tools</p>
                  <span className="text-[10px] text-muted-foreground">{selectedCatalog.toolPermissions.length} declared · {installed?.toolCount || 0} registered</span>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">These tools and permissions come from the verified catalog. They are not executable until OAuth and runtime verification succeeds.</p>
                <div className="space-y-1.5">
                  {selectedCatalog.toolPermissions.map(tool=>(
                    <div key={tool.id} className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 text-[11px] font-medium text-foreground">{tool.title || tool.id}</span>
                        <span className={cx("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium",tool.readOnly?"bg-sky-400/10 text-sky-300":"bg-amber-400/10 text-[var(--settings-warning-ink)]")}>{tool.readOnly?"Read / prepare":"Write · approval"}</span>
                      </div>
                      <p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">{tool.id} · {tool.scopes.join(', ')}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : installed?.capabilities.length ? (
              <div className="space-y-2"><p className="text-[12px] font-semibold">Installed capabilities</p>
                <div className="flex flex-wrap gap-1.5">{installed.capabilities.map(capability=><span key={capability} className="rounded-lg border border-border/80 bg-muted/20 px-2.5 py-1.5 text-[10px]">{capability}</span>)}</div>
              </div>
            ) : null}

            {installed?.providerKey==="github" && installed.connectionRef && host.listPluginRepositories ? (
              <section aria-label="GitHub repositories" className="space-y-3 border-t border-border/70 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[14px] font-semibold">Repositories</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">Verify the GitHub grant with a real account-scoped repository read.</p>
                  </div>
        =="public"?"Browse directory":"My plugins"}
              </button>
            ))}
          </div>

          {directoryTab === "public" ? (
            <div role="tabpanel" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold">Discover plugins</h3>fullName}</span>
                        <span className="mt-1 block truncate text-[10px] text-muted-foreground">{repo.private?"Private":"Public"} · {repo.defaultBranch||"No default branch"} · {repo.permissions.push?"Push access":repo.permissions.pull?"Read access":"Access level unavailable"}</span>
                      </span>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground"/>
                    </a>)}
                  </div> : <p className="rounded-xl border border-dashed border-border px-4 py-6 text-[12px] text-muted-foreground">No repositories were returned by GitHub for this connection.</p>
                ) : null}
                {gitRepositoriesHasMore ? <p className="text-[11px] text-muted-foreground">Showing the first 100 repositories. More may be available in GitHub.</p>:null}
              </section>
            ):null}

            {installed?.kind==="oauth" && installed.connectionRef ? (
              <section className="space-y-2" aria-label="Connected accounts">
                <h3 className="text-[14px] font-semibold">Connected account</h3>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium">{installed.connectionRef.split(":").slice(1).join(":") || installed.providerKey}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{installed.providerKey} · {installedState(installed)}</p>
                  </div>
                  <span className={cx("size-2 shrink-0 rounded-full",isConnected(installed)?"bg-emerald-500":"bg-amber-500")}/>
                </div>
              </section>
            ) : null}

            <section className="space-y-2" aria-label="Plugin information">
              <h3 className="text-[14px] font-semibold">Information</h3>
            <div className="overflow-hidden rounded-xl border border-border/80 px-3">
              {selectedCatalog ? <>
                <PreferenceRow label="Developer" description="Publisher of the plugin package." value={selectedCatalog.publisher}/>
                <PreferenceRow label="Version" description="Published plugin manifest version." value={selectedCatalog.version}/>
                <PreferenceRow label="Transport" description="Declared MCP transport protocol." value={selectedCatalog.transport}/>
                <PreferenceRow label="Permissions" description="Connection and authorization requirements." value="OAuth authorization required"/>
                <PreferenceRow label="Tools / skills" description="Tool declarations from the verified catalog; execution requires a valid grant and registered runtime tools." value={selectedCatalog.toolPermissions.length+" declared tools · "+selectedCatalog.skillCount+" packaged skills"}/>
              </> : null}
              {installed ? <>
                <PreferenceRow label="Connection status" description="Recorded connection state for this account." value={installed.setupStatus}/>
                <PreferenceRow label={installed.installationKey==="catalog-v1"?"Runtime health":"Credential health"}
                  description={installed.installationKey==="catalog-v1"?"Remote tool health.":"Provider token state; not a repository workflow test."} value={installed.healthStatus}/>
                {installed.installationKey==="catalog-v1" || installed.toolCount > 0 ?
                  <PreferenceRow label="MCP tools registered" description="Executable MCP tools registered for this installation." value={String(installed.toolCount)}/>
                  : <PreferenceRow label="Integration" description="Native/provider OAuth connections do not require MCP tool rows. Test an actual provider operation to verify functionality." value="Provider adapter"/>}
                <PreferenceRow label="Authentication" description="Required credential type." value={installed.authType}/>
                {!(installed.installationKey==="catalog-v1" && installed.setupStatus!=="connected") && host.setPluginEnabled ?
                  <PreferenceRow label="Enabled" description="Controls participation in the active runtime."
                    trailing={<Toggle enabled={installed.enabled} onChange={value=>void run(()=>host.setPluginEnabled!(installed.id,value))}/>} />
                  : null}
              </> : null}
            </div>
            </section>

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
            {actionError ? <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-[11px] text-[var(--settings-danger-ink)]">{actionError}</div> : null}
            {notice ? <div role="status" className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-[11px] text-[var(--settings-success-ink)]">{notice}</div> : null}

            {installed && isRunnable(installed) && host.readPluginWorkspace ? (
              <button type="button" onClick={()=>void openWorkspace(installed.id)}
                className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 text-[12px] font-semibold text-white hover:bg-violet-500">
                Open {installed.pluginKey==="agentsam-brand"?"Brand":installed.pluginKey==="agentsam-campaign"?"Campaign":"Plugin"} workspace
                <ChevronRight className="size-4"/>
              </button>
            ):null}
            <div className="space-y-2 border-t border-border/70 pt-4">
              {selectedCatalog && !plugins.some(plugin=>plugin.pluginKey===selectedCatalog.pluginKey) && host.installPluginFromCatalog ? (
                <button type="button" disabled={busy} onClick={()=>void run(()=>host.installPluginFromCatalog!(selectedCatalog.pluginKey))}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[12px] font-semibold text-background disabled:opacity-40">
                  <Plus className="size-4"/> Add to Studio
                </button>
              ) : null}
              {selectedCatalog && plugins.some(plugin=>plugin.pluginKey===selectedCatalog.pluginKey && plugin.setupStatus!=="connected") ? (
                <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-[var(--settings-warning-ink)]">Installed · authorization required.</span> This plugin's MCP tools will not run in Studio until a supported OAuth connection and tool registration flow is completed.
                </div>
              ) : null}
              {(installed?.setupUrl || installed?.kind === "oauth" || installed?.installationKey === "catalog-v1") && host.beginPluginSetup ? (
                <button type="button" disabled={busy} onClick={()=>void run(()=>host.beginPluginSetup!(installed.id))}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-violet-600 text-[11px] font-semibold text-white hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-40">
                  {installed.installationKey==="catalog-v1" ?        </div>
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
                )}d.</span> This plugin's MCP tools will not run in Studio until a supported OAuth connection and tool registration flow is completed.
                </div>
              ) : null}
              {(installed?.setupUrl || installed?.kind === "oauth" || installed?.installationKey === "catalog-v1") && host.beginPluginSetup ? (
                <button type="button" disabled={busy} onClick={()=>void run(()=>host.beginPluginSetup!(installed.id))}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-violet-600 text-[11px] font-semibold text-white hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-40">
                  {installed.installationKey==="catalog-v1" ? "Connect read-only" :
                    installed.setupStatus==="connected"?"Reconnect":"Connect plugin"} <ArrowUpRight className="size-3.5"/>
                </button>
              ) : null}
              {installed?.providerKey==="cloudflare" && host.beginPluginSetup ? (
                <div className="rounded-xl border border-border/80 p-3">
                  <p className="text-[12px] font-medium">Full Cloudflare authorization</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Request every scope in the configured Cloudflare OAuth catalog, including infrastructure write permissions. Your existing permissions are not reduced or changed unless you approve a new grant.</p>
                  <button type="button" disabled={busy}
                    onClick={()=>void run(()=>host.beginPluginSetup!(installed.id,{fullCloudflareAccess:true}))}
                    className="mt-3 min-h-10 w-full rounded-lg border border-border px-4 text-[12px] font-medium transition hover:bg-muted/25 disabled:opacity-50">Authorize full Cloudflare scope catalog</button>
                </div>
              ):null}
              {installed?.installationKey === "catalog-v1" && selectedCatalog?.toolPermissions.some(tool=>tool.requiresApproval) && host.beginPluginSetup ? (
                <button type="button" disabled={busy}
                  onClick={()=>void run(()=>host.beginPluginSetup!(installed.id,{allowWrites:true}))}
                  className="h-10 w-full rounded-full border border-border px-4 text-[11px] font-medium hover:bg-muted disabled:opacity-40">
                  Connect with approved writes
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
              {(installed?.disconnectUrl || installed?.kind==="oauth" || installed?.installationKey==="catalog-v1") && installed?.setupStatus==="connected" && host.disconnectPlugin ? (
                <button type="button" disabled={busy} onClick={()=>void run(()=>host.disconnectPlugin!(installed.id))}
                  className="h-9 w-full rounded-lg border border-border px-4 text-[11px] text-muted-foreground hover:bg-muted">Disconnect</button>
              ) : null}
            </div>
          </div>
        ) : null}
      </PluginDetailPage>
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
                className="h-10 w-full rounded-xl border border-border/80 bg-background/70 pl-10 pr-3 text-[12px] text-foreground outline-none transition-colors pfullName}</span>
                        <span className="mt-1 block truncate text-[10px] text-muted-foreground">{repo.private?"Private":"Public"} · {repo.defaultBranch||"No default branch"} · {repo.permissions.push?"Push access":repo.permissions.pull?"Read access":"Access level unavailable"}</span>
                      </span>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground"/>
                    </a>)}
                  </div> : <p className="rounded-xl border border-dashed border-border px-4 py-6 text-[12px] text-muted-foreground">No repositories were returned by GitHub for this connection.</p>
                ) : null}
                {gitRepositoriesHasMore ? <p className="text-[11px] text-muted-foreground">Showing the first 100 repositories. More may be available in GitHub.</p>:null}
              </section>
            ):null}

            {installed?.kind==="oauth" && installed.connectionRef ? (
              <section className="space-y-2" aria-label="Connected accounts">
                <h3 className="text-[14px] font-semibold">Connected account</h3>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium">{installed.connectionRef.split(":").slice(1).join(":") || installed.providerKey}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{installed.providerKey} · {installedState(installed)}</p>
                  </div>
                  <span className={cx("size-2 shrink-0 rounded-full",isConnected(installed)?"bg-emerald-500":"bg-amber-500")}/>
                </div>
              </section>
            ) : null}

            <section className="space-y-2" aria-label="Plugin information">
              <h3 className="text-[14px] font-semibold">Information</h3>
            <div className="overflow-hidden rounded-xl border border-border/80 px-3">
              {selectedCatalog ? <>
                <PreferenceRow label="Developer" description="Publisher of the plugin package." value={selectedCatalog.publisher}/>
                <PreferenceRow label="Version" description="Published plugin manifest version." value={selectedCatalog.version}/>
                <PreferenceRow label="Transport" description="Declared MCP transport protocol." value={selectedCatalog.transport}/>
                <PreferenceRow label="Permissions" description="Connection and authorization requirements." value="OAuth authorization required"/>
                <PreferenceRow label="Tools / skills" description="Tool declarations from the verified catalog; execution requires a valid grant and registered runtime tools." value={selectedCatalog.toolPermissions.length+" declared tools · "+selectedCatalog.skillCount+" packaged skills"}/>
              </> : null}
              {installed ? <>
                <PreferenceRow label="Connection status" description="Recorded connection state for this account." value={installed.setupStatus}/>
                <PreferenceRow label={installed.installationKey==="catalog-v1"?"Runtime health":"Credential health"}
                  description={installed.installationKey==="catalog-v1"?"Remote tool health.":"Provider token state; not a repository workflow test."} value={installed.healthStatus}/>
                {installed.installationKey==="catalog-v1" || installed.toolCount > 0 ?
                  <PreferenceRow label="MCP tools registered" description="Executable MCP tools registered for this installation." value={String(installed.toolCount)}/>
                  : <PreferenceRow label="Integration" description="Native/provider OAuth connections do not require MCP tool rows. Test an actual provider operation to verify functionality." value="Provider adapter"/>}
                <PreferenceRow label="Authentication" description="Required credential type." value={installed.authType}/>
                {!(installed.installationKey==="catalog-v1" && installed.setupStatus!=="connected") && host.setPluginEnabled ?
                  <PreferenceRow label="Enabled" description="Controls participation in the active runtime."
                    trailing={<Toggle enabled={installed.enabled} onChange={value=>void run(()=>host.setPluginEnabled!(installed.id,value))}/>} />
                  : null}
              </> : null}
            </div>
            </section>

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
            {actionError ? <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-[11px] text-[var(--settings-danger-ink)]">{actionError}</div> : null}
            {notice ? <div role="status" className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-[11px] text-[var(--settings-success-ink)]">{notice}</div> : null}

            {installed && isRunnable(installed) && host.readPluginWorkspace ? (
              <button type="button" onClick={()=>void openWorkspace(installed.id)}
                className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 text-[12px] font-semibold text-white hover:bg-violet-500">
                Open {installed.pluginKey==="agentsam-brand"?"Brand":installed.pluginKey==="agentsam-campaign"?"Campaign":"Plugin"} workspace
                <ChevronRight className="size-4"/>
              </button>
            ):null}
            <div className="space-y-2 border-t border-border/70 pt-4">
              {selectedCatalog && !plugins.some(plugin=>plugin.pluginKey===selectedCatalog.pluginKey) && host.installPluginFromCatalog ? (
                <button type="button" disabled={busy} onClick={()=>void run(()=>host.installPluginFromCatalog!(selectedCatalog.pluginKey))}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[12px] font-semibold text-background disabled:opacity-40">
                  <Plus className="size-4"/> Add to Studio
                </button>
              ) : null}
              {selectedCatalog && plugins.some(plugin=>plugin.pluginKey===selectedCatalog.pluginKey && plugin.setupStatus!=="connected") ? (
                <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-[var(--settings-warning-ink)]">Installed · authorization required.</span> This plugin's MCP tools will not run in Studio until a supported OAuth connection and tool registration flow is completed.
                </div>
              ) : null}
              {(installed?.setupUrl || installed?.kind === "oauth" || installed?.installationKey === "catalog-v1") && host.beginPluginSetup ? (
                <button type="button" disabled={busy} onClick={()=>void run(()=>host.beginPluginSetup!(installed.id))}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-violet-600 text-[11px] font-semibold text-white hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-40">
                  {installed.installationKey==="catalog-v1" ?
}

function ModelTable({ models }: { models: SettingsModel[] }) {
  if (!models.length) return <EmptyState title="This model inventory returned no entries. Refresh discovery or verify the connected runtime." />;

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
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 p-3 text-[11px] leading-5 text-[var(--settings-warning-ink)]">
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
            </button>ame={cx(
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
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{selected.availability === 'demo' ? 'Design preview' : 'Live widget'}</span>
                <span className="rounded-full border border-border bg-background/75 px-2 py-0.5 text-[9px] text-muted-foreground">
                  {selected.availability === "demo" ? "Concept · sample data" : "Packaged widget"}
                </span>
              </div>
              <div className="mx-auto min-h-40 max-w-sm">{selected.availability === 'demo' ? <WidgetGalleryPreview id={selected.id} interactive /> : <div className="agentsam-widget"><BuiltinWidget widgetId={selected.id} /></div>}</div>
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
  );async function savePolicy(){
    if(!host.updateAgentPolicy)return;
    setBusy(true);setError("");
    try{await host.updateAgentPolicy(policy);await onChanged();}
    catch(e){setError(e instanceof Error?e.message:"Could not update execution policy.");}
    finally{setBusy(false);}
  }
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(initialEditorDraft.current);
  function exitEditor() {
    if (hasUnsavedChanges && !window.confirm("Discard unsaved agent changes?")) return;
    setEditing(false);
    setError("");
  }
  if (editing) return (
      <PluginDetailPage agentProfile open={editing} title={selected?selected.name:"New agent"} description="Configure identity, tools, model, and execution rules for this account-owned agent."
        onBack={exitEditor}>
        <div className="space-y-5">
          <div className="border-b border-border/70 pb-3"><h3 className="text-[13px] font-semibold">Identity</h3><p className="mt-1 text-[11px] text-muted-foreground">Choose the name and short identifier used throughout your workspace.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
          {field("Agent name",draft.name,value=>setDraft(current=>({...current,name:value})),"Brand researcher")}
          {field("Slug",draft.slug,value=>setDraft(current=>({...current,slug:value.toLowerCase()})),"brand-researcher")}
          </div>
          {field("Description",draft.description,value=>setDraft(current=>({...current,description:value})),"What this agent does")}
          <div className="border-b border-border/70 pb-3 pt-2"><h3 className="text-[13px] font-semibold">Instructions & execution</h3><p className="mt-1 text-[11px] text-muted-foreground">All permissions remain subject to your connected accounts and runtime approvals.</p></div>
          <label className="block space-y-2">
            <span className="text-[11px] font-medium">Execution model (verified inventory)</span>
            <select className={formClass} value={draft.modelId} onChange={event=>setDraft(current=>({...current,modelId:event.target.value,reasoningEffort:"auto"}))}>
              <option value="">No model selected</option>
              {draft.modelId&&!selectedModel?<option value={draft.modelId}>{draft.modelId} (saved; not verified)</option>:null}
              {availableModels.map(model=><option key={model.id} value={model.id}>{model.provider}: {model.name}</option>)}
            </select>
            {!availableModels.length?<p className="text-[10px] text-[var(--settings-warning-ink)]">No verified models discovered. You can save the agent, but cannot claim it is runnable yet.</p>:null}
          </label>
          <label className="block space-y-2">
            <span className="text-[11px] font-medium">Agent instructions</span>
            <textarea rows={11} value={draft.instructions}
              onChange={event=>setDraft(current=>({...current,instructions:event.target.value}))}
              className={cx(formClass,"min-h-[230px] resize-y leading-relaxed")} placeholder="Describe the role, task procedure and safeguards."/>
          </label>
          <label className="block space-y-2">
            <span className="text-[11px] font-medium">Allowed tool patterns (one per line)</span>
            <textarea rows={3} value={draft.allowedTools.join("\n")}
              onChange={event=>setDraft(current=>({...current,allowedTools:event.target.value.split(/[,\n]/).map(t=>t.trim()).filter(Boolean)}))}
              className={cx(formClass,"resize-y leading-relaxed")}/>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-[11px] font-medium">Reasoning effort
              <select className={formClass} value={draft.reasoningEffort} onChange={event=>setDraft(current=>({...current,reasoningEffort:event.target.value as SettingsAgentDraft["reasoningEffort"]}))}>
                {draft.reasoningEffort&&!effortOptions.includes(draft.reasoningEffort)
                  ?<option value={draft.reasoningEffort}>{draft.reasoningEffort} (saved; not verified)</option>:null}
                {effortOptions.map(value=><option key={value} value={value}>{value==="auto"?"Model default":value}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-[11px] font-medium">Sandbox permissions
              <select className={formClass} value={draft.sandboxMode} onChange={event=>setDraft(current=>({...current,sandboxMode:event.target.value as SettingsAgentDraft["sandboxMode"]}))}>
                <option value="read-only">Read-only</option>
                <option value="workspace-write">Workspace write (approval rules apply)</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={draft.runInBackground} onChange={event=>setDraft(current=>({...current,runInBackground:event.target.checked}))}/>
            Allow background execution where supported
          </label>
          <label className="flex items-center justify-between gap-3 text-[11px]">
            <span>Maximum concurrent threads</span>
            <select value={draft.maxConcurrentThreads} className="min-h-11 rounded-lg border border-foreground/60 bg-muted/20 px-2 py-1 focus-visible:outline-2 focus-visible:outline-violet-400" onChange={event=>setDraft(current=>({...current,maxConcurrentThreads:Number(event.target.value)}))}>
              {[1,2,3,4,5,6,8,10,12].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={draft.active} onChange={event=>setDraft(current=>({...current,active:event.target.checked}))}/>
            Enabled
          </label>
          {error?<p role="alert" className="rounded-lg border border-red-500/30 p-3 text-[11px] text-[var(--settings-danger-ink)]">{error}</p>:null}
          <div className="flex justify-end gap-2 border-t border-border/70 pt-4 max-sm:flex-col-reverse">
            <button type="button" className="agent-profile-action rounded-lg border border-border px-4 py-2 text-[14px]" onClick={exitEditor}>Back to agents</button>
            <button type="button" disabled={busy||selected?.readOnly||!host.saveAgent} onClick={()=>void saveAgent()}
              className="agent-profile-primary agent-profile-confirm px-5 py-2 text-[14px] font-semibold disabled:opacity-40">Save agent</button>
          </div>
        </div>
      </PluginDetailPage>
  );
  if(view==="models"){
    return <Section title="Verified model inventory" description="Discovered per credential. Missing credentials and unsupported models are never silently substituted.">
      <ModelTable models={snapshot.models}/>
    </Section>;
  }
  if(view==="cloud"){
    return <Section title="Cloud agent execution" description="Connected remote agent runners and supported execution lanes.">
      {snapshot.cloudAgents.length?<Catalog items={snapshot.cloudAgents}/>:
      <EmptyState title="No verified cloud agents in the current runtime."/>}
    </Section>;
  }
  if(view==="policy"){
    return <Section title="Agent execution policy" description="Stored for your account in the existing agentsam_user_policy registry.">
      {snapshot.agentError?<p role="alert" className="text-[12px] text-[var(--settings-warning-ink)]">{snapshot.agentError}</p>:null}
      <div className="space-y-4 rounded-xl border border-border/70 p-4">
        {([
          ["allowSubagentSpawn","Allow subagent spawning","Permit approved agent profiles to delegate work."],
          ["allowFanoutExecution","Allow parallel agent execution","Enable authorized fanout across eligible agent profiles."],
          ["requireAllowlistForMcp","Require MCP allowlist","Only permit MCP tool calls through explicit registration/allowlist."],
        ] as const).map(([key,title,desc])=>(
          <labe
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
  return <SettingsThemeGallery themes={themes} host={host} onChanged={onChanged} />;
}

const freshAgent=():SettingsAgentDraft=>({
  name:"",slug:"",description:"",instructions:"",modelId:"",
  allowedTools:[],runInBackground:false,sandboxMode:"workspace-write",
  reasoningEffort:"auto",maxConcurrentThreads:3,active:true,
});
function agentDraft(row:SettingsAgent):SettingsAgentDraft{
 return {
  name:row.name,slug:row.slug||row.role||"",
  description:row.description||"",instructions:row.instructions||"",
  modelId:row.modelId||"",allowedTools:row.allowedTools||[],
  runInBackground:row.runInBackground===true,
  sandboxMode:row.sandboxMode==="read-only"?"read-only":"workspace-write",
  reasoningEffort:row.reasoningEffort||"auto",
  maxConcurrentThreads:row.maxConcurrentThreads||3,active:row.active!==false,
 };
}
function AgentsView({snapshot,view,host,onChanged}:{
  snapshot:SettingsSnapshot;view:string;host:SettingsHost;onChanged:()=>Promise<void>;
}){
  const [selected,setSelected]=useState<SettingsAgent|null>(null);
  const [draft,setDraft]=useState<SettingsAgentDraft>(freshAgent);
  const initialEditorDraft=useRef<SettingsAgentDraft>(freshAgent());
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [policy,setPolicy]=useState<SettingsAgentPolicy>(snapshot.agentPolicy||{
    allowSubagentSpawn:false,allowFanoutExecution:false,maxSpawnDepth:1,requireAllowlistForMcp:true,
  });
  useEffect(()=>{
    if(snapshot.agentPolicy)setPolicy(snapshot.agentPolicy);
  },[snapshot.agentPolicy]);
  const availableModels=snapshot.models.filter(model=>model.enabled);
  const selectedModel=availableModels.some(model=>model.id===draft.modelId);
  const verifiedModel=availableModels.find(model=>model.id===draft.modelId);
  const effortOptions=["auto",...(verifiedModel?.reasoningEfforts||[])];
  const formClass="agent-profile-field w-full min-h-10 rounded-lg border border-foreground/50 bg-background px-3 py-2 text-[12px] text-foreground outline-none transition-colors focus:border-foreground/70 focus-visible:ring-2 focus-visible:ring-foreground/25";
  const field=(label:string,value:string,onChange:(next:string)=>void,placeholder="")=>(
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium">{label}</span>
      <input className={formClass} value={value} placeholder={placeholder} onChange={event=>onChange(event.target.value)}/>
    </label>
  );
  function startNew(template?:SettingsAgent){
    const next=template?{...agentDraft(template),modelId:"",active:true}:freshAgent();
    initialEditorDraft.current=next;
    setSelected(null);
    setDraft(next);
    setError("");setEditing(true);
  }
  function startEdit(agent:SettingsAgent){
    initialEditorDraft.current=agentDraft(agent);
    setSelected(agent);setDraft(agentDraft(agent));setError("");setEditing(true);
  }
  async function saveAgent(){
    if(!host.saveAgent)return;
    if(!draft.name.trim()||!draft.slug.trim()||draft.instructions.trim().length<8){
      setError("Name, unique slug and instructions (8+ characters) are required.");return;
    }
    setBusy(true);setError("");
    try{
      await host.saveAgent(draft,selected?.id);
      await onChanged();setEditing(false);
    }catch(e){setError(e instanceof Error?e.message:"Could not save this agent.");}
    finally{setBusy(false);}
  }
  async function archive(agent:SettingsAgent){
    if(!host.archiveAgent||!window.confirm("Archive "+agent.name+"? It can be restored by editing the saved profile."))return;
    setBusy(true);setError("");
    try{await host.archiveAgent(agent.id);await onChanged();}
    catch(e){setError(e instanceof Error?e.message:"Unable to archive agent.");}
    finally{setBusy(false);}
  }
  rent=>({...current,[key]:event.target.checked}))}
              className="size-4 accent-primary"/>
          </label>
        ))}
        <label className="block space-y-2 text-[12px]">
          <span className="font-medium">Maximum spawn depth</span>
          <select className={formClass} value={policy.maxSpawnDepth}
            onChange={event=>setPolicy(current=>({...current,maxSpawnDepth:Number(event.target.value)}))}>
            {[1,2,3,4,5].map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {error?<p role="alert" className="text-[11px] text-[var(--settings-danger-ink)]">{error}</p>:null}
        <button type="button" onClick={()=>void savePolicy()} disabled={busy||!host.updateAgentPolicy||!!snapshot.agentError}
          className="rounded-lg bg-violet-600 px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50">
          Save execution policy
        </button>
      </div>
    </Section>;
  }
  return (
    <div className="agent-profiles space-y-5">
      <Section title="My agents"
        action={<button type="button" onClick={()=>startNew()} disabled={!host.saveAgent}
          className="agent-profile-primary inline-flex items-center gap-2 px-4 py-2 text-[14px] font-semibold disabled:opacity-50">
          <Plus className="size-3.5"/> New agent
        </button>}>
        {snapshot.agentError?<p role="alert" className="rounded-xl border border-amber-500/30 p-4 text-[12px] text-[var(--settings-warning-ink)]">
          Failed to load account agent records: {snapshot.agentError}
        </p>:snapshot.agents.length?(
          <div className="agent-profile-grid">
            {snapshot.agents.map(agent=>(
              <article key={agent.id} className="agent-profile-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Bot className="size-5 shrink-0 text-muted-foreground"/>
                    <div className="min-w-0"><p className="truncate text-[13px] font-semibold">{agent.name}</p>
                    <p className="text-[10px] text-muted-foreground">/{agent.slug}</p></div>
                  </div>
                  <span className={cx("rounded-full px-2 py-1 text-[10px]",agent.active?"agent-profile-enabled":"bg-muted text-muted-foreground")}>
                    {agent.active?"Enabled":"Archived"}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-[11px] text-muted-foreground">{agent.description||"No description"}</p>
                <p className="mt-2 truncate text-[10px] text-muted-foreground">Model: {agent.modelId||"Unassigned"}</p>
                <div className="mt-4 flex gap-2 border-t border-border/70 pt-3">
                  <button type="button" className="agent-profile-action rounded-lg border border-border px-3 py-1.5 text-[14px] hover:bg-muted" onClick={()=>startEdit(agent)}>
                    {agent.readOnly?"View":"Edit"} profile
                  </button>
                  {!agent.readOnly&&agent.active&&host.archiveAgent?
                    <button type="button" disabled={busy} className="agent-profile-action rounded-lg px-3 py-1.5 text-[14px] text-muted-foreground hover:text-[var(--settings-danger-ink)]" onClick={()=>void archive(agent)}>Archive</button>:null}
                </div>
              </article>
            ))}
          </div>
        ):<p className="rounded-xl border border-dashed border-border/70 p-6 text-[12px] text-muted-foreground">
          No personal agent profiles are enabled in this account. Create one or start from a registered platform template.
        </p>}
      </Section>
      <Section title="Available templates" description="Existing platform agent profiles. Copy a template into your account before making changes.">
        <div className="agent-profile-grid">
          {(snapshot.agentTemplates||[]).map(agent=>(
            <button type="button" key={agent.id} onClick={()=>startNew(agent)} className="agent-profile-card p-4 text-left hover:border-[var(--profile-accent)]">
              <p className="text-[12px] font-medium">{agent.name}</p>
              <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{agent.description||"Reusable agent template"}</p>
              <p className="mt-2 text-[14px] text-[var(--profile-accent)]">Create from template →</p>
            </button>
          ))}
        </div>
      </Section>

    </div>
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
    return <PluginCustomizeView plugins={snapshot.plugins} pluginsError={snapshot.pluginsError} host={host} onChanged={onChanged} />;
  }
  if (view === "widgets") {
    return <WidgetCustomizeView widgets={snapshot.widgets} host={host} onChanged={onChanged} />;
  }
  if(view === "subagents") {
    return <Section title="Subagent profiles" description="The same account-owned agent registry as Settings → Agents. No duplicate browser-only definitions.">
      <div className="space-y-3">
        {snapshot.agents.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {snapshot.agents.map(agent=><div key={agent.id} className="rounded-xl border border-border/70 p-3">
              <p className="text-[12px] font-medium">{agent.name}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{agent.slug} · {agent.active?"Enabled":"Archived"} · {agent.modelId||"No model"}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{agent.description}</p>
            </div>)}
          </div>
        ):<p className="text-[12px] text-muted-foreground">No personal agent profiles saved yet.</p>}
        {snapshot.agentError?<p role="alert" className="text-[11px] text-[var(--settings-warning-ink)]">{snapshot.agentError}</p>:null}
        {host.openSettingsUnit?<button type="button" onClick={()=>host.openSettingsUnit?.("agents")}
          className="rounded-lg border border-border px-4 py-2 text-[12px] hover:bg-muted">Create or edit agents →</button>:null}
      </div>
    </Section>;
  }

  const registries: Record<CatalogRegistryKind, SettingsCatalogItem[]> = {
    mcps: snapshot.mcps,
    skills: snapshot.skills,
    rules: snapshot.rules,
    commands: snapshot.commands,
    hooks: snapshot.hooks,
  };
  const kind = (view in registries ? view : "skills") as CatalogRegistryKind;
  return (
    <CatalogRegistryView
      kind={kind}
      items={registries[kind]}
      access={snapshot.catalogAccess?.[kind]}
      host={host}
      onChanged={onChanged}
    />
  );
}

function GeneralView({snapshot,host,onChanged}:{
 snapshot:SettingsSnapshot;host:SettingsHost;onChanged:()=>Promise<void>;
}){
 const [preferences,setPreferences]=useState<SettingsGeneralPreferences>(snapshot.general.preferences||{
  openLastProject:false,showRuntimeReceipts:false,
 });
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  if(snapshot.general.preferences)setPreferences(snapshot.general.preferences);
 },[snapshot.general.preferences]);
 async function save(){
  if(!host.updateGeneralPreferences)return;
  setBusy(true);setError("");
  try{await host.updateGeneralPreferences(preferences);await onChanged();}
  catch(e){setError(e instanceof Error?e.message:"Unable to save preferences");}
  finally{setBusy(false);}
 }
 const context=(
   <>
     <Section title="Product context" description="Current authenticated account and runtime, resolved by the host.">
       <div className="rounded-lg border border-border/70 px-3">
         <PreferenceRow label="Account" description="Account authority for saved preferences." value={snapshot.general.account}/>
         <PreferenceRow label="Organization" description="Membership context, when availab