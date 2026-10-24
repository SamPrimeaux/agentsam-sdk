import { createFileRoute } from "@tanstack/react-router";
import { AgentSamPage } from "../../../../agentsam/AgentSamPage";

// Local Studio owns this route; the Ecommerce mount still owns its other admin routes.
export const Route = createFileRoute("/(apps)/admin/agentsam")({ component: AgentSamPage });
