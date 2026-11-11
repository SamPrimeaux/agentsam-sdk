/* Mount the existing CMS shell on public pages. */
(async () => {
  async function mount(region) {
    const slot = document.getElementById(`asbd-${region}-mount`);
    if (!slot) return;
    try {
      const response = await fetch(`/site/global/asbd-${region}.html`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const fragment = document.createElement('template');
      fragment.innerHTML = await response.text();
      const scripts = [...fragment.content.querySelectorAll('script')];
      scripts.forEach(script => script.remove());
      slot.replaceChildren(fragment.content);
      for (const source of scripts) {
        const script = document.createElement('script');
        for (const { name, value } of source.attributes) script.setAttribute(name, value);
        script.textContent = source.textContent;
        slot.append(script);
      }
    } catch (error) {
      console.error(`AgentSam ${region} failed to load`, error);
      const link = document.createElement('a');
      link.href = region === 'header' ? '/' : '/docs/sam/';
      link.textContent = region === 'header' ? 'AgentSam home' : 'AgentSam documentation';
      slot.replaceChildren(link);
    }
  }
  await Promise.all(['header', 'footer'].map(mount));
  window.AsbdTheme?.syncFromDocument();
})();
