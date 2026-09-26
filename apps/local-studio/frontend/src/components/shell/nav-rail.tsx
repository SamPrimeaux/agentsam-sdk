import { useRouterState } from "@tanstack/react-router";
import {
  Box,
  Database,
  FileCode,
  FolderGit2,
  Globe,
  Layers,
  LayoutTemplate,
  MessageSquare,
  Palette,
  Settings,
  SquareTerminal,
  Upload,
} from "lucide-react";
import { Nav } from "@inneranimalmedia/agentsam-nav";
import { StudioMark } from "@/components/mark";
import { useWorkStore } from "@/lib/work/store";

const ITEMS = [
  { to: "/agentsam", label: "Studio", icon: MessageSquare, match: (p: string) => p === "/agentsam" || p.startsWith("/trails") },
  { to: "/cms", label: "CMS", icon: LayoutTemplate, match: (p: string) => p.startsWith("/cms") },
  { to: "/cad", label: "CAD", icon: Layers, match: (p: string) => p.startsWith("/cad") },
  { to: "/database", label: "Database", icon: Database, match: (p: string) => p.startsWith("/database") },
  { to: "/projects", label: "Projects", icon: FolderGit2, match: (p: string) => p.startsWith("/projects") },
  { to: "/artifacts", label: "Artifacts", icon: Box, match: (p: string) => p.startsWith("/artifacts") },
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
            <Nav.MenuItem><Nav.MenuButton icon={Upload} active={pathname.startsWith("/ship")} itemId="ship" onClick={() => window.dispatchEvent(new CustomEvent("agentsam:navigate", { detail: { to: "/ship" } }))}>Ship</Nav.MenuButton></Nav.MenuItem>
          </Nav.Menu>
        </Nav.Group>
      </Nav.Content>
      <Nav.Footer><Nav.Trigger /></Nav.Footer>
    </Nav>
  );
}
