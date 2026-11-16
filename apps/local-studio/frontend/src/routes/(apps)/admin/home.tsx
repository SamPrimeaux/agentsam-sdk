import { createFileRoute } from "@tanstack/react-router";

/** The shared AgentSamShell renders the admin home experience for this path. */
export const Route = createFileRoute("/(apps)/admin/home")({ component: () => null });
