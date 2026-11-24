import { createFileRoute } from "@tanstack/react-router";
import { CmsStructurePage } from "@/components/cms/CmsStructurePage";

export const Route = createFileRoute("/(apps)/admin/structure")({
  validateSearch: (params: Record<string, unknown>) => ({
    site_id: typeof params.site_id === "string" ? params.site_id : undefined,
    site_slug: typeof params.site_slug === "string" ? params.site_slug : undefined,
    scope: params.scope === "platform" ? "platform" as const : "website" as const,
  }),
  component: function CmsStructureRoute() {
    const search = Route.useSearch();
    return <CmsStructurePage initialSiteId={search.site_id} initialSiteSlug={search.site_slug} initialScope={search.scope} />;
  },
});

