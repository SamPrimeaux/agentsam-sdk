import { createFileRoute } from "@tanstack/react-router";
import { DatabasePage } from "@/components/database/DatabasePage";

export const Route = createFileRoute("/(apps)/database")({
  component: DatabasePage,
});
