import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Box, FileCode, FolderGit2, Globe, MessageSquare, Plus, Search, SquareTerminal } from "lucide-react";
import { useWorkStore } from "@/lib/work/store";
import { COMMANDS, runCommand } from "@/lib/commands/native-commands";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const chats = useWorkStore((s) => s.chats);
  const projects = useWorkStore((s) => s.projects);
  const startChat = useWorkStore((s) => s.startChat);
  const setActiveChat = useWorkStore((s) => s.setActiveChat);
  const setActiveProject = useWorkStore((s) => s.setActiveProject);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const createProject = useWorkStore((s) => s.createProject);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    const onOpenSearch = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("agentsam:open-command-palette", onOpenSearch);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("agentsam:open-command-palette", onOpenSearch);
    };
  }, []);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-ink/60"
      contentClassName="fixed top-[18vh] left-1/2 z-50 w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2"
    >
      <Command.Input placeholder="Search chats, projects, or run a command" />
      <Command.List>
        <Command.Empty>Nothing matches.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item
            onSelect={() => {
              // Same command as File ▸ New Chat and its shortcut.
              setOpen(false);
              void runCommand("chat.new");
            }}
          >
            <Plus className="size-4" />
            New chat
          </Command.Item>
          <Command.Item
            onSelect={() => {
              createProject();
              void navigate({ to: "/projects" });
              setOpen(false);
            }}
          >
            <FolderGit2 className="size-4" />
            New project
          </Command.Item>
          <Command.Item
            onSelect={() => {
              openSideTab("chat");
              setOpen(false);
            }}
          >
            <MessageSquare className="size-4" />
            New co-worker
          </Command.Item>
          <Command.Item
            onSelect={() => {
              useWorkStore.getState().toggleTerminal();
              setOpen(false);
            }}
          >
            <SquareTerminal className="size-4" />
            Toggle CLI drawer
          </Command.Item>
          <Command.Item
            onSelect={() => {
              void navigate({ to: "/browse" });
              setOpen(false);
            }}
          >
            <Globe className="size-4" />
            Open browser
          </Command.Item>
          <Command.Item
            onSelect={() => {
              openSideTab("files", { ephemeral: false });
              void navigate({ to: "/admin/agentsam" });
              setOpen(false);
            }}
          >
            <FileCode className="size-4" />
            Open files
          </Command.Item>
          <Command.Item
            onSelect={() => {
              void navigate({ to: "/artifacts" });
              setOpen(false);
            }}
          >
            <Box className="size-4" />
            Open artifacts
          </Command.Item>
          <Command.Item
            onSelect={() => {
              void navigate({ to: "/chats" });
              setOpen(false);
            }}
          >
            <Search className="size-4" />
            Chats
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Shell">
          {COMMANDS.filter((command) => command.group === "Shell" && command.palette).map((command) => (
            <Command.Item
              key={command.id}
              value={`shell ${command.title}`}
              onSelect={() => {
                setOpen(false);
                // Defer so the palette dialog releases focus before the terminal/dialog takes it.
                setTimeout(() => void runCommand(command.id), 0);
              }}
            >
              <SquareTerminal className="size-4" />
              {command.title}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Projects">
          {projects.map((project) => (
            <Command.Item
              key={project.id}
              value={`project ${project.name}`}
              onSelect={() => {
                setActiveProject(project.id);
                void navigate({ to: "/chats" });
                setOpen(false);
              }}
            >
              {project.name}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Chats">
          {chats.map((chat) => (
            <Command.Item
              key={chat.id}
              value={chat.title}
              onSelect={() => {
                setActiveChat(chat.id);
                void navigate({ to: "/chats/$chatId", params: { chatId: chat.id } });
                setOpen(false);
              }}
            >
              {chat.title}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
