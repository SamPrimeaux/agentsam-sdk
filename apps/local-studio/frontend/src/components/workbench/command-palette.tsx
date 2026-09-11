import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Box, FileCode, FolderGit2, Globe, MessageSquare, Plus, Search, SquareTerminal, Upload } from "lucide-react";
import { useWorkStore } from "@/lib/work/store";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const trails = useWorkStore((s) => s.trails);
  const projects = useWorkStore((s) => s.projects);
  const startTrail = useWorkStore((s) => s.startTrail);
  const setActiveTrail = useWorkStore((s) => s.setActiveTrail);
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
              const id = startTrail();
              void navigate({ to: "/trails/$trailId", params: { trailId: id } });
              setOpen(false);
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
              void navigate({ to: "/files" });
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
              void navigate({ to: "/ship" });
              setOpen(false);
            }}
          >
            <Upload className="size-4" />
            Ship
          </Command.Item>
          <Command.Item
            onSelect={() => {
              void navigate({ to: "/trails" });
              setOpen(false);
            }}
          >
            <Search className="size-4" />
            Chats
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Projects">
          {projects.map((project) => (
            <Command.Item
              key={project.id}
              value={`project ${project.name}`}
              onSelect={() => {
                setActiveProject(project.id);
                void navigate({ to: "/trails" });
                setOpen(false);
              }}
            >
              {project.name}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Chats">
          {trails.map((trail) => (
            <Command.Item
              key={trail.id}
              value={trail.title}
              onSelect={() => {
                setActiveTrail(trail.id);
                void navigate({ to: "/trails/$trailId", params: { trailId: trail.id } });
                setOpen(false);
              }}
            >
              {trail.title}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
