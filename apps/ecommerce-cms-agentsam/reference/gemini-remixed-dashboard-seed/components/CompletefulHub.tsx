/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import {
  Truck,
  Layers,
  Webhook,
  FileCode,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Plus,
  Play,
  Copy,
  Check,
  Search,
  Key,
  Database,
  ArrowRight,
  Sparkles,
  Sliders,
  DollarSign,
  Package,
  Globe,
  Radio,
  Clock,
  Send,
  Eye
} from 'lucide-react';
import {
  CompletefulShop,
  CompletefulProductLink,
  CompletefulVariantLink,
  CompletefulOrderLink,
  CompletefulOperation,
  CompletefulWebhookSubscription,
  CompletefulWebhookEvent,
  CompletefulConfig
} from '../types';
import { generateWebhookSignature } from '../services/completefulService';

interface CompletefulHubProps {
  shops: CompletefulShop[];
  productLinks: CompletefulProductLink[];
  variantLinks: CompletefulVariantLink[];
  orderLinks: CompletefulOrderLink[];
  operations: CompletefulOperation[];
  webhookSubscriptions: CompletefulWebhookSubscription[];
  webhookEvents: CompletefulWebhookEvent[];
  config: CompletefulConfig;
  onUpdateConfig: (newConfig: CompletefulConfig) => void;
  onUpdateOrders: (orders: CompletefulOrderLink[]) => void;
  onAddWebhookEvent: (event: CompletefulWebhookEvent) => void;
  onAddOperation: (op: CompletefulOperation) => void;
}

export const CompletefulHub: React.FC<CompletefulHubProps> = ({
  shops,
  productLinks,
  variantLinks,
  orderLinks,
  operations,
  webhookSubscriptions,
  webhookEvents,
  config,
  onUpdateConfig,
  onUpdateOrders,
  onAddWebhookEvent,
  onAddOperation
}) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'd1_links' | 'webhooks' | 'operations' | 'settings'>('orders');
  const [selectedOrder, setSelectedOrder] = useState<CompletefulOrderLink | null>(null);
  const [selectedProductLink, setSelectedProductLink] = useState<CompletefulProductLink | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CompletefulWebhookEvent | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // New Order Creation Simulation Modal
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [newOrderVariantId, setNewOrderVariantId] = useState(variantLinks[0]?.id || '');
  const [newOrderCustomer, setNewOrderCustomer] = useState('Jordan Vance');
  const [newOrderEmail, setNewOrderEmail] = useState('jordan.v@rallyspeed.com');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Webhook Test Trigger
  const [testWebhookTopic, setTestWebhookTopic] = useState('order:shipment:created');
  const [testOrderId, setTestOrderId] = useState(orderLinks[0]?.id || '');
  const [isTriggeringWebhook, setIsTriggeringWebhook] = useState(false);

  const isTestKey = config.cappKey.startsWith('capp_test_');
  const isDryRunActive = isTestKey || !config.allowLiveWrites;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Submit simulated Stripe Paid -> Completeful Order Link
  const handleCreateOrder = () => {
    const selectedVariant = variantLinks.find(v => v.id === newOrderVariantId);
    if (!selectedVariant) return;

    setIsSubmittingOrder(true);

    setTimeout(() => {
      const orderNumber = Math.floor(1000 + Math.random() * 9000);
      const localOrderId = `FFT-ORD-2026-${orderNumber}`;
      const idempotencyKey = `idemp_fft_ord_${orderNumber}_v1`;
      const fulfillmentCost = selectedVariant.fulfillmentCostQuote;
      const shippingCost = 5.99;
      const taxCost = Number((fulfillmentCost * 0.08).toFixed(2));
      const quoteTotal = Number((fulfillmentCost + shippingCost + taxCost).toFixed(2));

      const newOrder: CompletefulOrderLink = {
        id: `ord_link_${Date.now()}`,
        localOrderId,
        stripePaymentIntentId: `pi_3Mtw${Math.random().toString(36).substring(2, 9)}`,
        customerEmail: newOrderEmail,
        customerName: newOrderCustomer,
        shippingAddress: {
          line1: '450 Desert Creek Road',
          city: 'Moab',
          state: 'UT',
          postalCode: '84532',
          country: 'US'
        },
        completefulFulfillmentOrderId: `capp_ord_ful_${Math.floor(10000 + Math.random() * 90000)}`,
        status: 'created',
        quoteSnapshot: {
          subtotal: fulfillmentCost,
          shipping: shippingCost,
          tax: taxCost,
          total: quoteTotal,
          currency: 'USD'
        },
        retailTotal: selectedVariant.retailPrice,
        trackingCarrier: 'USPS Priority',
        idempotencyKey,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        items: [
          {
            id: `item_${Date.now()}`,
            sku: selectedVariant.sku,
            name: `${selectedVariant.color} ${selectedVariant.size}`,
            quantity: 1,
            size: selectedVariant.size,
            color: selectedVariant.color,
            variantLinkId: selectedVariant.id,
            unitFulfillmentQuote: selectedVariant.fulfillmentCostQuote,
            retailPrice: selectedVariant.retailPrice
          }
        ],
        isDryRun: isDryRunActive
      };

      // Also record operation
      const op: CompletefulOperation = {
        id: `op_${Date.now()}`,
        operationType: 'order_submit',
        resourceId: localOrderId,
        idempotencyKey,
        status: 'success',
        requestPayload: {
          shopId: config.selectedShopId,
          clientOrderId: localOrderId,
          dryRun: isDryRunActive,
          items: [{ sku: selectedVariant.sku, quantity: 1 }]
        },
        responsePayload: {
          status: 'accepted',
          cappOrderId: newOrder.completefulFulfillmentOrderId,
          dryRun: isDryRunActive,
          quoteTotal
        },
        isDryRun: isDryRunActive,
        timestamp: Date.now()
      };

      onAddOperation(op);
      onUpdateOrders([newOrder, ...orderLinks]);
      setIsSubmittingOrder(false);
      setShowNewOrderModal(false);
      setSelectedOrder(newOrder);
    }, 600);
  };

  // Simulate incoming Completeful Webhook with HMAC-SHA256 signature
  const handleSimulateWebhook = () => {
    const targetOrder = orderLinks.find(o => o.id === testOrderId) || orderLinks[0];
    if (!targetOrder) return;

    setIsTriggeringWebhook(true);

    setTimeout(() => {
      let updatedStatus: CompletefulOrderLink['status'] = targetOrder.status;
      let newTrackingNumber = targetOrder.trackingNumber;
      let newTrackingUrl = targetOrder.trackingUrl;
      let payload: any = {};

      if (testWebhookTopic === 'order:sent-to-production') {
        updatedStatus = 'sent-to-production';
        payload = {
          event: 'order:sent-to-production',
          shopId: config.selectedShopId,
          orderId: targetOrder.completefulFulfillmentOrderId,
          localOrderId: targetOrder.localOrderId,
          batchId: `BATCH-POD-${Math.floor(1000 + Math.random() * 9000)}`,
          facility: 'Completeful Hub West (DTG Unit 3)'
        };
      } else if (testWebhookTopic === 'order:shipment:created') {
        updatedStatus = 'shipped';
        newTrackingNumber = `9400111899${Math.floor(100000000000 + Math.random() * 900000000000)}`;
        newTrackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${newTrackingNumber}`;
        payload = {
          event: 'order:shipment:created',
          shopId: config.selectedShopId,
          orderId: targetOrder.completefulFulfillmentOrderId,
          localOrderId: targetOrder.localOrderId,
          shipment: {
            carrier: 'USPS Ground Advantage',
            trackingNumber: newTrackingNumber,
            trackingUrl: newTrackingUrl,
            packagesCount: 1
          }
        };
      } else if (testWebhookTopic === 'order:cancelled') {
        updatedStatus = 'cancelled';
        payload = {
          event: 'order:cancelled',
          shopId: config.selectedShopId,
          orderId: targetOrder.completefulFulfillmentOrderId,
          localOrderId: targetOrder.localOrderId,
          reason: 'Customer requested cancellation prior to print run'
        };
      } else {
        payload = {
          event: 'ping',
          shopId: config.selectedShopId,
          message: 'Completeful Webhook endpoint handshake verified successfully',
          timestamp: Date.now()
        };
      }

      const { header } = generateWebhookSignature(payload, config.webhookSecret);

      const newEvent: CompletefulWebhookEvent = {
        id: `evt_${Date.now()}`,
        eventId: `evt_capp_${Math.random().toString(36).substring(7)}`,
        topic: testWebhookTopic,
        signature: header,
        signatureVerified: true,
        timestamp: Date.now(),
        payload,
        processingStatus: 'processed',
        diagnostics: `HMAC verified with secret ...${config.webhookSecret.slice(-4)}. Updated local order ${targetOrder.localOrderId} state to "${updatedStatus}".`
      };

      // Update order state
      if (testWebhookTopic.startsWith('order:')) {
        const updatedOrders = orderLinks.map(o => {
          if (o.id === targetOrder.id) {
            return {
              ...o,
              status: updatedStatus,
              trackingNumber: newTrackingNumber,
              trackingUrl: newTrackingUrl,
              updatedAt: Date.now()
            };
          }
          return o;
        });
        onUpdateOrders(updatedOrders);
      }

      onAddWebhookEvent(newEvent);
      setSelectedEvent(newEvent);
      setIsTriggeringWebhook(false);
    }, 500);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Completeful Integration Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900 to-indigo-950/40 border border-zinc-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Truck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white uppercase tracking-tight">
                Completeful Technologies Provider Hub
              </h1>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1 ${
                  isDryRunActive
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}
              >
                <Radio size={10} className="animate-pulse" />
                {isDryRunActive ? 'X-Capp-Mode: TEST (Dry-Run)' : 'LIVE WRITES ACTIVE'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Shop ID: <span className="font-mono text-zinc-300">{config.selectedShopId}</span> • Endpoint:{' '}
              <span className="font-mono text-zinc-300">{config.apiUrl}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowNewOrderModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-orange-500/20"
          >
            <Plus size={15} />
            Simulate Paid Order
          </button>
          <button
            onClick={() => setActiveTab('webhooks')}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors border border-zinc-700"
          >
            <Webhook size={14} className="text-indigo-400" />
            Webhook Test
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 space-x-1 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { id: 'orders', label: 'Order Lifecycle & Quotes', count: orderLinks.length, icon: <Truck size={15} /> },
          { id: 'd1_links', label: 'D1 Link Registry (Products & Variants)', count: productLinks.length, icon: <Database size={15} /> },
          { id: 'webhooks', label: 'Webhooks & HMAC Verification', count: webhookEvents.length, icon: <Webhook size={15} /> },
          { id: 'operations', label: 'Operations Ledger', count: operations.length, icon: <Clock size={15} /> },
          { id: 'settings', label: 'API Keys & Secrets', icon: <Key size={15} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  activeTab === tab.id ? 'bg-indigo-800 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: ORDERS & FULFILLMENT LIFECYCLE */}
      {activeTab === 'orders' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-white">Active Fulfillment Orders</h3>
                <p className="text-xs text-zinc-400">
                  F&FT Order → Stripe Paid → <span className="font-mono text-indigo-400">completeful_order_links</span> → Completeful POD
                </p>
              </div>
              <span className="text-xs text-zinc-500 font-mono">
                {orderLinks.length} total orders tracked
              </span>
            </div>

            <div className="space-y-3">
              {orderLinks.map(order => {
                const isSelected = selectedOrder?.id === order.id;
                const statusColors = {
                  'created': 'bg-blue-500/20 text-blue-300 border-blue-500/40',
                  'sent-to-production': 'bg-purple-500/20 text-purple-300 border-purple-500/40',
                  'in-production': 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                  'shipped': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                  'delivered': 'bg-teal-500/20 text-teal-300 border-teal-500/40',
                  'cancelled': 'bg-red-500/20 text-red-300 border-red-500/40',
                  'refunded': 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40'
                };

                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-500/10'
                        : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white font-mono">{order.localOrderId}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-mono font-bold border ${statusColors[order.status]}`}>
                            {order.status}
                          </span>
                          {order.isDryRun && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono border border-amber-500/20">
                              Dry-Run
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Customer: <strong className="text-zinc-200">{order.customerName}</strong> ({order.customerEmail})
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-mono">
                          <span className="text-zinc-400">Completeful Cost: </span>
                          <span className="font-bold text-amber-400">${order.quoteSnapshot.total.toFixed(2)}</span>
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          Store Retail: <strong className="text-zinc-300">${order.retailTotal.toFixed(2)}</strong> (Margin: ${(order.retailTotal - order.quoteSnapshot.total).toFixed(2)})
                        </div>
                      </div>
                    </div>

                    {/* Items preview */}
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-xs text-zinc-400">
                      <span className="truncate max-w-[280px]">
                        {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                      </span>
                      {order.trackingNumber ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-mono">
                          <CheckCircle2 size={12} /> {order.trackingCarrier}: {order.trackingNumber.slice(0, 10)}...
                        </span>
                      ) : (
                        <span className="text-zinc-500">Awaiting dispatch</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order Details Panel */}
          <div className="glass-panel p-5 rounded-2xl border border-zinc-800 space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Truck size={16} className="text-indigo-400" />
              Completeful Fulfillment Snapshot
            </h3>

            {selectedOrder ? (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-zinc-900 rounded-xl space-y-2 border border-zinc-800">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">F&FT Order ID:</span>
                    <span className="font-mono text-white font-bold">{selectedOrder.localOrderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Completeful Fulfillment ID:</span>
                    <span className="font-mono text-indigo-400">{selectedOrder.completefulFulfillmentOrderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Stripe Payment Intent:</span>
                    <span className="font-mono text-zinc-300">{selectedOrder.stripePaymentIntentId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Idempotency-Key:</span>
                    <span className="font-mono text-zinc-300">{selectedOrder.idempotencyKey}</span>
                  </div>
                </div>

                {/* Authoritative Completeful Quote Breakdown */}
                <div className="p-3 bg-zinc-900/90 rounded-xl border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="font-bold text-amber-300">Authoritative Completeful Quote</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">
                      Fulfillment Pricing
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Manufacturing Subtotal:</span>
                    <span className="text-white font-mono">${selectedOrder.quoteSnapshot.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Carrier Shipping:</span>
                    <span className="text-white font-mono">${selectedOrder.quoteSnapshot.shipping.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Production Tax:</span>
                    <span className="text-white font-mono">${selectedOrder.quoteSnapshot.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-800 pt-2 font-bold text-sm">
                    <span className="text-white">Completeful Charge:</span>
                    <span className="text-amber-400 font-mono">${selectedOrder.quoteSnapshot.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Shipping & Tracking */}
                <div className="p-3 bg-zinc-900 rounded-xl space-y-2 border border-zinc-800">
                  <span className="font-bold text-zinc-200">Delivery Destination & Tracking</span>
                  <p className="text-zinc-400">
                    {selectedOrder.shippingAddress.line1}, {selectedOrder.shippingAddress.city},{' '}
                    {selectedOrder.shippingAddress.state} {selectedOrder.shippingAddress.postalCode},{' '}
                    {selectedOrder.shippingAddress.country}
                  </p>
                  {selectedOrder.trackingNumber ? (
                    <div className="pt-2 border-t border-zinc-800 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Carrier:</span>
                        <span className="text-white font-semibold">{selectedOrder.trackingCarrier}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Tracking Number:</span>
                        <span className="font-mono text-emerald-400 font-bold">{selectedOrder.trackingNumber}</span>
                      </div>
                      {selectedOrder.trackingUrl && (
                        <a
                          href={selectedOrder.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium mt-1"
                        >
                          <ExternalLink size={12} /> Track on Carrier Portal
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-amber-400/80 italic pt-1">Garment is currently queued in Completeful production.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-500">
                <Truck size={36} className="mx-auto mb-2 opacity-30" />
                <p>Select an order on the left to inspect its Completeful quote and link ledger.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: D1 LINK REGISTRY */}
      {activeTab === 'd1_links' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <h3 className="font-bold text-sm text-white mb-1">D1 Commerce Link Registry</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              F&FT keeps local products, variants, and Stripe authoritative for storefront commerce. Completeful gets link tables (<code className="text-indigo-400">completeful_product_links</code>, <code className="text-indigo-400">completeful_variant_links</code>) carrying design metadata and fulfillment cost quotes.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Product Links */}
            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Product Links (completeful_product_links)
              </h4>
              <div className="space-y-3">
                {productLinks.map(plink => {
                  const variants = variantLinks.filter(v => v.productLinkId === plink.id);
                  const isSelected = selectedProductLink?.id === plink.id;

                  return (
                    <div
                      key={plink.id}
                      onClick={() => setSelectedProductLink(plink)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected ? 'bg-indigo-950/40 border-indigo-500' : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex gap-4">
                        <img
                          src={plink.thumbnailUrl}
                          alt={plink.productTitle}
                          className="w-16 h-16 rounded-lg object-cover bg-zinc-950 border border-zinc-700 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h5 className="font-bold text-sm text-white truncate">{plink.productTitle}</h5>
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-500/40">
                              {plink.status}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 font-mono mt-1">
                            Local ID: <span className="text-zinc-200">{plink.localProductId}</span> • Completeful Store ID: <span className="text-indigo-400">{plink.completefulStoreProductId}</span>
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-400 flex-wrap">
                            <span>Design: <strong className="font-mono text-zinc-200">{plink.completefulDesignId}</strong></span>
                            <span>Technique: <strong className="uppercase text-amber-400">{plink.designOptionMetadata.printTechnique}</strong></span>
                            <span>Locations: <strong>{plink.designOptionMetadata.printLocations.join(', ')}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Associated Variants */}
                      <div className="mt-3 pt-3 border-t border-zinc-800/80">
                        <span className="text-[11px] font-bold text-zinc-400 block mb-1">
                          Linked Variants ({variants.length})
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {variants.map(v => (
                            <div key={v.id} className="p-2 bg-zinc-950 rounded-lg border border-zinc-800 text-[11px]">
                              <div className="flex justify-between font-mono font-bold text-white">
                                <span>{v.size} - {v.color}</span>
                                <span className="text-amber-400">${v.fulfillmentCostQuote.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-zinc-500 text-[10px] mt-0.5">
                                <span>SKU: {v.sku}</span>
                                <span>Retail: ${v.retailPrice}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Link Details / Schema Inspector */}
            <div className="glass-panel p-5 rounded-2xl border border-zinc-800 space-y-4 text-xs">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <Database size={16} className="text-indigo-400" />
                D1 Table Schema Reference
              </h4>

              <div className="p-3 bg-zinc-900 rounded-xl space-y-2 border border-zinc-800 font-mono text-[11px]">
                <p className="text-amber-400 font-bold">// completeful_product_links</p>
                <p className="text-zinc-300">id TEXT PRIMARY KEY</p>
                <p className="text-zinc-300">local_product_id TEXT NOT NULL</p>
                <p className="text-zinc-300">completeful_store_product_id TEXT</p>
                <p className="text-zinc-300">completeful_catalog_id TEXT</p>
                <p className="text-zinc-300">completeful_design_id TEXT</p>
                <p className="text-zinc-300">design_option_metadata TEXT -- JSON</p>
              </div>

              <div className="p-3 bg-zinc-900 rounded-xl space-y-2 border border-zinc-800 font-mono text-[11px]">
                <p className="text-indigo-400 font-bold">// completeful_variant_links</p>
                <p className="text-zinc-300">id TEXT PRIMARY KEY</p>
                <p className="text-zinc-300">local_variant_id TEXT NOT NULL</p>
                <p className="text-zinc-300">product_link_id TEXT REFERENCES ...</p>
                <p className="text-zinc-300">completeful_catalog_child_id TEXT</p>
                <p className="text-zinc-300">fulfillment_cost_quote REAL -- Auth</p>
                <p className="text-zinc-300">retail_price REAL</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WEBHOOKS & HMAC SIGNATURE VERIFICATION */}
      {activeTab === 'webhooks' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Subscriptions & Event Simulator */}
          <div className="lg:col-span-2 space-y-6">
            {/* Simulator Box */}
            <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-700 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Play size={16} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Completeful Webhook Event Simulator</h4>
                    <p className="text-xs text-zinc-400">Dispatches simulated payload with HMAC-SHA256 signature to endpoint</p>
                  </div>
                </div>
                <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-md">
                  POST /api/webhooks/completeful
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Event Topic</label>
                  <select
                    value={testWebhookTopic}
                    onChange={(e) => setTestWebhookTopic(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                  >
                    <option value="order:sent-to-production">order:sent-to-production</option>
                    <option value="order:shipment:created">order:shipment:created</option>
                    <option value="order:cancelled">order:cancelled</option>
                    <option value="ping">ping (endpoint test)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Target Order</label>
                  <select
                    value={testOrderId}
                    onChange={(e) => setTestOrderId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                  >
                    {orderLinks.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.localOrderId} ({o.status}) - {o.customerName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-zinc-400 font-mono">
                  HMAC secret: <strong className="text-zinc-200">...{config.webhookSecret.slice(-4)}</strong> (X-Capp-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;)
                </span>
                <button
                  onClick={handleSimulateWebhook}
                  disabled={isTriggeringWebhook}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Send size={14} />
                  {isTriggeringWebhook ? 'Dispatching & Verifying...' : 'Dispatch Webhook Event'}
                </button>
              </div>
            </div>

            {/* Event History */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>Webhook Delivery History (completeful_webhook_events)</span>
                <span className="font-mono text-zinc-500">{webhookEvents.length} events logged</span>
              </h4>

              <div className="space-y-2">
                {webhookEvents.map(evt => {
                  const isSelected = selectedEvent?.id === evt.id;
                  return (
                    <div
                      key={evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected ? 'bg-indigo-950/40 border-indigo-500' : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-400">{evt.topic}</span>
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono border border-emerald-500/30">
                            HMAC Verified
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 font-mono truncate">{evt.signature}</p>
                      <p className="text-[11px] text-zinc-400 mt-1">{evt.diagnostics}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Subscriptions & Event Payload Inspector */}
          <div className="glass-panel p-5 rounded-2xl border border-zinc-800 space-y-4 text-xs">
            <h4 className="font-bold text-sm text-white flex items-center gap-2">
              <Webhook size={16} className="text-indigo-400" />
              Event Payload & Diagnostic Log
            </h4>

            {selectedEvent ? (
              <div className="space-y-3">
                <div className="p-3 bg-zinc-900 rounded-xl space-y-2 border border-zinc-800">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Event ID:</span>
                    <span className="font-mono text-white">{selectedEvent.eventId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Topic:</span>
                    <span className="font-mono text-indigo-400 font-bold">{selectedEvent.topic}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Processing:</span>
                    <span className="font-mono text-emerald-400">{selectedEvent.processingStatus}</span>
                  </div>
                </div>

                <div>
                  <span className="text-zinc-400 font-mono block mb-1">Payload JSON:</span>
                  <pre className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-[11px] text-zinc-300 font-mono overflow-x-auto max-h-64">
                    {JSON.stringify(selectedEvent.payload, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-500">
                <FileCode size={36} className="mx-auto mb-2 opacity-30" />
                <p>Click any logged webhook event to inspect the JSON payload and verification details.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: OPERATIONS LEDGER */}
      {activeTab === 'operations' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-white">Durable Mutation & Retry Ledger (completeful_operations)</h3>
              <p className="text-xs text-zinc-400">
                Tracks shop-scoped requests with <code className="text-indigo-400">Idempotency-Key</code> for safe replays and dry-run execution.
              </p>
            </div>
            <span className="text-xs text-zinc-500 font-mono">{operations.length} operations logged</span>
          </div>

          <div className="space-y-3">
            {operations.map(op => (
              <div key={op.id} className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white uppercase font-mono">{op.operationType}</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono border border-emerald-500/30">
                      {op.status}
                    </span>
                    {op.isDryRun && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono border border-amber-500/30">
                        Dry Run
                      </span>
                    )}
                  </div>
                  <span className="text-zinc-500 font-mono text-[11px]">
                    {new Date(op.timestamp).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-zinc-400 font-mono text-[11px] pt-1">
                  <span>Resource: <strong className="text-zinc-200">{op.resourceId}</strong></span>
                  <span>Idempotency-Key: <strong className="text-indigo-400">{op.idempotencyKey}</strong></span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div>
                    <span className="text-[10px] text-zinc-500 font-mono uppercase block mb-1">Request Payload</span>
                    <pre className="p-2 bg-zinc-950 rounded-lg border border-zinc-800 text-[10px] text-zinc-300 font-mono max-h-32 overflow-y-auto">
                      {JSON.stringify(op.requestPayload, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 font-mono uppercase block mb-1">Response Payload</span>
                    <pre className="p-2 bg-zinc-950 rounded-lg border border-zinc-800 text-[10px] text-emerald-300 font-mono max-h-32 overflow-y-auto">
                      {JSON.stringify(op.responsePayload, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: SETTINGS & SECRETS */}
      {activeTab === 'settings' && (
        <div className="max-w-3xl space-y-6">
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-6">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <Key size={18} className="text-amber-400" />
              Completeful Technologies API Configuration
            </h3>

            <div className="space-y-4 text-xs">
              {/* CAPP_KEY */}
              <div>
                <label className="block text-zinc-300 font-bold mb-1">
                  Completeful API Key (CAPP_KEY)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={config.cappKey}
                    onChange={(e) => onUpdateConfig({ ...config, cappKey: e.target.value })}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-indigo-500"
                    placeholder="capp_test_... or capp_live_..."
                  />
                  <button
                    onClick={() => handleCopy(config.cappKey, 'capp_key')}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center gap-1 transition-colors"
                  >
                    {copiedText === 'capp_key' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-zinc-500 mt-1">
                  Using <code className="text-amber-400">capp_test_</code> automatically sets <code className="text-zinc-300">X-Capp-Mode: test</code> and <code className="text-zinc-300">X-Capp-Dry-Run: true</code>.
                </p>
              </div>

              {/* CAPP_API_URL */}
              <div>
                <label className="block text-zinc-300 font-bold mb-1">
                  API Endpoint Base URL (CAPP_API_URL)
                </label>
                <input
                  type="text"
                  value={config.apiUrl}
                  onChange={(e) => onUpdateConfig({ ...config, apiUrl: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-indigo-500"
                  placeholder="https://vxapi.completeful.com"
                />
              </div>

              {/* COMPLETEFUL_ALLOW_LIVE_WRITES Kill Switch */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-sm">
                    Allow Live Production Writes (COMPLETEFUL_ALLOW_LIVE_WRITES)
                  </h4>
                  <p className="text-zinc-400 mt-0.5">
                    Safety kill switch. Even if a live key is supplied, mutating calls remain blocked when disabled.
                  </p>
                </div>
                <button
                  onClick={() => onUpdateConfig({ ...config, allowLiveWrites: !config.allowLiveWrites })}
                  className={`w-14 h-8 rounded-full transition-colors relative p-1 ${
                    config.allowLiveWrites ? 'bg-red-600' : 'bg-zinc-700'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full bg-white transition-transform ${
                      config.allowLiveWrites ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* COMPLETEFUL_WEBHOOK_SECRET */}
              <div>
                <label className="block text-zinc-300 font-bold mb-1">
                  Webhook Signing Secret (COMPLETEFUL_WEBHOOK_SECRET)
                </label>
                <input
                  type="password"
                  value={config.webhookSecret}
                  onChange={(e) => onUpdateConfig({ ...config, webhookSecret: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-indigo-500"
                  placeholder="whsec_..."
                />
                <p className="text-zinc-500 mt-1">
                  Used for HMAC-SHA256 signature verification over <code className="text-zinc-300">&lt;timestamp&gt;.&lt;rawBody&gt;</code>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW SIMULATED ORDER MODAL */}
      {showNewOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-lg w-full p-6 rounded-2xl border border-zinc-700 space-y-4 animate-fade-in text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Truck size={18} className="text-amber-400" />
                Simulate Paid F&FT Storefront Order
              </h3>
              <button
                onClick={() => setShowNewOrderModal(false)}
                className="text-zinc-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-zinc-400 leading-relaxed">
              Simulates the customer checkout completing on Stripe and triggering the <code className="text-indigo-400">completeful_order_links</code> fulfillment order pipeline.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-zinc-300 font-semibold mb-1">Customer Name</label>
                <input
                  type="text"
                  value={newOrderCustomer}
                  onChange={(e) => setNewOrderCustomer(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-semibold mb-1">Customer Email</label>
                <input
                  type="email"
                  value={newOrderEmail}
                  onChange={(e) => setNewOrderEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-semibold mb-1">Apparel Item & Variant</label>
                <select
                  value={newOrderVariantId}
                  onChange={(e) => setNewOrderVariantId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                >
                  {variantLinks.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.sku} ({v.size} / {v.color}) — Completeful Quote: ${v.fulfillmentCostQuote.toFixed(2)} | Retail: ${v.retailPrice.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 space-y-1 font-mono text-[11px]">
              <div className="flex justify-between text-zinc-400">
                <span>Completeful Authoritative Quote:</span>
                <span className="text-amber-400 font-bold">
                  ${(variantLinks.find(v => v.id === newOrderVariantId)?.fulfillmentCostQuote || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Shipping & Carrier Fee:</span>
                <span className="text-white">$5.99</span>
              </div>
              <div className="flex justify-between text-white font-bold border-t border-zinc-800 pt-1">
                <span>Estimated Completeful Total:</span>
                <span className="text-amber-400">
                  ${((variantLinks.find(v => v.id === newOrderVariantId)?.fulfillmentCostQuote || 0) + 5.99 + 1.50).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewOrderModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOrder}
                disabled={isSubmittingOrder}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-zinc-950 font-bold rounded-xl flex items-center gap-2"
              >
                {isSubmittingOrder ? 'Dispatching...' : 'Dispatch Order to Completeful'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
