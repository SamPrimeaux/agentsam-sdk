import { useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Blocks,
  CalendarDays,
  Database,
  FileCode,
  FolderGit2,
  Globe,
  Images,
  LayoutTemplate,
  Megaphone,
  MessageSquare,
  Palette,
  PawPrint,
  Settings,
  SquareTerminal,
} from "lucide-react";
import { toast } from "sonner";
import { isPackagedDesktop, toggleAgentSamPet } from "@/lib/desktop/tauri";
import { Nav } from "@inneranimalmedia/agentsam-nav";
import { StudioMark } from "@/components/mark";
import { IconAction } from "@/components/ui/icon-action";
import { useWorkStore } from "@/lib/work/store";

function SamSketchIcon({ className }: {className?: string; 'aria-hidden'?: boolean}) {
  return <img src="/brand/samsketch-icon.png" alt="" className={className} draggable={false} />;
}

const ITEMS = [
  { to: "/admin/chats", label: "Chats", icon: MessageSquare, match: (p: string) => p === "/admin/agentsam" || p.startsWith("/admin/chats") },
  { to: "/admin/cms", label: "CMS", icon: LayoutTemplate, match: (p: string) => p.startsWith("/admin/cms") },
  { to: "/admin/sites", label: "Sites", icon: Globe, match: (p: string) => p.startsWith("/admin/sites") },
  { to: "/admin/library", label: "Library", icon: Images, match: (p: string) => p.startsWith("/admin/library") || p.startsWith("/admin/media") || p.startsWith("/admin/artifacts") || p.startsWith("/admin/content") },
  { to: "/admin/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fgrowth", label: "Growth", icon: Megaphone, match: (p: string) => p === "/admin/campaigns" || (p.startsWith("/admin/apps/ecommerce-cms-agentsam") && new URLSearchParams(window.location.search).get("page") === "/admin/growth") },
  { to: "/admin/database", label: "Database", icon: Database, match: (p: string) => p.startsWith("/admin/database") },
  { to: "/admin/collaborate", label: "Work", icon: CalendarDays, match: (p: string) => p.startsWith("/admin/collaborate") || p.startsWith("/admin/mail") },
  { to: "/admin/projects", label: "Projects", icon: FolderGit2, match: (p: string) => p.startsWith("/admin/projects") },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, match: (p: string) => p.startsWith("/admin/analytics") },
] as const;

export function NavRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const terminalOpen = useWorkStore((s) => s.terminalOpen);
  const sideOpen = useWorkStore((s) => s.sideOpen);
  const sideTabs = useWorkStore((s) => s.sideTabs);
  const activeSideTabId = useWorkStore((s) => s.activeSideTabId);
  const toggleTerminal = useWorkStore((s) => s.toggleTerminal);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const sideCli =
    sideOpen && sideTabs.some((t) => t.id === activeSideTabId && t.kind === "terminal");
  const cliActive = terminalOpen || sideCli;

  return (
    <Nav>
      <Nav.Header className="flex items-center justify-between">
        <IconAction label="Studio home" hint="Return to AgentSam home" className="flex size-10 items-center justify-center rounded-xl text-accent" onClick={() => window.dispatchEvent(new CustomEvent("agentsam:navigate", { detail: { to: "/admin/agentsam" } }))}>
          <StudioMark className="size-7" />
        </IconAction>
        <Nav.Trigger className="hidden md:inline-grid" />
      </Nav.Header>
      <Nav.Content>
        <Nav.Group>
          <Nav.GroupLabel>Studio</Nav.GroupLabel>
          <Nav.Menu>
            {ITEMS.map((item) => (
              <Nav.MenuItem key={item.to}>
                <Nav.MenuButton icon={item.icon} active={item.match(pathname)} itemId={item.label.toLowerCase()} onClick={() => window.dispatchEvent(new CustomEvent("agentsam:navigate", { detail: { to: item.to } }))}>
                  {item.label}
                </Nav.MenuButton>
              </Nav.MenuItem>
            ))}
            <Nav.MenuItem>
              <Nav.MenuButton
                icon={SquareTerminal}
                active={cliActive}
                itemId="cli"
                onClick={() => toggleTerminal()}
                onDoubleClick={() => openSideTab("terminal", { ephemeral: false })}
              >
                CLI
              </Nav.MenuButton>
            </Nav.MenuItem>
          </Nav.Menu>
        </Nav.Group>
        <Nav.Group>
          <Nav.GroupLabel>Apps</Nav.GroupLabel>
          <Nav.Menu>
            <Nav.MenuItem>
              <Nav.Collapsible defaultOpen={pathname.startsWith("/admin/cad") || pathname.startsWith("/admin/samsketch") || pathname.startsWith("/admin/apps/")}>
                <Nav.CollapsibleTrigger render={<Nav.MenuButton icon={Blocks} active={pathname.startsWith("/admin/cad") || pathname.startsWith("/admin/samsketch") || pathname.startsWith("/admin/apps/")}>Installed apps <Nav.MenuChevron /></Nav.MenuButton>} />
                <Nav.CollapsibleContent>
                  <Nav.MenuSub>
                    <li><Nav.MenuSubButton href="/admin/samsketch" active={pathname.startsWith("/admin/samsketch")}><span className="inline-flex items-center gap-2"><SamSketchIcon className="size-4" />SamSketch</span></Nav.MenuSubButton></li>
                    <li><Nav.MenuSubButton href="/admin/cad" active={pathname.startsWith("/admin/cad")}><span className="inline-flex items-center gap-2"><Box className="size-4" />CAD Creator</span></Nav.MenuSubButton></li>
                    <li><Nav.MenuSubButton href="/admin/apps/ecommerce-cms-agentsam" active={pathname.startsWith("/admin/apps/ecommerce-cms-agentsam")}>Commerce CMS</Nav.MenuSubButton></li>
                  </Nav.MenuSub>
                </Nav.CollapsibleContent>
              </Nav.Collapsible>
            </Nav.MenuItem>
          </Nav.Menu>
        </Nav.Group>
        <Nav.Group>
          <Nav.GroupLabel>Workspace</Nav.GroupLabel>
          <Nav.Menu>
            <Nav.MenuItem>
              <Nav.Collapsible defaultOpen={pathname.startsWith("/admin/settings")}>
                <Nav.CollapsibleTrigger render={<Nav.MenuButton icon={Settings} active={pathname.startsWith("/admin/settings")}>Settings <Nav.MenuChevron /></Nav.MenuButton>} />
                <Nav.CollapsibleContent>
                  <Nav.MenuSub>
                    <li><Nav.MenuSubButton href="/admin/settings/general" active={pathname === "/admin/settings/general" || pathname === "/admin/settings"}>Account</Nav.MenuSubButton></li>
                    <li><Nav.MenuSubButton href="/admin/settings/keys" active={pathname.startsWith("/admin/settings/keys")}>Keys & secrets</Nav.MenuSubButton></li>
                    <li><Nav.MenuSubButton href="/admin/settings/themes" active={pathname === "/admin/settings/themes"}>Themes</Nav.MenuSubButton></li>
                    <li><Nav.MenuSubButton href="/admin/settings/integrations" active={pathname === "/admin/settings/integrations"}>Integrations</Nav.MenuSubButton></li>
                  </Nav.MenuSub>
                </Nav.CollapsibleContent>
              </Nav.Collapsible>
            </Nav.MenuItem>
            <Nav.MenuItem>
              <Nav.MenuButton
                icon={Palette}
                active={pathname.startsWith("/admin/settings/themes") || pathname.startsWith("/admin/themes")}
                itemId="themes"
                onClick={() => window.dispatchEvent(new CustomEvent("agentsam:navigate", { detail: { to: "/admin/settings/themes" } }))}
              >
                Themes
              </Nav.MenuButton>
            </Nav.MenuItem>
          </Nav.Menu>
        </Nav.Group>
      </Nav.Content>
      <Nav.Footer>
        {isPackagedDesktop() ? (
          <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Toggle AgentSam desktop pet" title="Show or hide the AgentSam desktop pet"
            onClick={() => { void toggleAgentSamPet().then((visible) => toast.success(visible ? "AgentSam pet is on your desktop" : "AgentSam pet hidden")).catch(() => toast.error("AgentSam desktop pet could not be opened.")); }}>
            <PawPrint className="size-4 shrink-0" /><span>Desktop pet</span>
          </button>
        ) : null}
        <Nav.Trigger />
      </Nav.Footer>
    </Nav>
  );
}
