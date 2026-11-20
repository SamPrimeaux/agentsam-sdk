import { useWorkStore } from "@/lib/work/store";

export type ArtifactCreationKind = "docs" | "slides" | "sheets" | "design" | "data" | "whiteboard";

const CREATION_PROMPTS: Record<Exclude<ArtifactCreationKind, "design" | "whiteboard">, string> = {
  docs: "Start a new document artifact. Ask me what the document needs to accomplish and who it is for, then help me create an editable document that can be saved to Artifacts.",
  slides: "Start a new presentation artifact. Ask me about the audience, purpose, and key message, then help me build an editable slide deck that can be saved to Artifacts.",
  sheets: "Start a new spreadsheet artifact. Ask what information I need to organize and which calculations matter, then help me build an editable workbook that can be saved to Artifacts.",
  data: "Start a new data artifact. Ask which verified data source, measures, and audience this dashboard should serve. Do not invent data; help me build an evidence-backed dashboard that can be saved to Artifacts.",
};

/**
 * Open the appropriate creative surface without creating a second assistant.
 * Text-first artifact types start a lead-chat draft; Canvas types open the
 * existing specialist editor as a Side Stage tab.
 */
export function startArtifactCreation(kind: ArtifactCreationKind) {
  const work = useWorkStore.getState();

  if (kind === "design" || kind === "whiteboard") {
    const title = kind === "design" ? "Design" : "Whiteboard";
    const tabId = work.openSideTab("design", {
      title,
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
