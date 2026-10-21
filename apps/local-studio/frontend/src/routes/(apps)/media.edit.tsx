import { createFileRoute } from "@tanstack/react-router";

// /media owns the persistent MovieMode runtime. This child URL selects editor mode.
export const Route = createFileRoute("/(apps)/media/edit")({ component: () => null });
