/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Secure Credential Editor Modal (SecretStore)
 */

import React, { useState } from 'react';
import { Dialog } from '../../design-system/Dialog';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Badge } from '../../design-system/Badge';
import { ProviderMetadata } from '../../platform/contracts/ProviderRegistry';
import { SecretDescriptor } from '../../platform/contracts/SecretStore';
import { ShieldCheck, Lock, AlertTriangle, KeyRound } from 'lucide-react';
import { useToast } from '../../design-system/Toast';

export interface CredentialEditorModalProps {
  provider: ProviderMetadata | null;
  existingSecrets: SecretDescriptor[];
  isOpen: boolean;
  onClose: () => void;
  onSaveSecret: (secretKeyName: string, plaintext: string, description: string) => Promise<void>;
}

export const CredentialEditorModal: React.FC<CredentialEditorModalProps> = ({
  provider,
  existingSecrets,
  isOpen,
  onClose,
  onSaveSecret
}) => {
  const { addToast } = useToast();
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [plainSecretValue, setPlainSecretValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!provider) return null;

  const currentKey = selectedKey || provider.credentials?.[0]?.key || '';
  const currentReq = provider.credentials?.find((s) => s.key === currentKey);
  const existingDesc = existingSecrets.find((s) => (s.keyName || s.credential_key) === currentKey);

  const handleSave = async () => {
    if (!plainSecretValue.trim()) return;
    setIsSaving(true);
    try {
      await onSaveSecret(
        currentKey,
        plainSecretValue.trim(),
        currentReq?.description || 'Provider credential'
      );
      setPlainSecretValue('');
      addToast({
        type: 'success',
        title: 'Secret Vault Updated',
        description: `Stored write-only credential for ${currentKey}.`
      });
      onClose();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Failed to Save Secret',
        description: err.message
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Update Credentials for ${provider.name}`}
      subtitle="Credentials are encrypted in the Cloudflare write-only vault. Plaintext is never stored in browser memory."
      maxWidth="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Write-Only SecretStore</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="xs" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="xs"
              variant="primary"
              disabled={!plainSecretValue.trim() || isSaving}
              isLoading={isSaving}
              icon={<Lock className="w-3.5 h-3.5" />}
              onClick={handleSave}
            >
              Seal into Vault
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Selector if multiple keys required */}
        {provider.requiredSecrets.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Select Secret Parameter
            </label>
            <div className="grid grid-cols-2 gap-2">
              {provider.requiredSecrets.map((req) => (
                <button
                  key={req.key}
                  type="button"
                  onClick={() => setSelectedKey(req.key)}
                  className={`p-2.5 rounded-xl border text-left text-xs font-mono transition-colors ${
                    currentKey === req.key
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className="block font-semibold">{req.label}</span>
                  <span className="text-[10px] text-zinc-500">{req.key}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Existing vault descriptor indicator */}
        <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
              Current Vault State
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-zinc-200">{currentKey}</span>
              {existingDesc?.last4 ? (
                <Badge variant="emerald" size="sm">
                  Active (•••• {existingDesc.last4})
                </Badge>
              ) : (
                <Badge variant="amber" size="sm">
                  Unconfigured
                </Badge>
              )}
            </div>
          </div>
          {(existingDesc?.rotatedAt || existingDesc?.updated_at) && (
            <span className="text-[10px] font-mono text-zinc-500">
              Rotated: {new Date(existingDesc.rotatedAt || existingDesc.updated_at).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Plaintext input */}
        <div>
          <Input
            label={`New Value for ${currentReq?.label || currentKey}`}
            type="password"
            value={plainSecretValue}
            onChange={(e) => setPlainSecretValue(e.target.value)}
            placeholder={
              currentKey.includes('CAPP_KEY')
                ? 'capp_test_...'
                : currentKey.includes('STRIPE')
                ? 'rk_test_...'
                : 'Enter credential...'
            }
            helperText={
              currentReq?.helpText ||
              'For Completeful, use capp_test_... to enforce authenticated dry runs.'
            }
          />
        </div>

        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            By design, your full secret cannot be read back out of the vault once submitted. Only
            the last 4 characters and validation timestamps are retained for operational audits.
          </p>
        </div>
      </div>
    </Dialog>
  );
};
