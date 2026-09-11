import { Link } from "@tanstack/react-router";
import { navLinks } from "@/data/portfolio";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-sidebar text-bone">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-display text-3xl tracking-tight">InnerAnimalMedia</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-clay">Independent studio for brand, product, and intelligent agents. Louisiana, and wherever the brief lives.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-8">
            <div>
              <p className="text-xs tracking-[0.16em] text-clay uppercase">Index</p>
              <ul className="mt-3 space-y-2">
                {navLinks.map((link) => (
                  <li key={link.href}><a href={link.href} className="text-sm text-stone transition-colors hover:text-bone">{link.label}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs tracking-[0.16em] text-clay uppercase">Studio</p>
              <ul className="mt-3 space-y-2">
                <li><Link to="/agentsam" className="text-sm text-stone transition-colors hover:text-bone">AgentSam Work</Link></li>
                <li><Link to="/trails" className="text-sm text-stone transition-colors hover:text-bone">Trails</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-border pt-6 text-xs tracking-wide text-clay sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 InnerAnimalMedia. All rights reserved.</p>
          <p>simple.inneranimalmedia.com</p>
        </div>
      </div>
    </footer>
  );
}
