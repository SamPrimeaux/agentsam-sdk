import { createFileRoute } from "@tanstack/react-router";
import { AgentSamFormsPage } from "@/components/forms/AgentSamFormsPage";

/** First-party installable Forms app, with account-owned draft and submission storage. */
export const Route = createFileRoute("/(apps)/forms")({
  component: AgentSamFormsPage,
});
