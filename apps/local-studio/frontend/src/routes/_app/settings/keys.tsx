import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddKeyModal } from "@/components/settings/AddKeyModal";
import { ApiKeysTable } from "@/components/settings/ApiKeysTable";

export const Route = createFileRoute("/_app/settings/keys")({
  component: KeysSettingsPage,
});

function KeysSettingsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Settings</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight text-foreground">API keys</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Add your own provider credentials. Values are encrypted with this deployment’s vault key and are never returned to the browser.
          </p>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add key
        </Button>
      </div>

      <div className="mt-8">
        <ApiKeysTable refreshToken={refreshToken} />
      </div>

      <AddKeyModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => setRefreshToken((value) => value + 1)}
      />
    </div>
  );
}
