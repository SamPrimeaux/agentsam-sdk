import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn, shortTime } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";
import type { Project, Trail } from "@/lib/work/types";

function groupTrails(trails: Trail[], query: string) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? trails.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.messages.some((m) => m.content.toLowerCase().includes(q)),
      )
    : trails;
  const pinned = filtered.filter((t) => t.pinned);
  const rest = filtered.filter((t) => !t.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  const now = Date.now();
  const day = 86_400_000;
  return {
    pinned,
    today: rest.filter((t) => now - t.updatedAt < day),
    yesterday: rest.filter((t) => now - t.updatedAt >= day && now - t.updatedAt < 2 * day),
    earlier: rest.filter((t) => now - t.updatedAt >= 2 * day),
  };
}

function TrailRow({
  trail,
  activeId,
  onRename,
}: {
  trail: Trail;
  activeId?: string;
  onRename: (trail: Trail) => void;
}) {
  const navigate = useNavigate();
  const setActiveTrail = useWorkStore((s) => s.setActiveTrail);
  const pinTrail = useWorkStore((s) => s.pinTrail);
  const deleteTrail = useWorkStore((s) => s.deleteTrail);
  const active = activeId === trail.id;

  return (
    <div className={cn("group flex items-center rounded-lg", active ? "bg-muted" : "hover:bg-muted/60")}>
      <button
        type="button"
        onClick={() => {
          setActiveTrail(trail.id);
          void navigate({ to: "/trails/$trailId", params: { trailId: trail.id } });
        }}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left md:min-h-0"
      >
        <span className="min-w-0 flex-1 truncate text-sm">{trail.title}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{shortTime(trail.updatedAt)}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="mr-1 size-11 opacity-100 md:size-8 md:opacity-0 md:group-hover:opacity-100 md:data-[state=open]:opacity-100"
            aria-label={`Chat actions for ${trail.title}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onRename(trail)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => pinTrail(trail.id)}>
            <Pin className="size-3.5" />
            {trail.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              deleteTrail(trail.id);
              if (active) void navigate({ to: "/trails" });
            }}
          >
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Section({
  label,
  trails,
  activeId,
  onRename,
}: {
  label: string;
  trails: Trail[];
  activeId?: string;
  onRename: (t: Trail) => void;
}) {
  if (!trails.length) return null;
  return (
    <div className="mb-3">
      <p className="px-2.5 pb-1 text-[11px] tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
      <div className="flex flex-col gap-0.5">
        {trails.map((trail) => (
          <TrailRow key={trail.id} trail={trail} activeId={activeId} onRename={onRename} />
        ))}
      </div>
    </div>
  );
}

export function TrailsPanel({
  activeId,
  showBrandFooter = true,
}: {
  activeId?: string;
  showBrandFooter?: boolean;
}) {
  const navigate = useNavigate();
  const trails = useWorkStore((s) => s.trails);
  const activeProjectId = useWorkStore((s) => s.activeProjectId);
  const projects = useWorkStore((s) => s.projects);
  const search = useWorkStore((s) => s.search);
  const setSearch = useWorkStore((s) => s.setSearch);
  const startTrail = useWorkStore((s) => s.startTrail);
  const renameTrail = useWorkStore((s) => s.renameTrail);
  const [editing, setEditing] = useState<Trail | null>(null);
  const [title, setTitle] = useState("");

  const project = projects.find((p) => p.id === activeProjectId) ?? projects[0]!;
  const projectTrails = useMemo(
    () => trails.filter((t) => t.projectId === activeProjectId),
    [trails, activeProjectId],
  );
  const groups = useMemo(() => groupTrails(projectTrails, search), [projectTrails, search]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 px-3 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight">{project.name}</p>
          <p className="text-[11px] text-muted-foreground">Chats</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11 text-foreground md:size-8"
          aria-label="New chat"
          onClick={() => {
            const id = startTrail();
            void navigate({ to: "/trails/$trailId", params: { trailId: id } });
          }}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="px-3 pb-3">
        <label className="flex h-11 items-center gap-2 rounded-lg bg-muted px-2.5 shadow-hairline md:h-10">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
        <Section label="Pinned" trails={groups.pinned} activeId={activeId} onRename={(t) => { setEditing(t); setTitle(t.title); }} />
        <Section label="Today" trails={groups.today} activeId={activeId} onRename={(t) => { setEditing(t); setTitle(t.title); }} />
        <Section label="Yesterday" trails={groups.yesterday} activeId={activeId} onRename={(t) => { setEditing(t); setTitle(t.title); }} />
        <Section label="Earlier" trails={groups.earlier} activeId={activeId} onRename={(t) => { setEditing(t); setTitle(t.title); }} />
        {!projectTrails.length ? (
          <p className="px-2.5 py-6 text-sm text-muted-foreground">No chats yet. Start one — it stays with the project on this device.</p>
        ) : null}
      </div>

      {showBrandFooter ? (
        <div className="border-t border-border px-4 py-3">
          <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">InnerAnimalMedia</p>
          <p className="mt-0.5 text-xs text-clay">Studio</p>
        </div>
      ) : null}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>The name appears in your chat list.</DialogDescription>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (editing) renameTrail(editing.id, title);
              setEditing(null);
            }}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProjectsPanel() {
  const navigate = useNavigate();
  const projects = useWorkStore((s) => s.projects);
  const trails = useWorkStore((s) => s.trails);
  const activeProjectId = useWorkStore((s) => s.activeProjectId);
  const createProject = useWorkStore((s) => s.createProject);
  const renameProject = useWorkStore((s) => s.renameProject);
  const deleteProject = useWorkStore((s) => s.deleteProject);
  const setActiveProject = useWorkStore((s) => s.setActiveProject);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Project | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium tracking-tight">Projects</p>
          <p className="text-[11px] text-muted-foreground">Workspaces with files, git, and ship targets</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11 text-foreground md:size-8"
          aria-label="New project"
          onClick={() => {
            setName("");
            setNewOpen(true);
          }}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
        {projects.map((item) => (
          <div
            key={item.id}
            className={cn(
              "group mb-0.5 flex items-center rounded-lg",
              item.id === activeProjectId ? "bg-muted" : "hover:bg-muted/60",
            )}
          >
            <button
              type="button"
              className="flex min-h-11 min-w-0 flex-1 flex-col px-2.5 py-2 text-left md:min-h-0"
              onClick={() => {
                setActiveProject(item.id);
                void navigate({ to: "/trails" });
              }}
            >
              <span className="truncate text-sm">{item.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {item.files.length} files · {trails.filter((t) => t.projectId === item.id).length} chats
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="mr-1 size-11 md:size-8"
                  aria-label={`Project actions for ${item.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setRenaming(item);
                    setName(item.name);
                  }}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  disabled={projects.length <= 1}
                  onSelect={() => deleteProject(item.id)}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>A workspace with files, git, and ship targets.</DialogDescription>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const id = createProject(name || "Untitled");
              setNewOpen(false);
              void navigate({ to: "/trails" });
              void id;
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renaming)} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>The name is local to this studio.</DialogDescription>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming) renameProject(renaming.id, name);
              setRenaming(null);
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
