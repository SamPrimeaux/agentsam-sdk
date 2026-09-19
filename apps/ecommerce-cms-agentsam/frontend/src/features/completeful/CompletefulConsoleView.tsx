/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Master Completeful POD Operations Console
 */

import React, { useState } from 'react';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Tabs } from '../../design-system/Tabs';
import { MockupStudioTab } from './MockupStudioTab';
import { useAdmin } from '../../app/AdminProvider';
import {
  Truck,
  Sparkles,
  Layers,
  ShoppingBag,
  Webhook,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Send,
  RefreshCw
} from 'lucide-react';
import { useToast } from '../../design-system/Toast';

export const CompletefulConsoleView: React.FC = () => {
  const { currentParams, navigate } = useAdmin();
  const { addToast } = useToast();
  const initialTab = (currentParams?.tab as any) || 'mockups';
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Webhook test state
  const [testEventType, setTestEventType] = useState('order.status_updated');
  const [isSendingWebhook, setIsSendingWebhook] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<
    { id: string; event: string; status: string; timestamp: number; payload: string }[]
  >([
    {
      id: 'wh_evt_881',
      event: 'order.in_production',
      status: 'verified_hmac_200',
      timestamp: Date.now() - 1000 * 60 * 12,
      payload: '{"order_id": "capp_ord_9844", "status": "in-production", "location": "Charlotte DTG"}'
    },
    {
      id: 'wh_evt_880',
      event: 'order.shipped',
      status: 'verified_hmac_200',
      timestamp: Date.now() - 1000 * 60 * 48,
      payload: '{"order_id": "capp_ord_9901", "tracking": "9400111899223400192", "carrier": "USPS"}'
    }
  ]);

  const handleSimulateWebhook = () => {
    setIsSendingWebhook(true);
    setTimeout(() => {
      setIsSendingWebhook(false);
      const newEvt = {
        id: `wh_evt_${Date.now().toString().slice(-4)}`,
        event: testEventType,
        status: 'verified_hmac_200',
        timestamp: Date.now(),
        payload: JSON.stringify(
          {
            event: testEventType,
            order_id: 'capp_ord_dry_test',
            tracking: testEventType.includes('shipped') ? '94001002938491823' : undefined,
            timestamp: new Date().toISOString()
          },
          null,
          2
        )
      };
      setWebhookLogs([newEvt, ...webhookLogs]);
      addToast({
        type: 'success',
        title: 'Webhook Event Processed',
        description: `Simulated ${testEventType} verified via HMAC-SHA256.`
      });
    }, 600);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Console Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-zinc-900 to-zinc-900 border border-amber-500/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Completeful POD Fulfillment Engine
            </h1>
            <Badge variant="amber" size="sm">
              X-Capp-Mode: dry_run
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 max-w-xl">
            Direct host contract with Completeful print-on-demand API. All authenticated mutations
            preview authoritative quotes and enforce dry-run validation without incurring billing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            icon={<ExternalLink className="w-3 h-3" />}
            onClick={() => window.open('https://completeful.com', '_blank')}
          >
            Completeful Portal
          </Button>
          <Button
            size="xs"
            variant="primary"
            icon={<ShieldCheck className="w-3.5 h-3.5" />}
            onClick={() => navigate('/admin/providers')}
          >
            Vault Secrets
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'mockups', label: 'Mockup Studio & Fabric Compositor', icon: <Sparkles className="w-3.5 h-3.5" /> },
          { id: 'catalog', label: 'Apparel Blanks & Catalog', icon: <Layers className="w-3.5 h-3.5" /> },
          { id: 'webhooks', label: 'Webhook HMAC Dispatcher', icon: <Webhook className="w-3.5 h-3.5" /> },
          { id: 'ledger', label: 'Operations & Quote Ledger', icon: <Activity className="w-3.5 h-3.5" /> }
        ]}
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab)}
      />

      {/* Tab 1: Mockup Studio */}
      {activeTab === 'mockups' && <MockupStudioTab />}

      {/* Tab 2: Apparel Blanks & Catalog */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                id: 'cat_blank_gildan_heavy_blk',
                brand: 'Gildan Hammer',
                style: 'Heavyweight Fleece Hoodie (12oz)',
                sku: 'GH-88000',
                cost: '$28.50',
                colors: 'Black, Olive, Charcoal, Sand, Heather Grey',
                sizes: 'S, M, L, XL, XXL, 3XL',
                facility: 'Charlotte, NC DTG Hub'
              },
              {
                id: 'cat_blank_shaka_tee_chr',
                brand: 'Shaka Wear',
                style: 'Heavyweight Max Vintage Washed Tee (6.5oz)',
                sku: 'SW-MAX-TEE',
                cost: '$16.50',
                colors: 'Washed Charcoal, Vintage Black, Off White',
                sizes: 'S, M, L, XL, XXL',
                facility: 'Charlotte, NC DTG Hub'
              },
              {
                id: 'cat_blank_yupoong_snapback',
                brand: 'Yupoong',
                style: 'Classic 6-Panel Structured Snapback Cap',
                sku: 'YP-6089M',
                cost: '$14.00',
                colors: 'Black, Charcoal/Grey, Olive',
                sizes: 'One Size Fits All (Adjustable)',
                facility: 'Dallas Embroidery Hub'
              }
            ].map((blank) => (
              <Card key={blank.id} padding="md" className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold block">
                      {blank.brand}
                    </span>
                    <h4 className="font-semibold text-xs text-zinc-100 mt-0.5">{blank.style}</h4>
                  </div>
                  <span className="font-mono font-bold text-emerald-400 text-xs">{blank.cost}</span>
                </div>

                <div className="space-y-1 text-xs text-zinc-400 font-mono">
                  <div>
                    <span className="text-zinc-500">Catalog Blank ID:</span>{' '}
                    <span className="text-zinc-300">{blank.id}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Facility:</span>{' '}
                    <span className="text-zinc-300">{blank.facility}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Sizes:</span>{' '}
                    <span className="text-zinc-300">{blank.sizes}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800 flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setActiveTab('mockups')}
                  >
                    Open in Mockup Studio
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Webhook HMAC Dispatcher */}
      {activeTab === 'webhooks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card padding="md" className="lg:col-span-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Webhook className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-zinc-100">
                Simulate Inbound Completeful Webhook
              </h3>
            </div>

            <p className="text-xs text-zinc-400">
              Test Completeful event dispatching to the host endpoint{' '}
              <code className="text-amber-300 font-mono">/api/webhooks/completeful</code>.
              Payloads are signed with <code className="text-zinc-300 font-mono">CAPP_WEBHOOK_SECRET</code>.
            </p>

            <div className="space-y-3 pt-2">
              <label className="block text-xs font-medium text-zinc-300">
                Select Completeful Event Type
              </label>
              <div className="space-y-1.5">
                {[
                  { id: 'order.in_production', label: 'order.in_production (Garment queued for DTG)' },
                  { id: 'order.shipped', label: 'order.shipped (Tracking number generated)' },
                  { id: 'order.delivered', label: 'order.delivered (Carrier confirmed arrival)' },
                  { id: 'order.exception', label: 'order.exception (Garment blank out of stock)' }
                ].map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setTestEventType(ev.id)}
                    className={`w-full p-2.5 rounded-xl border text-left text-xs font-mono transition-colors ${
                      testEventType === ev.id
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {ev.label}
                  </button>
                ))}
              </div>

              <Button
                size="sm"
                variant="primary"
                isLoading={isSendingWebhook}
                icon={<Send className="w-3.5 h-3.5" />}
                onClick={handleSimulateWebhook}
                className="w-full mt-2"
              >
                Send Verified Webhook Event
              </Button>
            </div>
          </Card>

          <Card padding="md" className="lg:col-span-7 space-y-3">
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400">
              Webhook Event Ingestion Log
            </h4>

            <div className="space-y-3">
              {webhookLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 font-mono text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-amber-400">{log.event}</span>
                      <Badge variant="emerald" size="sm">
                        {log.status}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <pre className="p-2.5 rounded-lg bg-zinc-950 text-[11px] text-zinc-400 overflow-x-auto">
                    {log.payload}
                  </pre>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Operations & Quote Ledger */}
      {activeTab === 'ledger' && (
        <Card padding="md" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">
              Authoritative Completeful Fulfillment Quotes Ledger
            </h3>
            <span className="text-xs font-mono text-emerald-400">
              Fulfillment total determined by quote contract
            </span>
          </div>

          <div className="rounded-xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800 bg-zinc-950/60 text-xs font-mono">
            {[
              {
                orderId: 'FFT-9402',
                quoteRef: 'capp_quote_9402',
                blankCost: '$57.00',
                shipping: '$6.50',
                tax: '$4.80',
                totalFulfillment: '$68.30',
                retailPaid: '$136.00',
                profit: '+$67.70'
              },
              {
                orderId: 'FFT-9403',
                quoteRef: 'capp_quote_9403',
                blankCost: '$16.50',
                shipping: '$5.50',
                tax: '$1.40',
                totalFulfillment: '$23.40',
                retailPaid: '$42.00',
                profit: '+$18.60'
              },
              {
                orderId: 'FFT-9401',
                quoteRef: 'capp_quote_9401',
                blankCost: '$28.50',
                shipping: '$5.50',
                tax: '$2.20',
                totalFulfillment: '$36.20',
                retailPaid: '$68.00',
                profit: '+$31.80'
              }
            ].map((entry) => (
              <div key={entry.orderId} className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-zinc-100 block">Order #{entry.orderId}</span>
                  <span className="text-[10px] text-zinc-500">Quote ID: {entry.quoteRef}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-500 block">Quote Total</span>
                    <span className="text-zinc-200">{entry.totalFulfillment}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-500 block">Retail Paid</span>
                    <span className="text-zinc-200">{entry.retailPaid}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-emerald-400 block">Gross Profit</span>
                    <span className="text-emerald-400 font-bold">{entry.profit}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
