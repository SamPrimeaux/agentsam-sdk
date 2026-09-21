import { createFileRoute } from "@tanstack/react-router";
import { AgentSamPage } from "../../../agentsam/AgentSamPage";
export const Route = createFileRoute("/(apps)/agentsam")({ component: AgentSamPage });
