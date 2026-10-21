const titleNode = document.querySelector("#page-title");
const hostNode = document.querySelector("#page-host");
const selectionNode = document.querySelector("#selection");
const button = document.querySelector("#share");
const statusNode = document.querySelector("#status");

let sharedPage = null;

async function readCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
      titleNode.textContent = "This page can’t be shared";
      hostNode.textContent = "Open a regular website tab first.";
      return;
    }
    const [{ result: selection = "" } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? "",
    });
    sharedPage = {
      url: tab.url,
      title: (tab.title || "").slice(0, 300),
      selection: String(selection).slice(0, 4000),
    };
    titleNode.textContent = sharedPage.title || new URL(tab.url).hostname;
    hostNode.textContent = new URL(tab.url).hostname;
    if (sharedPage.selection.trim()) {
      selectionNode.hidden = false;
      selectionNode.textContent = sharedPage.selection;
    }
    button.disabled = false;
  } catch {
    titleNode.textContent = "Can’t read this tab";
    hostNode.textContent = "Chrome restricts access to this page.";
  }
}

button.addEventListener("click", () => {
  if (!sharedPage) return;
  const params = new URLSearchParams({
    url: sharedPage.url,
    title: sharedPage.title,
    selection: sharedPage.selection,
    request: crypto.randomUUID(),
  });
  const handoff = `agentsamstudio://chrome/share?${params.toString()}`;
  statusNode.textContent = "Opening Local Studio…";
  window.location.assign(handoff);
});

void readCurrentTab();
