import { createFileRoute } from "@tanstack/react-router";

/** The parent MovieMode editor remains mounted as its tool mode changes. */
export const Route = createFileRoute("/(apps)/admin/moviemode/edit")({ component: () => null });
