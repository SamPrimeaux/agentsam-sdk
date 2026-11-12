import { GoalGuruPanel, createGoalGuruHttpTransport } from "@inneranimalmedia/agentsam-goalguru";
import "@inneranimalmedia/agentsam-goalguru/theme.css";
import { useWorkStore } from "@/lib/work/store";

const request = createGoalGuruHttpTransport("/api/studio/living-plan");

export function GoalGuruHost({ legacyGoal, onLegacyImported, mode = "panel" }: {
  legacyGoal?: { title: string; preview?: string } | null;
  onLegacyImported?: () => void;
  mode?: "panel" | "page";
}) {
  const continueInWork = (prompt: string) => {
    const state = useWorkStore.getState();
    const id = state.startChat();
    state.setDraft(id, prompt);
    state.setSideOpen(false);
    state.setWorkSurface("chat");
    window.dispatchEvent(new CustomEvent("agentsam:navigate", {
      detail: { to: "/chats/$chatId", params: { chatId: id } },
    }));
  };
  return <GoalGuruPanel request={request} mode={mode} onContinue={continueInWork}
    legacyGoal={legacyGoal} onLegacyImported={onLegacyImported} />;
}
