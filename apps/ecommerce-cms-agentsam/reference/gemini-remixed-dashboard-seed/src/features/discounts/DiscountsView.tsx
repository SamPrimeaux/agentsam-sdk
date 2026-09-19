/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Discounts Management View
 */

import React, { useState } from 'react';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Select } from '../../design-system/Select';
import { Dialog } from '../../design-system/Dialog';
import { DataTable, Column } from '../../design-system/DataTable';
import { Percent, Plus, Tag, Check, Calendar } from 'lucide-react';
import { useToast } from '../../design-system/Toast';

interface DiscountCode {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  status: 'active' | 'scheduled' | 'expired';
  usageCount: number;
  maxUsage?: number;
  minimumOrder?: number;
  validUntil?: string;
}

const INITIAL_DISCOUNTS: DiscountCode[] = [
  {
    id: 'disc_01',
    code: 'TRACKSIDE15',
    type: 'percentage',
    value: 15,
    status: 'active',
    usageCount: 42,
    maxUsage: 100,
    minimumOrder: 50,
    validUntil: '2026-11-01'
  },
  {
    id: 'disc_02',
    code: 'FREESHIPDTG',
    type: 'fixed',
    value: 6.5,
    status: 'active',
    usageCount: 18,
    minimumOrder: 75,
    validUntil: '2026-12-31'
  },
  {
    id: 'disc_03',
    code: 'SUMMERGARAGE',
    type: 'percentage',
    value: 20,
    status: 'expired',
    usageCount: 89,
    maxUsage: 100,
    validUntil: '2026-08-31'
  }
];

export const DiscountsView: React.FC = () => {
  const [discounts, setDiscounts] = useState<DiscountCode[]>(INITIAL_DISCOUNTS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState(10);
  const { addToast } = useToast();

  const handleCreate = () => {
    if (!code.trim()) return;
    const newDiscount: DiscountCode = {
      id: `disc_${Date.now()}`,
      code: code.trim().toUpperCase(),
      type,
      value: Number(value),
      status: 'active',
      usageCount: 0,
      validUntil: '2026-12-31'
    };
    setDiscounts([newDiscount, ...discounts]);
    setIsModalOpen(false);
    setCode('');
    addToast({
      type: 'success',
      title: 'Discount Code Created',
      description: `Code ${newDiscount.code} is now active at checkout.`
    });
  };

  const columns: Column<DiscountCode>[] = [
    {
      key: 'code',
      header: 'Promo Code',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono font-bold text-zinc-100">{row.code}</span>
        </div>
      )
    },
    {
      key: 'discount',
      header: 'Discount',
      render: (row) => (
        <span className="font-mono text-xs text-zinc-200">
          {row.type === 'percentage' ? `${row.value}% OFF` : `$${row.value.toFixed(2)} OFF`}
        </span>
      )
    },
    {
      key: 'usage',
      header: 'Redemptions',
      render: (row) => (
        <span className="font-mono text-xs text-zinc-400">
          {row.usageCount} {row.maxUsage ? `/ ${row.maxUsage}` : 'uses'}
        </span>
      )
    },
    {
      key: 'validUntil',
      header: 'Valid Until',
      render: (row) => (
        <span className="font-mono text-xs text-zinc-400">
          {row.validUntil || 'No expiration'}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge
          variant={row.status === 'active' ? 'emerald' : 'zinc'}
          size="sm"
          dot
        >
          {row.status}
        </Badge>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Discount & Promotional Codes
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure checkout discount percentages, coupon limits, and seasonal campaign incentives.
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setIsModalOpen(true)}
        >
          Create Discount
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={discounts}
        keyExtractor={(row) => row.id}
        emptyMessage="No discount codes configured."
        emptyIcon={<Percent className="w-8 h-8" />}
      />

      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Promotional Discount Code"
        subtitle="Applies automatically at Stripe checkout when entered by customer"
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button size="xs" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button size="xs" variant="primary" onClick={handleCreate} disabled={!code.trim()}>
              Save Code
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Promo Code"
            placeholder="e.g. MOTO20"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Discount Type"
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              options={[
                { label: 'Percentage (%)', value: 'percentage' },
                { label: 'Fixed Amount ($)', value: 'fixed' }
              ]}
            />
            <Input
              label="Value"
              type="number"
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
};
