import { createFileRoute } from "@tanstack/react-router";
import { AgentSamPage } from "../../../../agentsam/AgentSamPage";

/** The existing AgentSam conversation; the ecommerce installation retains its own owned surface. */
export const Route = createFileRoute("/(apps)/admin/agentsam")({ component: AgentSamPage });
