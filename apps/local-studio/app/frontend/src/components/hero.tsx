import { Link } from "@tanstack/react-router";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" style={{ perspective: "640px" }}>
        <div className="hero-grid absolute inset-x-[-10%] top-[30%] h-[120%] opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/40 to-bg" />
      </div>
      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
        <p className="text-xs font-medium tracking-[0.18em] text-stone uppercase">All systems operational</p>
        <h1 className="mt-5 max-w-4xl font-display text-[2.5rem] leading-[1.08] tracking-[-0.03em] text-bone sm:text-6xl lg:text-[4.4rem]">
          We design and build digital products that feel as capable as they look.
        </h1>
        <p className="mt-8 max-w-xl text-base leading-relaxed text-clay sm:text-lg">
          From dream to design — InnerAnimalMedia is the solution. Edge-first infrastructure, AI-native products, and design that converts.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a href="#work" className="inline-flex h-11 items-center rounded-md bg-bone px-5 text-sm font-medium text-bg transition-colors duration-150 hover:bg-stone">
            View our work
          </a>
          <Link to="/agentsam" className="inline-flex h-11 items-center rounded-md px-5 text-sm text-stone transition-colors hover:text-bone">
            Open studio
          </Link>
        </div>
      </div>
    </section>
  );
}
