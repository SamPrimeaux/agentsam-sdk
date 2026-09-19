/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Analytics & Host Performance View
 */

import React, { useState } from 'react';
import { Card } from '../../design-system/Card';
import { StatCard } from '../../design-system/StatCard';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import {
  DollarSign,
  TrendingUp,
  Truck,
  Activity,
  Download,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';

export const AnalyticsView: React.FC = () => {
  const [dateRange, setDateRange] = useState('30d');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Commerce Analytics & Fulfillment Margins
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Track retail revenue, Completeful quote costs, provider latency, and net profit margins.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 text-xs">
            {['7d', '30d', '90d', 'ytd'].map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-2.5 py-1 rounded-lg uppercase font-mono transition-colors ${
                  dateRange === range
                    ? 'bg-zinc-800 text-zinc-100 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <Button
            size="xs"
            variant="outline"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => alert('Exporting CSV ledger snapshot...')}
          >
            Export Ledger
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Gross Merchandise Value"
          value="$14,820.50"
          change={{ value: '+18.4%', isPositive: true }}
          icon={<DollarSign className="w-5 h-5 text-amber-400" />}
          subtitle="Processed via Stripe"
        />
        <StatCard
          label="Completeful Fulfillment Costs"
          value="$6,195.00"
          change={{ value: 'Authoritative quotes', isPositive: true }}
          icon={<Truck className="w-5 h-5 text-sky-400" />}
          subtitle="Blanks + DTG print + shipping"
        />
        <StatCard
          label="Store Net Margin"
          value="58.2%"
          change={{ value: '+$8,625.50 profit', isPositive: true }}
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
          subtitle="After fulfillment & fees"
        />
        <StatCard
          label="Average Order Value"
          value="$82.33"
          change={{ value: '+4.2%', isPositive: true }}
          icon={<Layers className="w-5 h-5 text-purple-400" />}
          subtitle="1.8 items per order"
        />
      </div>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Margin Distribution by Product Category */}
        <Card padding="md" className="space-y-4">
          <h3 className="text-sm font-semibold text-zinc-100">
            Fulfillment Margin Breakdown by Garment Category
          </h3>

          <div className="space-y-3 font-mono text-xs">
            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span>Heavyweight Fleece Hoodies (12oz)</span>
                <span className="text-emerald-400 font-bold">58.1% margin ($39.50 avg profit)</span>
              </div>
              <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '58.1%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span>Vintage Washed Tees (6.5oz)</span>
                <span className="text-emerald-400 font-bold">60.7% margin ($25.50 avg profit)</span>
              </div>
              <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '60.7%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span>Structured Snapbacks (Embroidery)</span>
                <span className="text-emerald-400 font-bold">58.8% margin ($20.00 avg profit)</span>
              </div>
              <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '58.8%' }} />
              </div>
            </div>
          </div>
        </Card>

        {/* Provider Latency & Uptime SLA */}
        <Card padding="md" className="space-y-4">
          <h3 className="text-sm font-semibold text-zinc-100">
            Provider Bridge Latency & Uptime (30d)
          </h3>

          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-zinc-200 block">Completeful POD API</span>
                <span className="text-[10px] text-zinc-500">Quote calculation & order dispatch</span>
              </div>
              <div className="text-right">
                <span className="text-emerald-400 font-bold block">142ms avg</span>
                <span className="text-[10px] text-zinc-500">99.98% uptime</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-zinc-200 block">Stripe Payment Gateway</span>
                <span className="text-[10px] text-zinc-500">Webhooks & payment intents</span>
              </div>
              <div className="text-right">
                <span className="text-emerald-400 font-bold block">88ms avg</span>
                <span className="text-[10px] text-zinc-500">100.0% uptime</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-zinc-200 block">Resend Email API</span>
                <span className="text-[10px] text-zinc-500">Order receipts & marketing</span>
              </div>
              <div className="text-right">
                <span className="text-emerald-400 font-bold block">110ms avg</span>
                <span className="text-[10px] text-zinc-500">99.95% uptime</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
