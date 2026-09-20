/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Provider Detail Inspector Modal
 */

import React, { useState } from 'react';
import { Dialog } from '../../design-system/Dialog';
import { Button } from '../../design-system/Button';
import { Badge } from '../../design-system/Badge';
import { ProviderMetadata, ProviderConnection } from '../../platform/contracts/ProviderRegistry';
import { SecretDescriptor } from '../../platform/contracts/SecretStore';
import {
  ExternalLink,
  ShieldCheck,
  Webhook,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useToast } from '../../design-system/Toast';

export interface ProviderDetailModalProps {
  provider: ProviderMetadata | null;
  connection?: ProviderConnection;
  secrets: SecretDescriptor[];
  isOpen: boolean;
  onClose: () => void;
  onTestConnection: (providerKey: string) => Promise<void>;
  onOpenCredentialEditor: (provider: ProviderMetadata) => void;
}

export const ProviderDetailModal: React.FC<ProviderDetailModalProps> = ({
  provider,
  connection,
  secrets,
  isOpen,
  onClose,
  onTestConnection,
  onOpenCredentialEditor
}) => {
  const { addToast } = useToast();
  const [isTesting, setIsTesting] = useState(false);

  if (!provider) return null;

  const handleTest = async () => {
    setIsTesting(true);
    try {
      await onTestConnection(provider.key || provider.id);
      addToast({
        type: 'success',
        title: 'Connection Healthy',
        description: `Handshake successful with ${provider.name || provider.label} in ${connection?.environmentMode || connection?.environment || 'test'} mode.`
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Handshake Failed',
        description: err.message
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`${provider.name} Integration Contract`}
      subtitle={`Category: ${provider.category.toUpperCase()} • Architecture: Host Adapter`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            size="xs"
            variant="outline"
            icon={<ExternalLink className="w-3.5 h-3.5" />}
            onClick={() => window.open(provider.documentationUrl, '_blank')}
          >
            Documentation
          </Button>

          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              isLoading={isTesting}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={handleTest}
            >
              Test Handshake
            </Button>
            <Button
              size="xs"
              variant="primary"
              icon={<KeyRound className="w-3.5 h-3.5" />}
              onClick={() => {
                onClose();
                onOpenCredentialEditor(provider);
              }}
            >
              Configure Secrets
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Overview Banner */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-zinc-100 text-sm">{provider.name}</span>
              <Badge
                variant={connection?.status === 'healthy' ? 'emerald' : 'amber'}
                size="sm"
                dot
              >
                {connection?.status || 'unconfigured'}
              </Badge>
              {(connection?.environmentMode || connection?.environment) && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  Mode: {connection.environmentMode || connection.environment}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">{provider.description}</p>
          </div>
        </div>

        {/* Required Credentials Checklist */}
        <div className="space-y-2">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400">
            Vault Credentials Status
          </span>
          <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/80 bg-zinc-950/60">
            {(provider.requiredSecrets || provider.credentials || []).map((req) => {
              const sec = secrets.find((s) => (s.keyName || s.credential_key) === req.key);
              return (
                <div
                  key={req.key}
                  className="p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-zinc-200 block">{req.label}</span>
                    <span className="font-mono text-[10px] text-zinc-500">{req.key}</span>
                  </div>
                  <div>
                    {sec?.last4 ? (
                      <span className="font-mono text-emerald-400 text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Configured (•••• {sec.last4})</span>
                      </span>
                    ) : (
                      <span className="font-mono text-amber-400 text-xs flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Missing</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Webhooks & HMAC Signatures */}
        {provider.supportedWebhooks && provider.supportedWebhooks.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400">
              Inbound Webhook Events & HMAC
            </span>
            <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {provider.supportedWebhooks.map((wh: any) => {
                  const topic = typeof wh === 'string' ? wh : wh.topic || wh.label;
                  return (
                    <span
                      key={topic}
                      className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[10px]"
                    >
                      {topic}
                    </span>
                  );
                })}
              </div>
              <p className="text-[11px] text-zinc-500">
                Inbound webhooks are verified via HMAC-SHA256 signature header before processing.
              </p>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
