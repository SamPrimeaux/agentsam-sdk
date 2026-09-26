import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

type CollaborateSearch = {
  seg?: string;
};

export const Route = createFileRoute("/(apps)/collaborate")({
  validateSearch: (search: Record<string, unknown>): CollaborateSearch => ({
    seg: typeof search.seg === "string" ? search.seg : undefined,
  }),
  component: CollaborateRoute,
});

function CollaborateRoute() {
  const { seg } = Route.useSearch();
  const surface = seg === "tickets" || seg === "tasks" ? "tickets" : "calendar";
  return <LocalStudioWorkPage surface={surface} />;
}
