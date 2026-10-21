# AgentSam Tab Handoff for Chrome

This unpacked Manifest V3 extension is a companion for the **Local Studio desktop app's AgentSam Browser profile**. It is not a browser runtime and does not import or run other Chrome extensions inside Local Studio.

## What it shares

After you click the extension action, it reads the active HTTP or HTTPS tab and shows its URL, title, and current text selection. Clicking **Open in Local Studio** passes those three fields through the registered `agentsamstudio://` deep-link scheme. Local Studio places the page information in the active chat's composer draft. Review or edit it before sending.

The extension requests only `activeTab` and `scripting`. It does not request persistent access to all sites, read cookies, inspect passwords, send page data automatically, or submit a chat.

## Install locally

1. Build/install the Local Studio desktop app so its `agentsamstudio://` deep link is registered.
2. In Local Studio's Browser panel, choose **Extensions**. This opens the separate AgentSam Chrome profile at `chrome://extensions/`.
3. Turn on **Developer mode**, choose **Load unpacked**, and select this `chrome-extension` directory.
4. Pin **AgentSam Tab Handoff** to the toolbar. Open a normal web page, click the extension, review the shown fields, then choose **Open in Local Studio**.

This is a developer-loaded extension. It has not been submitted to the Chrome Web Store. AgentSam Browser uses its own Chrome profile, separate from your everyday Chrome profile. Install any extensions you need into the AgentSam profile from the Chrome Web Store; extensions in your everyday profile are not automatically copied over.

## Current limits

- The recipient is the packaged Local Studio desktop app, not the in-app iframe or a hosted Local Studio page.
- Only URL, title, and selected text are transferred. There is no full-page scrape, screenshot, browser automation, downloads, permissions manager, profile management, or extension management.
- Some Chrome pages (such as `chrome://` pages and the Chrome Web Store) cannot be read by extensions; the popup reports that restriction.
