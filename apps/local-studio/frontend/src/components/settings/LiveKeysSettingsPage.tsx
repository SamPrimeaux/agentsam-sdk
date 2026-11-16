import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddKeyModal } from "./AddKeyModal";
import { ApiKeysTable } from "./ApiKeysTable";
import { CredentialsTable } from "./CredentialsTable";
import { MintCredentialModal } from "./MintCredentialModal";
import { DeviceProviderKeys } from "./DeviceProviderKeys";
import { identitySessionExists, isPackagedDesktop } from "@/lib/desktop/tauri";

export function LiveKeysSettingsPage({
  view = "credentials",
  embedded = false,
}: {
  view?: string;
  embedded?: boolean;
}) {
  const setupCompleteful = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("add") === "completeful";
  const activeView = view === "secrets" || setupCompleteful ? "secrets" : "credentials";
  const [credRefresh, setCredRefresh] = useState(0);
  const [secretRefresh, setSecretRefresh] = useState(0);
  const [mintOpen, setMintOpen] = useState(false);
  const [addSecretOpen, setAddSecretOpen] = useState(setupCompleteful);
  const packaged = isPackagedDesktop();
  const [signedIn, setSignedIn] = useState(!packaged);
  const [identityReady, setIdentityReady] = useState(!packaged);
  const refreshSecrets = useCallback(() => setSecretRefresh((n) => n + 1), []);

  useEffect(() => {
    if (!packaged) return;
    void identitySessionExists().then((exists) => {
      setSignedIn(exists);
      setIdentityReady(true);
    });
  }, [packaged]);

  return (
    <div className={embedded ? "space-y-8" : "h-full overflow-y-auto"}>
      <div className={embedded ? "space-y-8" : "mx-auto w-full max-w-[1180px] space-y-10 px-4 py-5 sm:px-6 lg:px-8 lg:py-7"}>
        {!embedded ? (
          <header>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-accent">
                <KeyRound className="size-4" aria-hidden="true" />
              </span>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">Keys & Secrets</h1>
            </div>
            {setupCompleteful ? (
              <a href="/admin/products/create" className="mt-2 inline-flex text-sm text-accent underline underline-offset-4">
                Return to Product Studio
              </a>
            ) : null}
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Manage AgentSam keys for CLI, SDK and machine callers, plus provider credentials for Studio chat and terminal.
              Plaintext is shown once; the account vault stores protected values only.
            </p>
          </header>
        ) : null}

        {identityReady && signedIn ? (
          <>
            {activeView === "credentials" ? (
              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-base font-medium text-foreground">AgentSam credentials</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Generated keys for CLI, SDK, and machine callers.</p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setMintOpen(true)} className="gap-1.5">
                    <Plus className="size-3.5" aria-hidden="true" /> Create AgentSam key
                  </Button>
                </div>
                <CredentialsTable refreshToken={credRefresh} />
              </section>
            ) : null}
            {activeView === "secrets" ? (
              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-base font-medium text-foreground">Provider secrets</h2>
                    <p className="mt-1 text-sm text-muted-foreground">BYOK for OpenAI, Anthropic, Cloudflare, and other Studio providers.</p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setAddSecretOpen(true)} className="gap-1.5">
                    <Plus className="size-3.5" aria-hidden="true" /> Add provider secret
                  </Button>
                </div>
                <ApiKeysTable refreshToken={secretRefresh} onChanged={refreshSecrets} />
              </section>
            ) : null}
          </>
        ) : identityReady && packaged && activeView === "credentials" ? (
          <section className="rounded-2xl bg-card px-5 py-4 shadow-hairline">
            <h2 className="text-base font-medium text-foreground">Account vault</h2>
            <p className="mt-1 text-sm text-muted-foreground">This device is not connected to an AgentSam account. Sign in to manage synchronized account credentials.</p>
            <button type="button" className="mt-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              onClick={() => window.dispatchEvent(new CustomEvent("agentsam:identity-open"))}>
              Connect account
            </button>
          </section>
        ) : null}

        {packaged && activeView === "secrets" ? (
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-medium text-foreground">Device provider keys</h2>
              <p className="mt-1 text-sm text-muted-foreground">Local provider keys remain on this device unless you explicitly sync them to your account.</p>
            </div>
            <DeviceProviderKeys refreshToken={secretRefresh} onAccountChanged={refreshSecrets} />
          </section>
        ) : null}

        {activeView === "credentials" ? (
          <MintCredentialModal open={mintOpen} onOpenChange={setMintOpen} onMinted={() => setCredRefresh((n) => n + 1)} />
        ) : null}
        {activeView === "secrets" ? (
          <AddKeyModal initialService={setupCompleteful ? "completeful" : "openai"} open={addSecretOpen} onOpenChange={setAddSecretOpen} onSaved={refreshSecrets} />
        ) : null}
      </div>
    </div>
  );
}
