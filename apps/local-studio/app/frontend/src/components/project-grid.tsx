import { useMemo, useState } from "react";
import { categories, projects, type CategoryFilter } from "@/data/portfolio";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProjectGrid() {
  const [filter, setFilter] = useState<CategoryFilter>("All");
  const visible = useMemo(
    () => (filter === "All" ? projects : projects.filter((p) => p.category === filter)),
    [filter],
  );
  const countLabel = `${visible.length} ${visible.length === 1 ? "work" : "works"}`;

  return (
    <section id="work" className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="flex flex-col gap-6 border-t border-border pt-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-clay uppercase">Index</p>
          <h2 className="mt-2 font-display text-4xl tracking-tight text-bone sm:text-5xl">Selected work</h2>
        </div>
        <p className="text-sm tabular-nums text-clay" aria-live="polite">{countLabel}</p>
      </div>
      <div className="mt-8 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filter by category">
        {categories.map((cat) => {
          const active = filter === cat;
          return (
            <Button key={cat} role="tab" aria-selected={active} variant={active ? "chipActive" : "chip"} size="chip" className="shrink-0" onClick={() => setFilter(cat)}>
              {cat}
            </Button>
          );
        })}
      </div>
      <ul className="mt-10 grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2">
        {visible.map((project, i) => {
          const inner = (
            <article className="group">
              <div className={cn("relative overflow-hidden rounded-xl bg-surface", project.featured && filter === "All" ? "aspect-[16/9]" : "aspect-[4/3]")}>
                <img src={project.image} alt="" className="framed h-full w-full object-cover transition-transform duration-500 ease-out-soft motion-safe:group-hover:scale-[1.03]" loading={i < 2 ? "eager" : "lazy"} />
                <div className="pointer-events-none absolute inset-0 hidden flex-col justify-end bg-gradient-to-t from-bg/85 via-bg/25 to-transparent p-5 opacity-0 transition-opacity duration-200 ease-out sm:p-7 md:flex md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  <p className="max-w-md text-sm leading-relaxed text-bone">{project.description}</p>
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-4">
                <h3 className="font-display text-2xl tracking-tight text-bone">{project.title}</h3>
                <span className="shrink-0 text-xs tracking-[0.14em] text-clay uppercase">{project.category}</span>
              </div>
              <p className="mt-1 text-sm text-clay">
                {project.role}
                <span className="mx-2 text-border" aria-hidden>/</span>
                <span className="tabular-nums">{project.year}</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-clay md:hidden">{project.description}</p>
            </article>
          );
          return (
            <li key={project.slug} className={cn(project.featured && filter === "All" && "sm:col-span-2")}>
              {project.href ? <a href={project.href} className="block">{inner}</a> : inner}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
