import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/admin")({ component: () => <Outlet /> });
