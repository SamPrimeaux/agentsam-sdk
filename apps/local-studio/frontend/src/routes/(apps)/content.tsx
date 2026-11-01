import { createFileRoute, redirect } from "@tanstack/react-router";

type ContentSearch = { kind?: string };

function mediaDestination(kind?: string) {
  if (kind === "image" || kind === "images") return "/media/images";
  if (kind === "video" || kind === "videos") return "/media/videos";
  if (kind === "model" || kind === "models") return "/media/models";
  if (kind === "file" || kind === "files") return "/media/files";
  return "/media";
}

/** Legacy Content routes fold into Media without leaving the authenticated shell. */
export const Route = createFileRoute("/(apps)/content")({
  validateSearch: (search: Record<string, unknown>): ContentSearch => ({
    kind: typeof search.kind === "string" ? search.kind : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: mediaDestination(search.kind) as never });
  },
  component: () => null,
});
