(function () {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const sections = new Set();
  const enteredAt = new WeakMap();
  const engaged = new WeakSet();

  function emit(name, detail) {
    const payload = { ...detail, path: location.pathname, at: new Date().toISOString() };
    document.dispatchEvent(new CustomEvent(`heuristic:${name}`, { detail: payload }));
    window.AgentSamAnalytics?.track?.(name.replaceAll("-", "_"), payload);
  }

  function updateMotion() {
    const viewport = Math.max(1, innerHeight);
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const progress = clamp((viewport - rect.top) / (viewport + rect.height), 0, 1);
      const intensity = reduced ? 0 : clamp(Number(section.dataset.hMotionIntensity || 0.35), 0, 1);
      section.style.setProperty("--h-section-progress", progress.toFixed(4));
      section.style.setProperty("--h-section-shift", `${((progress - 0.5) * intensity * 44).toFixed(2)}px`);
      section.style.setProperty("--h-section-blur", `${(Math.max(0, progress - 0.62) * intensity * 8).toFixed(2)}px`);
    }
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const section = entry.target;
      const id = section.dataset.hSectionId || section.id || section.dataset.hSection;
      if (entry.isIntersecting) {
        if (!enteredAt.has(section)) {
          enteredAt.set(section, performance.now());
          emit("section-impression", { sectionId: id, sectionType: section.dataset.hSection });
        }
        const header = section.dataset.hHeader;
        if (header) document.documentElement.dataset.hHeaderMode = header;
      } else if (enteredAt.has(section) && !engaged.has(section)) {
        const durationMs = Math.round(performance.now() - enteredAt.get(section));
        if (durationMs >= 1200) {
          engaged.add(section);
          emit("section-engaged", { sectionId: id, sectionType: section.dataset.hSection, durationMs });
        }
      }
    }
  }, { threshold: [0.15, 0.55] });

  function discoverSections() {
    document.querySelectorAll("[data-h-section]").forEach((section) => {
      if (sections.has(section)) return;
      sections.add(section);
      observer.observe(section);
    });
    updateMotion();
  }

  discoverSections();
  document.addEventListener("heuristic:refresh", discoverSections);

  if (sections.size) {
    let ticking = false;
    addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { updateMotion(); ticking = false; });
    }, { passive: true });
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-h-product], [data-h-collection], [data-h-action]");
    if (!target) return;
    emit("commerce-click", {
      product: target.dataset.hProduct || null,
      collection: target.dataset.hCollection || null,
      action: target.dataset.hAction || "navigate",
      destination: target.getAttribute("href") || null,
    });
  });
})();
