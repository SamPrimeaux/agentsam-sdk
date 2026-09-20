/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Order Detail Drawer
 */

import React from 'react';
import { CompletefulOrderLink } from '../../types';
import { Drawer } from '../../design-system/Drawer';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import {
  Truck,
  CreditCard,
  User,
  MapPin,
  Clock,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Send,
  FileText
} from 'lucide-react';
import { useToast } from '../../design-system/Toast';

export interface OrderDetailDrawerProps {
  order: CompletefulOrderLink | null;
  isOpen: boolean;
  onClose: () => void;
  onDispatchDryRun: (orderId: string) => void;
}

export const OrderDetailDrawer: React.FC<OrderDetailDrawerProps> = ({
  order,
  isOpen,
  onClose,
  onDispatchDryRun
}) => {
  const { addToast } = useToast();

  if (!order) return null;

  const getStatusBadge = (status: CompletefulOrderLink['status']) => {
    switch (status) {
      case 'created':
        return <Badge variant="sky">Created</Badge>;
      case 'sent-to-production':
        return <Badge variant="amber">Dispatched to Completeful</Badge>;
      case 'in-production':
        return <Badge variant="purple">In DTG Production</Badge>;
      case 'shipped':
        return <Badge variant="emerald">Shipped</Badge>;
      case 'delivered':
        return <Badge variant="emerald">Delivered</Badge>;
      case 'cancelled':
        return <Badge variant="red">Cancelled</Badge>;
      default:
        return <Badge variant="zinc">{status}</Badge>;
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Order ${order.localOrderId}`}
      subtitle={`Created ${new Date(order.createdAt).toLocaleDateString()} • Stripe Intent: ${order.stripePaymentIntentId}`}
      width="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
            {order.isDryRun && (
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                X-Capp-Mode: dry_run
              </span>
            )}
            <span>Idempotency: {order.idempotencyKey.substring(0, 12)}...</span>
          </div>

          <div className="flex items-center gap-2">
            <Button size="xs" variant="outline" onClick={onClose}>
              Close
            </Button>
            {order.status === 'created' && (
              <Button
                size="xs"
                variant="primary"
                icon={<Send className="w-3.5 h-3.5" />}
                onClick={() => {
                  onDispatchDryRun(order.id);
                  addToast({
                    type: 'success',
                    title: 'Fulfillment Order Dispatched (Dry Run)',
                    description: `Order ${order.localOrderId} validated and submitted with authoritative quote.`
                  });
                }}
              >
                Dispatch Fulfillment Order
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Status Header Banner */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">
              Fulfillment Lifecycle State
            </span>
            <div className="flex items-center gap-2">
              {getStatusBadge(order.status)}
              {order.completefulFulfillmentOrderId && (
                <span className="text-xs font-mono text-zinc-300">
                  Ref: {order.completefulFulfillmentOrderId}
                </span>
              )}
            </div>
          </div>

          {order.trackingNumber && (
            <div className="text-right">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">
                Carrier Tracking
              </span>
              <a
                href={order.trackingUrl || '#'}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono font-semibold text-amber-400 hover:underline flex items-center gap-1 justify-end"
              >
                <span>{order.trackingCarrier} #{order.trackingNumber}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Customer & Shipping Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
              <User className="w-4 h-4 text-amber-400" />
              <span>Customer Information</span>
            </div>
            <div className="text-xs space-y-0.5 pt-1">
              <p className="text-zinc-200 font-medium">{order.customerName}</p>
              <p className="text-zinc-400 font-mono text-[11px]">{order.customerEmail}</p>
              <p className="text-zinc-500 font-mono text-[10px] pt-1">
                Stripe Intent: {order.stripePaymentIntentId}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
              <MapPin className="w-4 h-4 text-amber-400" />
              <span>Fulfillment Shipping Address</span>
            </div>
            <div className="text-xs space-y-0.5 pt-1 text-zinc-300">
              <p>{order.shippingAddress.line1}</p>
              {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
              <p>
                {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                {order.shippingAddress.postalCode}
              </p>
              <p className="font-mono text-zinc-400">{order.shippingAddress.country}</p>
            </div>
          </div>
        </div>

        {/* Order Line Items */}
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-3 font-semibold">
            Order Line Items & Completeful Variants
          </h4>
          <div className="rounded-2xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800/80 bg-zinc-950/60">
            {order.items.map((item) => (
              <div key={item.id} className="p-3.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-zinc-200 block">{item.name}</span>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-400 font-mono mt-0.5">
                    <span>SKU: {item.sku}</span>
                    <span>Size: {item.size}</span>
                    <span>Color: {item.color}</span>
                    <span>Qty: {item.quantity}</span>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="font-bold text-zinc-200 block">
                    ${(item.retailPrice * item.quantity).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-emerald-400 block">
                    Fulfillment quote: ${(item.unitFulfillmentQuote * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Authoritative Quote vs Retail Breakdown */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/90 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-semibold text-xs text-zinc-200">
              Completeful Authoritative Fulfillment Quote
            </span>
            <span className="text-[10px] font-mono text-emerald-400">
              Authoritative (capp_quote_snapshot)
            </span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-zinc-400">
              <span>Fulfillment Garment Subtotal:</span>
              <span>${order.quoteSnapshot.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Standard DTG Carrier Shipping:</span>
              <span>${order.quoteSnapshot.shipping.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Estimated Tax:</span>
              <span>${order.quoteSnapshot.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-zinc-200 pt-1 border-t border-zinc-800/60">
              <span>Total Completeful Fulfillment Cost:</span>
              <span className="text-amber-400">
                ${order.quoteSnapshot.total.toFixed(2)} {order.quoteSnapshot.currency}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-between items-center text-xs font-mono">
            <span className="text-zinc-400">Customer Retail Paid (Stripe):</span>
            <span className="text-sm font-bold text-zinc-100">${order.retailTotal.toFixed(2)}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center text-xs font-mono text-emerald-300">
            <span>Estimated Gross Store Profit:</span>
            <span className="font-bold">
              +${(order.retailTotal - order.quoteSnapshot.total).toFixed(2)} (
              {(
                ((order.retailTotal - order.quoteSnapshot.total) / order.retailTotal) *
                100
              ).toFixed(1)}
              %)
            </span>
          </div>
        </div>
      </div>
    </Drawer>
  );
};
