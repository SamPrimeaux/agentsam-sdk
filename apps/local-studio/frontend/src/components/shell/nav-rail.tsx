import { useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Blocks,
  Box,
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
  Settings,
  SquareTerminal,
} from "lucide-react";
import { Nav } from "@inneranimalmedia/agentsam-nav";
import { StudioMark } from "@/components/mark";
import { useWorkStore } from "@/lib/work/store";

function SamSketchIcon({ className }: {className?: string; 'aria-hidden'?: boolean}) {
  return <img src="/brand/samsketch-icon.png" alt="" className={className} draggable={false} />;
}

const ITEMS = [
  { to: "/chats", label: "Chats", icon: MessageSquare, match: (p: string) => p === "/agentsam" || p.startsWith("/chats") },
  { to: "/cms", label: "CMS", icon: LayoutTemplate, match: (p: string) => p.startsWith("/cms") },
  { to: "/sites", label: "Sites", icon: Globe, match: (p: string) => p.startsWith("/sites") },
  { to: "/media", label: "Media", icon: Images, match: (p: string) => p.startsWith("/media") || p.startsWith("/content") },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, match: (p: string) => p.startsWith("/campaigns") },
  { to: "/database", label: "Database", icon: Database, match: (p: string) => p.startsWith("/database") },
  { to: "/collaborate", label: "Work", icon: CalendarDays, match: (p: string) => p.startsWith("/collaborate") || p.startsWith("/mail") },
  { to: "/projects", label: "Projects", icon: FolderGit2, match: (p: string) => p.startsWith("/projects") },
  { to: "/artifacts", label: "Artifacts", icon: Box, match: (p: string) => p.startsWith("/artifacts") },
  { to: "/analytics", label: "Analytics", icon: BarChart3, match: (p: string) => p.startsWith("/analytics") },
  { to: "/files", label: "Files", icon: FileCode, match: (p: string) => p.startsWith("/files") },
  { to: "/browse", label: "Browser", icon: Globe, match: (p: string) => p.startsWith("/browse") },
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
        <button type="button" aria-label="Studio home" className="flex size-10 items-center justify-center rounded-xl text-accent" onClick={() => window.dispatchEvent(new CustomEvent("agentsam:navigate", { detail: { to: "/agentsam" } }))}>
          <StudioMark className="size-7" />
        </button>
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
              <Nav.Collapsible defaultOpen={pathname.startsWith("/cad") || pathname.startsWith("/samsketch") || pathname.startsWith("/apps/")}>
                <Nav.CollapsibleTrigger render={<Nav.MenuButton icon={Blocks} active={pathname.startsWith("/cad") || pathname.startsWith("/samsketch") || pathname.startsWith("/apps/")}>Installed apps <Nav.MenuChevron /></Nav.MenuButton>} />
                <Nav.CollapsibleContent>
                  <Nav.MenuSub>
                    <li><Nav.MenuSubButton href="/samsketch" active={pathname.startsWith("/samsketch")}><span className="inline-flex items-center gap-2"><SamSketchIcon className="size-4" />SamSketch</span></Nav.MenuSubButton></li>
                    <li><Nav.MenuSubButton href="/cad" active={pathname.startsWith("/cad")}><span className="inline-flex items-center gap-2"><Box className="size-4" />CAD Creator</span></Nav.MenuSubButton></li>
                    <li><Nav.MenuSubButton href="/apps/ecommerce-cms-agentsam" active={pathname.startsWith("/apps/ecommerce-cms-agentsam")}>Commerce CMS</Nav.MenuSubButton></li>
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
              <Nav.Collapsible defaultOpen={pathname.startsWith("/settings")}>
                <Nav.CollapsibleTrigger render={<Nav.MenuButton icon={Settings} active={pathname.startsWith("/settings")}>Settings <Nav.MenuChevron /></Nav.MenuButton>} />
                <Nav.CollapsibleContent>
                  <Nav.MenuSub>
                    <li><Nav.MenuSubButton href="/settings/general" active={pathname === "/settings/general" || pathname === "/settings"}>Account</Nav.MenuSubButton></li>
                    <li><Nav.MenuSubButton href="/settings/keys" active={pathname.startsWith("/settings/keys")}>Keys & secrets</Nav.MenuSubButton></li>
                    <li><Nav.MenuSubButton href="/settings/themes" active={pathname === "/settings/themes"}>Themes</Nav.MenuSubButton></li>
                    <li><Nav.MenuSubButton href="/settings/integrations" active={pathname === "/settings/integrations"}>Integrations</Nav.MenuSubButton></li>
                  </Nav.MenuSub>
                </Nav.CollapsibleContent>
              </Nav.Collapsible>
            </Nav.MenuItem>
            <Nav.MenuItem>
              <Nav.MenuButton
                icon={Palette}
                active={pathname.startsWith("/settings/themes") || pathname.startsWith("/themes")}
                itemId="themes"
                onClick={() => window.dispatchEvent(new CustomEvent("agentsam:navigate", { detail: { to: "/settings/themes" } }))}
              >
                Themes
              </Nav.MenuButton>
            </Nav.MenuItem>
          </Nav.Menu>
        </Nav.Group>
      </Nav.Content>
      <Nav.Footer><Nav.Trigger /></Nav.Footer>
    </Nav>
  );
}
