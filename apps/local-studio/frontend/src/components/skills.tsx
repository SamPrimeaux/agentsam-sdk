import { skillGroups } from "@/data/portfolio";

export function Skills() {
  return (
    <section id="skills" className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="border-t border-border pt-10">
        <p className="text-xs font-medium tracking-[0.18em] text-clay uppercase">Capabilities</p>
        <h2 className="mt-2 max-w-2xl font-display text-4xl tracking-tight text-bone sm:text-5xl">What the studio holds</h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-clay">Strategy, design, and production as one bench — the rest is conversation.</p>
        <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {skillGroups.map((group) => (
            <div key={group.heading}>
              <h3 className="border-b border-border pb-3 text-xs font-medium tracking-[0.16em] text-stone uppercase">{group.heading}</h3>
              <ul className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <li key={item} className="font-display text-2xl tracking-tight text-bone">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
