import { createFileRoute, redirect } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

type CollaborateSearch = {
  seg?: string;
};

export const Route = createFileRoute("/(apps)/collaborate")({
  validateSearch: (search: Record<string, unknown>): CollaborateSearch => ({
    seg: typeof search.seg === "string" ? search.seg : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.seg === "tickets" || search.seg === "tasks") {
      throw redirect({ to: "/tickets" });
    }
  },
  component: CollaborateRoute,
});

function CollaborateRoute() {
  return <LocalStudioWorkPage surface="calendar" />;
}
