/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Orders Management View
 */

import React, { useState } from 'react';
import { CompletefulOrderLink } from '../../types';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { DataTable, Column } from '../../design-system/DataTable';
import { OrderDetailDrawer } from './OrderDetailDrawer';
import {
  Search,
  Filter,
  ShoppingBag,
  Truck,
  ExternalLink,
  Send,
  Eye,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '../../design-system/Toast';

export const INITIAL_ORDERS: CompletefulOrderLink[] = [
  {
    id: 'ord_link_01',
    localOrderId: 'FFT-9402',
    stripePaymentIntentId: 'pi_3PqL920kL88102',
    customerEmail: 'alex.vance@gmail.com',
    customerName: 'Alex Vance',
    shippingAddress: {
      line1: '742 Evergreen Terrace',
      city: 'Springfield',
      state: 'OR',
      postalCode: '97477',
      country: 'US'
    },
    completefulFulfillmentOrderId: 'capp_ord_9901',
    status: 'shipped',
    quoteSnapshot: {
      subtotal: 57.0,
      shipping: 6.5,
      tax: 4.8,
      total: 68.3,
      currency: 'USD'
    },
    retailTotal: 136.0,
    trackingCarrier: 'USPS',
    trackingNumber: '9400111899223400192',
    trackingUrl: 'https://tools.usps.com',
    idempotencyKey: 'idemp_order_fft_9402_capp',
    createdAt: Date.now() - 1000 * 60 * 60 * 18,
    updatedAt: Date.now() - 1000 * 60 * 45,
    isDryRun: true,
    items: [
      {
        id: 'item_01',
        sku: 'FFT-HD-BLK-L',
        name: 'Heavyweight DTG Hoodie (Black)',
        quantity: 2,
        size: 'L',
        color: 'Black',
        variantLinkId: 'var_link_01',
        unitFulfillmentQuote: 28.5,
        retailPrice: 68.0
      }
    ]
  },
  {
    id: 'ord_link_02',
    localOrderId: 'FFT-9403',
    stripePaymentIntentId: 'pi_3PqL819mK00129',
    customerEmail: 'casey.rider@icloud.com',
    customerName: 'Casey Rider',
    shippingAddress: {
      line1: '1088 Desert Track Rd',
      city: 'Moab',
      state: 'UT',
      postalCode: '84532',
      country: 'US'
    },
    status: 'created',
    quoteSnapshot: {
      subtotal: 16.5,
      shipping: 5.5,
      tax: 1.4,
      total: 23.4,
      currency: 'USD'
    },
    retailTotal: 42.0,
    idempotencyKey: 'idemp_order_fft_9403_capp',
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
    updatedAt: Date.now() - 1000 * 60 * 60 * 4,
    isDryRun: true,
    items: [
      {
        id: 'item_02',
        sku: 'FFT-TEE-CHR-XXL',
        name: 'Vintage Washed Trackside Tee',
        quantity: 1,
        size: 'XXL',
        color: 'Charcoal',
        variantLinkId: 'var_link_02',
        unitFulfillmentQuote: 16.5,
        retailPrice: 42.0
      }
    ]
  },
  {
    id: 'ord_link_03',
    localOrderId: 'FFT-9401',
    stripePaymentIntentId: 'pi_3PqL702kL11092',
    customerEmail: 'marcus.motocross@yahoo.com',
    customerName: 'Marcus Bell',
    shippingAddress: {
      line1: '400 Speedway Blvd',
      city: 'Charlotte',
      state: 'NC',
      postalCode: '28202',
      country: 'US'
    },
    completefulFulfillmentOrderId: 'capp_ord_9844',
    status: 'in-production',
    quoteSnapshot: {
      subtotal: 28.5,
      shipping: 5.5,
      tax: 2.2,
      total: 36.2,
      currency: 'USD'
    },
    retailTotal: 68.0,
    idempotencyKey: 'idemp_order_fft_9401_capp',
    createdAt: Date.now() - 1000 * 60 * 60 * 28,
    updatedAt: Date.now() - 1000 * 60 * 60 * 6,
    isDryRun: true,
    items: [
      {
        id: 'item_03',
        sku: 'FFT-HD-BLK-M',
        name: 'Heavyweight DTG Hoodie (Black)',
        quantity: 1,
        size: 'M',
        color: 'Black',
        variantLinkId: 'var_link_01',
        unitFulfillmentQuote: 28.5,
        retailPrice: 68.0
      }
    ]
  }
];

export const OrdersView: React.FC = () => {
  const [orders, setOrders] = useState<CompletefulOrderLink[]>(INITIAL_ORDERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [activeOrder, setActiveOrder] = useState<CompletefulOrderLink | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { addToast } = useToast();

  const handleDispatchDryRun = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'sent-to-production',
              completefulFulfillmentOrderId: `capp_ord_dry_${Math.random().toString(36).substring(6)}`,
              updatedAt: Date.now()
            }
          : o
      )
    );
  };

  const filteredOrders = orders.filter((order) => {
    const matchesQuery =
      order.localOrderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.stripePaymentIntentId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === 'all' || order.status === selectedStatus;

    return matchesQuery && matchesStatus;
  });

  const getStatusBadge = (status: CompletefulOrderLink['status']) => {
    switch (status) {
      case 'created':
        return <Badge variant="sky">Created</Badge>;
      case 'sent-to-production':
        return <Badge variant="amber">Dispatched</Badge>;
      case 'in-production':
        return <Badge variant="purple">In Production</Badge>;
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

  const columns: Column<CompletefulOrderLink>[] = [
    {
      key: 'localOrderId',
      header: 'Order & Customer',
      render: (row) => (
        <div>
          <span className="font-semibold text-zinc-100 font-mono block">
            #{row.localOrderId}
          </span>
          <span className="text-[11px] text-zinc-400 block">{row.customerName}</span>
          <span className="text-[10px] text-zinc-500 font-mono">{row.customerEmail}</span>
        </div>
      )
    },
    {
      key: 'stripePaymentIntentId',
      header: 'Stripe Intent',
      render: (row) => (
        <span className="font-mono text-[11px] text-zinc-400 block truncate max-w-[120px]">
          {row.stripePaymentIntentId}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Fulfillment State',
      render: (row) => (
        <div className="space-y-1">
          {getStatusBadge(row.status)}
          {row.isDryRun && (
            <span className="text-[9px] font-mono text-amber-400/90 block">
              dry_run
            </span>
          )}
        </div>
      )
    },
    {
      key: 'retailTotal',
      header: 'Retail Total',
      render: (row) => (
        <span className="font-bold text-zinc-200 font-mono">
          ${row.retailTotal.toFixed(2)}
        </span>
      )
    },
    {
      key: 'quoteSnapshot',
      header: 'Completeful Quote',
      render: (row) => (
        <div>
          <span className="font-mono text-emerald-400 font-semibold block">
            ${row.quoteSnapshot.total.toFixed(2)}
          </span>
          <span className="text-[10px] font-mono text-zinc-500">Authoritative</span>
        </div>
      )
    },
    {
      key: 'tracking',
      header: 'Tracking / Dispatch',
      render: (row) => (
        <div>
          {row.trackingNumber ? (
            <span className="font-mono text-[11px] text-amber-400 font-medium block">
              {row.trackingCarrier} #{row.trackingNumber.substring(0, 10)}...
            </span>
          ) : row.status === 'created' ? (
            <span className="text-[11px] text-sky-400 font-mono">Pending Dispatch</span>
          ) : (
            <span className="text-[11px] text-purple-400 font-mono">Awaiting Carrier</span>
          )}
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="xs"
            variant="ghost"
            icon={<Eye className="w-3.5 h-3.5" />}
            onClick={() => {
              setActiveOrder(row);
              setIsDrawerOpen(true);
            }}
          >
            Inspect
          </Button>
          {row.status === 'created' && (
            <Button
              size="xs"
              variant="primary"
              icon={<Send className="w-3 h-3" />}
              onClick={(e) => {
                e.stopPropagation();
                handleDispatchDryRun(row.id);
                addToast({
                  type: 'success',
                  title: 'Order Dispatched (Dry Run)',
                  description: `Order #${row.localOrderId} dispatched to Completeful.`
                });
              }}
            >
              Dispatch
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Orders & Fulfillment</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Full order lifecycle: Local Order ➔ Stripe Paid ➔ completeful_order_links ➔ Completeful Dispatch ➔ Webhook Tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="amber" size="md">
            Test Mode: Authenticated Dry Runs
          </Badge>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card padding="sm" className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-72">
          <Input
            placeholder="Search order #, customer, email, Stripe ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-3.5 h-3.5" />}
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-hide">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'created', label: 'Created' },
            { id: 'sent-to-production', label: 'Dispatched' },
            { id: 'in-production', label: 'In Production' },
            { id: 'shipped', label: 'Shipped' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                selectedStatus === tab.id
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/80 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Orders Table */}
      <DataTable
        columns={columns}
        data={filteredOrders}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => {
          setActiveOrder(row);
          setIsDrawerOpen(true);
        }}
        emptyMessage="No orders found matching the filter criteria."
        emptyIcon={<ShoppingBag className="w-8 h-8" />}
      />

      {/* Order Detail Drawer */}
      <OrderDetailDrawer
        order={activeOrder}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onDispatchDryRun={handleDispatchDryRun}
      />
    </div>
  );
};
