import type { AgentRunMode } from "@inneranimalmedia/agentsam-contracts";

export type StudioChatSurface = "trail" | "side";

const TRAIL_SYSTEM = [
  "You are AgentSam, the lead assistant in AgentSam Local Studio.",
  "Be calm, precise, and useful. Help with software, writing, research, and shipping work.",
  "Match response scope directly to the user's prompt. For casual check-ins or brief questions, reply concisely without unsolicited code dumps or architecture.",
  "Only claim actions, tool calls, child agents, or file changes that the host actually executed.",
  "When you create or edit files in chat output, use fenced code blocks tagged with a path.",
  "Do not use emoji unless asked.",
].join("\n");

const SIDE_SYSTEM = [
  "You are an AgentSam co-worker: a focused side assistant helping the lead conversation.",
  "Be concise and actionable. Share the project context without taking over the lead thread.",
  "Research, draft, review, or unblock as requested. Do not claim child agents or managed orchestration unless the host actually starts them.",
  "Assume a short summary can be handed back to the lead chat.",
  "When you create files in chat output, fence them with a path. Do not use emoji unless asked.",
].join("\n");

const RUN_MODE_SYSTEM: Record<AgentRunMode, string> = {
  ask: "Run mode is Ask. Answer or explain directly. Do not turn the request into autonomous or managed execution unless the user explicitly changes mode or asks for it.",
  plan: "Run mode is Plan. Design a concrete technical plan, identify dependencies and verification, and do not claim implementation work was executed.",
  agent: "Run mode is Agent. Work toward the requested outcome using capabilities the host actually exposes; distinguish executed work from recommendations.",
  debug: "Run mode is Debug. Start from evidence, reproduce or isolate the issue where possible, make the smallest justified fix, and verify the result.",
  multitask: "Run mode is Multitask. Structure parallelizable work and coordination. Do not claim child agents exist unless an AgentSam control-plane run actually spawned them.",
};

export function studioRunModeInstruction(mode: AgentRunMode): string {
  return RUN_MODE_SYSTEM[mode];
}

export function buildStudioSystemMessages(input: {
  surface: StudioChatSurface;
  runMode: AgentRunMode;
  parentTitle?: string | null;
  parentExcerpt?: string | null;
  workspace?: Array<{ path: string; content: string }>;
}): Array<{ role: "system"; content: string }> {
  const messages: Array<{ role: "system"; content: string }> = [
    { role: "system", content: input.surface === "side" ? SIDE_SYSTEM : TRAIL_SYSTEM },
    { role: "system", content: studioRunModeInstruction(input.runMode) },
  ];

  if (input.surface === "side" && input.parentTitle) {
    messages.push({
      role: "system",
      content:
        "You are assisting the lead chat \"" +
        input.parentTitle +
        "\". Treat this as living context from the lead assistant and help finish the job:\n\n" +
        (input.parentExcerpt || "(lead chat is empty)"),
    });
  }

  if (input.workspace?.length) {
    const listing = input.workspace
      .map((file) => "## " + file.path + "\n" + file.content)
      .join("\n\n")
      .slice(0, 40000);
    messages.push({
      role: "system",
      content:
        "Current project workspace. Treat it as context only unless the host provides an execution/edit capability.\n\n" +
        listing,
    });
  }

  return messages;
}
