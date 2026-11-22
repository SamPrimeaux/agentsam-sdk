import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/admin/samspeaks")({
  component: () => <iframe title="SamSpeaks" src="/samspeaks/" allow="microphone; autoplay; xr-spatial-tracking" className="block h-full min-h-0 w-full flex-1 border-0" />,
});
