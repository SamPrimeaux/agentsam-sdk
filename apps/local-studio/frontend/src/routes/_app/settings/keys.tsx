import { createFileRoute } from "@tanstack/react-router";
import { createProviderRegistry } from "@inneranimalmedia/agentsam-vault";
import { KeysPage } from "@inneranimalmedia/agentsam-key-manager/KeysPage";

export const Route = createFileRoute("/_app/settings/keys")({
  component: KeysSettingsPage,
});

const providers = createProviderRegistry().list();

function KeysSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 lg:p-8 text-foreground">
      <KeysPage providers={providers} />
    </div>
  );
}
