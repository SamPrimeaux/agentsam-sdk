import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/admin/samspeaks")({
  component: SamSpeaksPage,
});

function SamSpeaksPage() {
  return (
    <div data-hosted-app-stage="samspeaks" className="relative flex size-full min-h-0 min-w-0 overflow-hidden bg-background">
      <iframe
        title="SamSpeaks creative studio"
        src="/samspeaks/"
        allow="microphone; autoplay; xr-spatial-tracking"
        className="absolute inset-0 block size-full border-0"
      />
    </div>
  );
}
