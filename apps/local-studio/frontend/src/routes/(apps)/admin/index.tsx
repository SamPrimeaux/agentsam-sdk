import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/admin/")({ component: () => <Navigate to="/admin/home" replace /> });
