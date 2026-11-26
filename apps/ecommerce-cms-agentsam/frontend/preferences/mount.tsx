import { createRoot } from "react-dom/client";
import { WebsiteNavigationSettings } from "./WebsiteNavigationSettings";

const element = document.getElementById("preferences-navigation");
if (element) {
  const root = createRoot(element);
  let currentSite: string | null = null;
  const sync = () => {
    const siteId = element.dataset.siteId || "";
    if (currentSite === siteId) return;
    currentSite = siteId;
    if (!siteId) {
      root.render(<p className="sp-menu-panel sp-menu-muted" role="status">Select a website to load its menus.</p>);
      return;
    }
    root.render(<WebsiteNavigationSettings key={siteId} siteId={siteId} onActivity={(dirty, saving) => {
      window.dispatchEvent(new CustomEvent("agentsam:preferences-navigation-activity", { detail: { siteId, dirty, saving } }));
    }} />);
  };
  new MutationObserver(sync).observe(element, { attributes: true, attributeFilter: ["data-site-id"] });
  sync();
}
