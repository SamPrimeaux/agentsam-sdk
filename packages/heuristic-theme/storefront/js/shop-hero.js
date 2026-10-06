(function () {
  const hero = document.getElementById("fnfShopHero");
  const mv = document.getElementById("fnfShopMV");
  const glbWrap = document.querySelector(".fnf-shop-glb");
  const parallaxLayers = hero ? hero.querySelectorAll("[data-parallax-speed]") : [];

  const GLB_SRC = "/media/3d-models/emblem-of-elegance.glb";
  const prefersReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (mv && mv.getAttribute("src") !== GLB_SRC) {
    mv.setAttribute("src", GLB_SRC);
  }

  let heroProgress = 0;
  let smoothProgress = 0;
  let ticking = false;

  function heroScrollProgress() {
    if (!hero) return 0;
    const rect = hero.getBoundingClientRect();
    const total = Math.max(hero.offsetHeight - window.innerHeight * 0.35, 1);
    const scrolled = Math.min(Math.max(-rect.top, 0), total);
    return scrolled / total;
  }

  function updateParallax(progress) {
    parallaxLayers.forEach((layer) => {
      const speed = parseFloat(layer.dataset.parallaxSpeed || "0.2");
      const y = progress * speed * 120;
      layer.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(1.06)`;
    });
  }

  function updateGlb(progress) {
    if (!mv || prefersReduce) return;

    const theta = 42 + progress * 28;
    const phi = 62 - progress * 10;
    const radius = 112 - progress * 6;

    mv.cameraOrbit = `${theta.toFixed(2)}deg ${phi.toFixed(2)}deg ${radius.toFixed(1)}%`;

    if (glbWrap) {
      const lift = progress * -22;
      const scale = 1 + progress * 0.025;
      glbWrap.style.transform = `translate3d(0, ${lift.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    }
  }

  function updateHeaderTone() {
    if (!hero) return;
    const inHero = hero.getBoundingClientRect().bottom > window.innerHeight * 0.42;
    document.body.classList.toggle("fnf-shop-at-hero", inHero);
  }

  function frame() {
    heroProgress = heroScrollProgress();
    smoothProgress += (heroProgress - smoothProgress) * 0.12;

    updateParallax(smoothProgress);
    updateGlb(smoothProgress);
    updateHeaderTone();

    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(frame);
      ticking = true;
    }
  }

  if (hero) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    frame();
  }

  if (mv) {
    mv.addEventListener("load", () => {
      if (!prefersReduce) mv.cameraOrbit = "42deg 62deg 112%";
    });
  }
})();
