import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { StudioMark } from "@/components/mark";
import { navLinks } from "@/data/portfolio";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header className={cn("sticky top-0 z-40 bg-bg/90 backdrop-blur-md transition-[box-shadow] duration-200 ease-out", scrolled && "shadow-[0_1px_0_0_var(--color-border)]")}>
      <a href="#work" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-bone focus:px-3 focus:py-2 focus:text-sm focus:text-bg">Skip to work</a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-[4.5rem] sm:px-8">
        <a href="#top" className="flex items-center gap-2 text-bone">
          <StudioMark className="size-6" />
          <span className="font-display text-lg tracking-tight sm:text-xl">InnerAnimalMedia</span>
        </a>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-clay transition-colors duration-150 hover:text-bone">{link.label}</a>
          ))}
          <Link to="/agentsam" className="text-sm text-stone transition-colors duration-150 hover:text-bone">Studio</Link>
        </nav>
        <button type="button" className="relative flex size-11 items-center justify-center rounded-md text-bone md:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)}>
          {open ? <X className="size-5" strokeWidth={1.6} /> : <Menu className="size-5" strokeWidth={1.6} />}
        </button>
      </div>
      <div id="mobile-nav" hidden={!open} className={cn("fixed inset-x-0 top-16 bottom-0 z-30 bg-bg px-5 pt-8 md:hidden", open ? "block" : "hidden")}>
        <nav className="flex flex-col gap-2" aria-label="Mobile">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="flex min-h-14 items-center border-b border-border font-display text-3xl tracking-tight text-bone">{link.label}</a>
          ))}
          <Link to="/agentsam" onClick={() => setOpen(false)} className="flex min-h-14 items-center border-b border-border font-display text-3xl tracking-tight text-bone">Studio</Link>
        </nav>
      </div>
    </header>
  );
}
