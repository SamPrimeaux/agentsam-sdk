import { createFileRoute } from "@tanstack/react-router";
import { createProviderRegistry } from "../../../../../packages/agentsam-vault/src/index.js";
import { KeysPage } from "../../../../../packages/agentsam-key-manager/src/pages/KeysPage.jsx";

export const Route = createFileRoute("/(apps)/settings/keys")({
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
