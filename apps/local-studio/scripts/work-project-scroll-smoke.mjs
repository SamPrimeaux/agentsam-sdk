/**
 * Regression guard for Work project scrolling. Runs against the portable
 * Work package stylesheet and the standalone shell markup contract.
 *
 * Both the progress ring's inner disc and the Work / Project breadcrumb
 * must move with their owning content when the project body scrolls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const shell = readFileSync(resolve(repo, "packages/agentsam-work/src/frontend/WorkShell.tsx"), "utf8");
const css = readFileSync(resolve(repo, "packages/agentsam-work/src/frontend/theme.css"), "utf8");

// The breadcrumb must be a child of the actual scrolling element, not a sibling.
assert.match(shell, /<div className="agentsam-work-stage__body">\s*<header className="agentsam-work-stage__topbar">/);
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 760 } });
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body style="margin:0">
        <div class="agentsam-work agentsam-work-shell" data-presentation="standalone" data-right-rail="false" style="height:760px">
          <aside class="agentsam-work-mini-nav"></aside>
          <section class="agentsam-work-stage">
            <div class="agentsam-work-stage__body">
              <header class="agentsam-work-stage__topbar"><span>Work</span><span>/</span><span>Project</span></header>
              <div class="aw-page">
                <div class="aw-project-detail">
                  <div class="aw-project-detail__layout">
                    <main class="aw-project-detail__main"><h1>Agent Sam SDK</h1><div style="height:1100px">Project content</div></main>
                    <aside class="aw-project-detail__inspector">
                      <div class="aw-project-inspector__progress"><div class="aw-project-inspector__ring" style="--value:10%;--ring:blue"><strong>10%</strong></div><span>Perceived progress</span></div>
                      <div class="aw-project-inspector__progress"><div class="aw-project-inspector__ring" style="--value:10%;--ring:green"><strong>10%</strong></div><span>Shipped tickets</span></div>
                    </aside>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <nav class="agentsam-work-bottom-nav"><button>Projects</button></nav>
        </div>
      </body></html>`);
    await page.addStyleTag({ content: css });
    const geometry = await page.evaluate(() => {
      const scroller = document.querySelector(".agentsam-work-stage__body");
      const breadcrumb = scroller.querySelector(".agentsam-work-stage__topbar");
      const rings = [...scroller.querySelectorAll(".aw-project-inspector__ring")];
      const before = breadcrumb.getBoundingClientRect().top;
      const beforeRing = rings[0].getBoundingClientRect().top;
      scroller.scrollTop = 220;
      const after = breadcrumb.getBoundingClientRect().top;
      const afterRing = rings[0].getBoundingClientRect().top;
      return {
        scrollTop: scroller.scrollTop,
        breadcrumbTravel: before - after,
        ringTravel: beforeRing - afterRing,
        ringPositions: rings.map(el => getComputedStyle(el).position),
        innerDiscPositions: rings.map(el => getComputedStyle(el, "::before").position),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    assert.ok(geometry.scrollTop >= 210, `${width}px: expected scrollable project content ${JSON.stringify(geometry)}`);
    assert.ok(geometry.breadcrumbTravel >= 210, `${width}px: breadcrumb must scroll away ${JSON.stringify(geometry)}`);
    assert.ok(geometry.ringTravel >= 210, `${width}px: ring must travel with project card ${JSON.stringify(geometry)}`);
    assert.deepEqual(geometry.ringPositions, ["relative", "relative"], `${width}px: rings must anchor their inner discs`);
    assert.deepEqual(geometry.innerDiscPositions, ["absolute", "absolute"], `${width}px: inner discs must stay inside rings`);
    assert.ok(geometry.scrollWidth <= geometry.viewportWidth + 1, `${width}px: no page overflow`);
    console.log(`PROJECT_SCROLL_PASS ${width}px ${JSON.stringify(geometry)}`);
    await page.close();
  }
} finally {
  await browser.close();
}
