import { useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddKeyModal } from "./AddKeyModal";
import { ApiKeysTable } from "./ApiKeysTable";
import { CredentialsTable } from "./CredentialsTable";
import { MintCredentialModal } from "./MintCredentialModal";

/**
 * Live /settings/keys — AgentSam minted credentials + provider BYOK.
 * Studio Worker vault APIs only (no fixtures, no project scope, no IAM UI).
 */
export function LiveKeysSettingsPage() {
  const [credRefresh, setCredRefresh] = useState(0);
  const [secretRefresh, setSecretRefresh] = useState(0);
  const [mintOpen, setMintOpen] = useState(false);
  const [addSecretOpen, setAddSecretOpen] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] space-y-10 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-accent">
              <KeyRound className="size-4" aria-hidden="true" />
            </span>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Keys & Secrets</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Mint AgentSam account (aak_ / AGENTSAM_API_KEY) or service (brk_ / AGENTSAM_BRIDGE_KEY)
            credentials, and store provider BYOK for Studio chat and terminal. Names are yours — no
            project scope. Plaintext is shown once; the Worker stores hashes / ciphertext only.
          </p>
        </header>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-medium text-foreground">AgentSam credentials</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Generated keys for CLI, SDK, and machine callers.
              </p>
            </div>
            <Button type="button" onClick={() => setMintOpen(true)} className="gap-1.5">
              <Plus className="size-3.5" aria-hidden="true" />
              Create secret key
            </Button>
          </div>
          <CredentialsTable refreshToken={credRefresh} />
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-medium text-foreground">Provider secrets</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                BYOK for OpenAI, Anthropic, Cloudflare, and other Studio providers.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setAddSecretOpen(true)} className="gap-1.5">
              <Plus className="size-3.5" aria-hidden="true" />
              Add provider secret
            </Button>
          </div>
          <ApiKeysTable refreshToken={secretRefresh} />
        </section>

        <MintCredentialModal
          open={mintOpen}
          onOpenChange={setMintOpen}
          onMinted={() => setCredRefresh((n) => n + 1)}
        />
        <AddKeyModal
          open={addSecretOpen}
          onOpenChange={setAddSecretOpen}
          onSaved={() => setSecretRefresh((n) => n + 1)}
        />
      </div>
    </div>
  );
}
