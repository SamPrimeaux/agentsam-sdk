import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/tickets")({
  component: TicketsRoute,
});

function TicketsRoute() {
  return <LocalStudioWorkPage surface="tickets" />;
}
