export function About() {
  return (
    <section id="about" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="grid items-start gap-10 border-t border-border pt-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <figure className="mx-auto w-full max-w-md lg:max-w-none">
          <div className="overflow-hidden rounded-2xl bg-surface">
            <img src="/portrait.svg" alt="" className="framed aspect-[3/4] w-full object-cover" />
          </div>
          <figcaption className="mt-3 text-xs tracking-[0.12em] text-clay uppercase">InnerAnimalMedia · Louisiana</figcaption>
        </figure>
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-clay uppercase">About</p>
          <h2 className="mt-2 font-display text-4xl tracking-tight text-bone sm:text-5xl">Six disciplines. One team.</h2>
          <div className="mt-8 space-y-5 text-base leading-relaxed text-clay sm:text-[1.05rem]">
            <p>Strategy, design, development, content, and AI tooling — handled as one connected system. No handoffs. Edge-first infrastructure, AI-native products, and design that converts.</p>
            <p>We began as a UX practice and grew into a full studio: brand, product, and production on Cloudflare. AgentSam is the command center we built for ourselves — trails, dual agents, and ship from the same bench.</p>
          </div>
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
            <div><dt className="text-xs tracking-[0.14em] text-clay uppercase">Studio</dt><dd className="mt-1 text-sm text-bone">Louisiana & remote</dd></div>
            <div><dt className="text-xs tracking-[0.14em] text-clay uppercase">Focus</dt><dd className="mt-1 text-sm text-bone">Brand · product · agents</dd></div>
            <div><dt className="text-xs tracking-[0.14em] text-clay uppercase">Currently</dt><dd className="mt-1 text-sm text-bone">Taking 2026 work</dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}
