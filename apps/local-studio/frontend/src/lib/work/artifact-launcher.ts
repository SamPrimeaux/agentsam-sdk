import { useWorkStore } from "@/lib/work/store";

export type ArtifactCreationKind = "docs" | "slides" | "sheets" | "design" | "data" | "whiteboard";

const BRAND_GUIDELINES_PROMPT = "Mine the current brand and selected project using the existing AgentSam Brand CLI and authorized repository/source tools. Inspect real logo marks, typography and font assets, color tokens, iconography, components, themes, and existing brand packs. Return an evidence-backed inventory with exact source paths and provenance; distinguish verified findings from gaps or inference. Then build an editable brand-guidelines presentation in this Slides workspace. Use the CLI through AgentSam's GUI workflow, not a code editor. Preserve source files and do not publish or overwrite anything without my approval.";

const CREATION_PROMPTS: Record<Exclude<ArtifactCreationKind, "design" | "whiteboard" | "data" | "slides">, string> = {
  docs: "Start a new document artifact. Ask me what the document needs to accomplish and who it is for, then help me create an editable document that can be saved to Artifacts.",
  sheets: "Start a new spreadsheet artifact. Ask what information I need to organize and which calculations matter, then help me build an editable workbook that can be saved to Artifacts.",
};

/**
 * Open the appropriate creative surface without creating a second assistant.
 * Slides enters the native, account-backed Canvas in Side Stage and uses the
 * existing AgentSam conversation for brand-source mining and CLI operations.
 * Text-first artifact types start a lead-chat draft; Canvas types open the
 * existing specialist editor as a Side Stage tab.
 */
export function startArtifactCreation(kind: ArtifactCreationKind) {
  const work = useWorkStore.getState();

  // Data has its own native creation stage, not a chat-prefill or browser redirect.
  if (kind === "data") {
    const chatId = work.startChat();
    work.setActiveChat(chatId);
    return work.openSideTab("data", { title: "Data", url: "/data?format=dashboard", ephemeral: false, parentChatId: chatId });
  }

  if (kind === "slides") {
    const chatId = work.startChat();
    work.setActiveChat(chatId);
    work.setDraft(chatId, BRAND_GUIDELINES_PROMPT);
    const tabId = work.openSideTab("design", {
      title: "Slides",
      parentChatId: chatId,
      ephemeral: false,
      url: "/canvas?host=slides&template=brand-guidelines",
    });
    work.setActiveSideTab(tabId);
    work.setSideOpen(true);
    return tabId;
  }

  if (kind === "design" || kind === "whiteboard") {
    const title = kind === "design" ? "Design" : "Whiteboard";
    const chatId = work.startChat();
    work.setActiveChat(chatId);
    const tabId = work.openSideTab("design", {
      title,
      parentChatId: chatId,
      ephemeral: false,
      url: "/canvas?host=" + kind + "&template=" + kind,
    });
    work.setActiveSideTab(tabId);
    work.setSideOpen(true);
    return tabId;
  }

  const chatId = work.startChat();
  work.setDraft(chatId, CREATION_PROMPTS[kind]);
  work.setActiveChat(chatId);

  // Keep the library available beside the lead conversation when creation
  // starts from a full-page Artifacts view rather than an existing Side Stage.
  const current = useWorkStore.getState();
  if (!current.sideOpen) {
    const tabId = current.openSideTab("artifacts", { title: "Artifacts", ephemeral: false });
    current.setActiveSideTab(tabId);
  }
  return chatId;
}
