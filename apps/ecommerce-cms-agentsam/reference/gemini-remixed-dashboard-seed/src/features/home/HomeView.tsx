/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Commerce Operations Home View
 */

import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../app/AdminProvider';
import { StatCard } from '../../design-system/StatCard';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import {
  DollarSign,
  ShoppingBag,
  Truck,
  Boxes,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { IntegrationActivity } from '../../platform/contracts/ProviderRegistry';

export const HomeView: React.FC = () => {
  const { host, navigate, setCopilotOpen } = useAdmin();
  const [activities, setActivities] = useState<IntegrationActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    host.providers.listActivity(5).then(setActivities);
  }, [host]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-amber-500/10 via-zinc-900/60 to-zinc-900 border border-amber-500/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-medium text-amber-400 uppercase tracking-wider">
              Autonomous Commerce Console
            </span>
            <Badge variant="amber" size="sm">
              F&FT Installation
            </Badge>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
            Welcome back, {host.auth.currentUser().name}
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            Completeful print-on-demand fulfillment bridge is running in{' '}
            <strong className="text-zinc-200">test dry-run mode</strong> with active quotes and
            automated tracking webhooks.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            icon={<Truck className="w-3.5 h-3.5 text-amber-400" />}
            onClick={() => navigate('/admin/completeful')}
          >
            Completeful Console
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Sparkles className="w-3.5 h-3.5" />}
            onClick={() => setCopilotOpen(true)}
          >
            Launch Copilot
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Revenue (MTD)"
          value="$14,820.50"
          change={{ value: "+18.4%", isPositive: true, period: "last month" }}
          icon={<DollarSign className="w-5 h-5" />}
          subtitle="Processed via Stripe"
          onClick={() => navigate('/admin/analytics')}
        />
        <StatCard
          label="Orders Requiring Action"
          value="3"
          change={{ value: "2 in production", isPositive: true }}
          icon={<ShoppingBag className="w-5 h-5" />}
          subtitle="1 unlinked variant"
          onClick={() => navigate('/admin/orders')}
        />
        <StatCard
          label="Completeful POD Margin"
          value="58.2%"
          change={{ value: "Authoritative quotes", isPositive: true }}
          icon={<Truck className="w-5 h-5" />}
          subtitle="Avg profit $39.50/garment"
          onClick={() => navigate('/admin/completeful')}
        />
        <StatCard
          label="Low Stock Garments"
          value="4 SKUs"
          change={{ value: "Black XL Hoodie low", isPositive: false }}
          icon={<Boxes className="w-5 h-5 text-amber-400" />}
          subtitle="Completeful blank alert"
          onClick={() => navigate('/admin/inventory')}
        />
      </div>

      {/* Priority Action Modules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Priority Items & Agent Suggestions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action Required Card */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-100">
                  Priority Operational Actions
                </h3>
              </div>
              <Badge variant="amber" size="sm">
                3 Pending
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-xs text-zinc-200">
                      Unlinked Completeful Variant in Order #FFT-9403
                    </span>
                    <Badge variant="red" size="sm">
                      Action Required
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Customer ordered &quot;Charcoal Vintage Tee (XXL)&quot;. Map this SKU to Completeful catalog child ID to automatically dispatch fulfillment.
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => navigate('/admin/orders')}
                >
                  Resolve
                </Button>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-xs text-zinc-200">
                      Completeful Production Dispatch for Order #FFT-9402
                    </span>
                    <Badge variant="emerald" size="sm">
                      Ready to Send
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Stripe payment of $136.00 captured. Ready for authorized dry-run dispatch to Charlotte DTG production facility.
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => navigate('/admin/orders')}
                >
                  Review Order
                </Button>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-xs text-zinc-200">
                      GitHub Deployment Token Check
                    </span>
                    <Badge variant="zinc" size="sm">
                      Optional
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Connect GitHub personal access token in the Provider Center to automate theme branch pull requests.
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => navigate('/admin/providers')}
                >
                  Configure
                </Button>
              </div>
            </div>
          </Card>

          {/* Quick Mockup Studio Launcher Banner */}
          <Card padding="md" className="bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-amber-950/30 border-amber-500/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-amber-400 text-xs font-mono mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Mockup Studio & Fabric Compositing</span>
                </div>
                <h4 className="text-sm font-semibold text-zinc-100">
                  Ready to preview new Fuel & Free Time graphics on Completeful apparel?
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Position logos, configure DTG print locations (chest, back, sleeve), and calculate real-time fulfillment quotes.
                </p>
              </div>
              <Button
                size="sm"
                variant="accent-orange"
                onClick={() => navigate('/admin/completeful', { tab: 'mockups' })}
                icon={<ArrowRight className="w-3.5 h-3.5" />}
                iconPosition="right"
              >
                Launch Studio
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Col: Host Integration Health & Audit Activity */}
        <div className="space-y-6">
          {/* Provider Center Status Snapshot */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400">
                Connected Providers
              </h4>
              <button
                onClick={() => navigate('/admin/providers')}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono"
              >
                <span>Manage</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <Truck className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="font-medium text-zinc-200 block">Completeful POD</span>
                    <span className="text-[10px] font-mono text-zinc-500">Mode: Dry-Run Test</span>
                  </div>
                </div>
                <Badge variant="emerald" size="sm" dot>
                  Active
                </Badge>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <DollarSign className="w-4 h-4 text-indigo-400" />
                  <div>
                    <span className="font-medium text-zinc-200 block">Stripe Payments</span>
                    <span className="text-[10px] font-mono text-zinc-500">Vault key: •••• 51f4</span>
                  </div>
                </div>
                <Badge variant="emerald" size="sm" dot>
                  Active
                </Badge>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <div>
                    <span className="font-medium text-zinc-200 block">Cloudflare Secrets Store</span>
                    <span className="text-[10px] font-mono text-zinc-500">Write-Only Vault</span>
                  </div>
                </div>
                <Badge variant="sky" size="sm">
                  Sealed
                </Badge>
              </div>
            </div>
          </Card>

          {/* Real-time Integration Activity Trail */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400">
                Recent Activity Trail
              </h4>
              <span className="text-[10px] font-mono text-zinc-500">Safe Metadata</span>
            </div>

            <div className="space-y-2.5 text-xs">
              {activities.length === 0 ? (
                <p className="text-zinc-500 text-xs py-4 text-center">No recent activity logged</p>
              ) : (
                activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-zinc-300 font-mono text-[11px]">
                        {act.provider} :: {act.operation}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {act.durationMs}ms
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>{act.actor}</span>
                      <span className="text-emerald-400 font-mono text-[10px]">
                        {act.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
