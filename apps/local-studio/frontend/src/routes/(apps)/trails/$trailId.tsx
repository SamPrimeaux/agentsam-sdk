import { createFileRoute } from "@tanstack/react-router";
import { AgentSamPage } from "../../../../agentsam/AgentSamPage";
export const Route = createFileRoute("/(apps)/trails/$trailId")({ component: TrailPage });
function TrailPage() { const { trailId } = Route.useParams(); return <AgentSamPage conversationId={trailId} />; }
