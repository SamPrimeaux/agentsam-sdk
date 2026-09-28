import { createFileRoute } from "@tanstack/react-router";
import { RuntimeManagerPage } from "@/components/runtime/RuntimeManagerPage";

export const Route = createFileRoute("/(apps)/settings/runtime")({ component: RuntimeManagerPage });
