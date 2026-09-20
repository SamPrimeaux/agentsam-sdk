/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Sales Channels Scaffold View (POS, Markets)
 */

import React from 'react';
import { useAdmin } from '../../app/AdminProvider';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Smartphone, MapPin, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

export const ScaffoldView: React.FC = () => {
  const { currentParams, navigate } = useAdmin();
  const viewType = currentParams?.view || 'pos';

  const isPos = viewType === 'pos';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              {isPos ? 'Point of Sale (POS) Hardware Terminal' : 'Global Markets & Currency Localization'}
            </h1>
            <Badge variant="amber" size="sm">
              Sales Channel Module
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {isPos
              ? 'Connect Stripe Terminal readers for trackside event popups and in-person card payments.'
              : 'Configure multi-currency international markets, duties, and regional warehouse routing.'}
          </p>
        </div>
      </div>

      <Card padding="lg" className="text-center py-16 space-y-4 max-w-xl mx-auto border-dashed">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
          {isPos ? <Smartphone className="w-6 h-6" /> : <MapPin className="w-6 h-6" />}
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-semibold text-zinc-100">
            {isPos ? 'Stripe Reader M2 Hardware Bridge Ready' : 'Multi-Currency D1 Geo-Routing Ready'}
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">
            {isPos
              ? 'Trackside merchandise booths can pair with Bluetooth BBPOS / WisePad readers to capture orders directly into the Completeful fulfillment pipeline.'
              : 'Deploy country-specific price lists and localize currencies with real-time conversion rates.'}
          </p>
        </div>

        <div className="pt-2 flex justify-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/admin/providers')}
          >
            Check Provider Keys
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<ArrowRight className="w-3.5 h-3.5" />}
            iconPosition="right"
            onClick={() => navigate('/admin/products')}
          >
            Manage Products
          </Button>
        </div>
      </Card>
    </div>
  );
};
