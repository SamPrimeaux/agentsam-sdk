import { createFileRoute } from "@tanstack/react-router";
import { Palette } from "lucide-react";

export const Route = createFileRoute("/(apps)/settings/themes")({
  component: ThemesSettingsPage,
});

const PACKAGED_THEMES = [
  {
    id: "theme.shinshu-site",
    slug: "shinshu-site",
    name: "Shinshu Solutions",
    package: "@inneranimalmedia/theme-shinshu-site",
    icon: "theme" as const,
    category: "Professional",
  },
  {
    id: "theme.companions-site",
    slug: "companions-site",
    name: "Companions of Caddo",
    package: "@inneranimalmedia/theme-companions-site",
    icon: "theme" as const,
    category: "Nonprofit",
  },
  {
    id: "theme.fuelnfree-site",
    slug: "fuelnfree-site",
    name: "Fuel N Free",
    package: "@inneranimalmedia/theme-fuelnfree-site",
    icon: "theme" as const,
    category: "Community",
  },
  {
    id: "theme.floors-site",
    slug: "floors-site",
    name: "Floors",
    package: "@inneranimalmedia/theme-floors-site",
    icon: "theme" as const,
    category: "Trade",
  },
  {
    id: "theme.handyman-site",
    slug: "handyman-site",
    name: "Handyman",
    package: "@inneranimalmedia/theme-handyman-site",
    icon: "theme" as const,
    category: "Trade",
  },
  {
    id: "theme.insurance-site",
    slug: "insurance-site",
    name: "Insurance",
    package: "@inneranimalmedia/theme-insurance-site",
    icon: "theme" as const,
    category: "Professional",
  },
  {
    id: "theme.church-site",
    slug: "church-site",
    name: "Church",
    package: "@inneranimalmedia/theme-church-site",
    icon: "theme" as const,
    category: "Community",
  },
];

function ThemesSettingsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto p-4 md:p-6">
      <header className="mb-6 flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <Palette className="size-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-medium">Themes</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
            Packaged gallery themes with semantic icon key{" "}
            <span className="font-mono text-foreground">theme</span>. Brand is authority;
            theme is a projection. Preview opens the hosted gallery mount.
          </p>
        </div>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PACKAGED_THEMES.map((theme) => (
          <li key={theme.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {theme.icon} · {theme.category}
              </span>
            </div>
            <div>
              <h2 className="text-sm font-medium">{theme.name}</h2>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{theme.package}</p>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <a
                className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs hover:bg-muted"
                href={`/themes/${theme.slug}/`}
              >
                Gallery preview
              </a>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-lg bg-foreground px-3 text-xs font-medium text-background"
                onClick={() => {
                  void navigator.clipboard.writeText(`npm i ${theme.package}`);
                }}
              >
                Copy install
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
