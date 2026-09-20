/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Reusable Provider Center & API Vault
 */

import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../app/AdminProvider';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { ProviderMetadata, ProviderConnection, IntegrationActivity } from '../../platform/contracts/ProviderRegistry';
import { SecretDescriptor } from '../../platform/contracts/SecretStore';
import { CredentialEditorModal } from './CredentialEditorModal';
import { ProviderDetailModal } from './ProviderDetailModal';
import {
  KeyRound,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Lock,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Activity,
  ChevronRight
} from 'lucide-react';
import { useToast } from '../../design-system/Toast';

export const ProviderCenterView: React.FC = () => {
  const { host, providers, connections, refreshProviders } = useAdmin();
  const { addToast } = useToast();

  const [secrets, setSecrets] = useState<SecretDescriptor[]>([]);
  const [activities, setActivities] = useState<IntegrationActivity[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeEditingProvider, setActiveEditingProvider] = useState<ProviderMetadata | null>(null);
  const [activeDetailProvider, setActiveDetailProvider] = useState<ProviderMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [host]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [connList, actList] = await Promise.all([
        host.providers.listConnections(),
        host.providers.listActivity(10)
      ]);
      const allDescriptors: SecretDescriptor[] = [];
      connList.forEach((c) => {
        if (c.credentials) {
          Object.values(c.credentials).forEach((d) => allDescriptors.push(d));
        }
      });
      setSecrets(allDescriptors);
      setActivities(actList);
    } catch (err: any) {
      console.error('Failed to load secrets/activity', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSecret = async (secretKeyName: string, plaintext: string, description: string) => {
    const provKey = activeEditingProvider?.id || activeEditingProvider?.key || 'general';
    await host.vault.putSecret({
      account_id: 'fnf_account_01',
      provider: provKey,
      environment: 'preview',
      credential_key: secretKeyName,
      secret_value: plaintext,
      description
    });
    await loadData();
    await refreshProviders();
  };

  const handleTestConnection = async (providerKey: string) => {
    await host.providers.verifyConnection(providerKey);
    await refreshProviders();
    await loadData();
  };

  const filteredProviders = providers.filter(
    (p) => selectedCategory === 'all' || p.category === selectedCategory
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Provider Center & API Vault
            </h1>
            <Badge variant="sky" size="sm">
              Write-Only SecretStore
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Decoupled host adapter registry. Secrets are stored in Cloudflare Worker vault and never exposed to the client.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          isLoading={isLoading}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={loadData}
        >
          Refresh Status
        </Button>
      </div>

      {/* Secret Vault Security Banner */}
      <Card padding="md" className="bg-gradient-to-r from-sky-950/30 via-zinc-900 to-zinc-900 border-sky-500/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-sky-300">
                Encrypted Host Secret Vault Active
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                {secrets.length} secrets configured. Browser only receives last-4 digests and audit metadata.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-zinc-400 bg-zinc-950/80 px-2.5 py-1 rounded-lg border border-zinc-800">
              Algorithm: AES-GCM / KV-bound
            </span>
          </div>
        </div>
      </Card>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {[
          { id: 'all', label: 'All Providers' },
          { id: 'commerce', label: 'POD & Fulfillment' },
          { id: 'payments', label: 'Payments' },
          { id: 'messaging', label: 'Email & Messaging' },
          { id: 'ai', label: 'AI & Models' },
          { id: 'infrastructure', label: 'Platform & Cloud' }
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
              selectedCategory === cat.id
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Provider Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProviders.map((prov) => {
          const provKey = prov.key || prov.id;
          const provName = prov.name || prov.label;
          const reqSecrets = prov.requiredSecrets || prov.credentials || [];
          const conn = connections.find((c) => c.providerKey === provKey);
          const isHealthy = conn?.status === 'healthy';
          const isConfigured = conn?.status !== 'not_configured' && conn?.status !== 'unconfigured';

          // Count configured required secrets
          const configuredCount = reqSecrets.filter((req) =>
            secrets.some((s) => (s.keyName || s.credential_key) === req.key && s.last4)
          ).length;

          return (
            <Card
              key={provKey}
              padding="md"
              className="flex flex-col justify-between hover:border-zinc-700 transition-all group"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-zinc-100">{provName}</span>
                      <Badge
                        variant={isHealthy ? 'emerald' : isConfigured ? 'amber' : 'zinc'}
                        size="sm"
                        dot
                      >
                        {conn?.status || 'unconfigured'}
                      </Badge>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mt-0.5">
                      {prov.category}
                    </span>
                  </div>

                  {(conn?.environmentMode || conn?.environment) && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                      {conn.environmentMode || conn.environment}
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-400 line-clamp-2 mb-4 leading-relaxed">
                  {prov.description}
                </p>

                {/* Secret status preview */}
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs space-y-1 mb-4">
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-zinc-500">Required Vault Keys:</span>
                    <span className="text-zinc-300">
                      {configuredCount} / {reqSecrets.length} Set
                    </span>
                  </div>
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{
                        width: `${(configuredCount / Math.max(1, reqSecrets.length)) * 100}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                <Button
                  size="xs"
                  variant="outline"
                  icon={<KeyRound className="w-3 h-3" />}
                  onClick={() => setActiveEditingProvider(prov)}
                >
                  Configure
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setActiveDetailProvider(prov)}
                  >
                    Inspect
                  </Button>
                  <button
                    onClick={() => handleTestConnection(provKey)}
                    className="text-zinc-500 hover:text-amber-400 p-1 transition-colors"
                    title="Run Handshake Test"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Integration Activity Audit Table */}
      <Card padding="md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-100">
              Safe Integration Activity Audit Log
            </h3>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">
            Audit Trail (No Plaintext Secrets)
          </span>
        </div>

        <div className="rounded-xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800/80 bg-zinc-950/60">
          {activities.map((act) => (
            <div
              key={act.id}
              className="p-3 flex items-center justify-between text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-zinc-200">{act.provider}</span>
                  <span className="text-zinc-500 font-mono">::</span>
                  <span className="font-mono text-zinc-400">{act.operation}</span>
                  <Badge variant={act.status === 'success' ? 'emerald' : 'red'} size="sm">
                    {act.status}
                  </Badge>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                  Actor: {act.actor} • ID: {act.id}
                </span>
              </div>

              <div className="text-right font-mono text-[11px]">
                <span className="text-zinc-400 block">{act.durationMs}ms</span>
                <span className="text-[10px] text-zinc-500">
                  {new Date(act.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Credential Rotation Modal */}
      <CredentialEditorModal
        provider={activeEditingProvider}
        existingSecrets={secrets}
        isOpen={!!activeEditingProvider}
        onClose={() => setActiveEditingProvider(null)}
        onSaveSecret={handleSaveSecret}
      />

      {/* Provider Detail Modal */}
      <ProviderDetailModal
        provider={activeDetailProvider}
        connection={connections.find((c) => c.providerKey === activeDetailProvider?.key)}
        secrets={secrets}
        isOpen={!!activeDetailProvider}
        onClose={() => setActiveDetailProvider(null)}
        onTestConnection={handleTestConnection}
        onOpenCredentialEditor={(p) => setActiveEditingProvider(p)}
      />
    </div>
  );
};
