/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Inventory Operations View
 */

import React, { useState } from 'react';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { DataTable, Column } from '../../design-system/DataTable';
import { Boxes, Search, AlertTriangle, CheckCircle2, RefreshCw, Truck } from 'lucide-react';
import { useToast } from '../../design-system/Toast';

interface InventoryItem {
  id: string;
  sku: string;
  productName: string;
  size: string;
  color: string;
  completefulBlankSku: string;
  available: number;
  reserved: number;
  committed: number;
  threshold: number;
  status: 'healthy' | 'low_stock' | 'out_of_stock';
}

const INITIAL_INVENTORY: InventoryItem[] = [
  {
    id: 'inv_01',
    sku: 'FFT-HD-BLK-M',
    productName: 'Heavyweight DTG Hoodie',
    size: 'M',
    color: 'Pitch Black',
    completefulBlankSku: 'cat_blank_gildan_blk_m',
    available: 48,
    reserved: 4,
    committed: 2,
    threshold: 15,
    status: 'healthy'
  },
  {
    id: 'inv_02',
    sku: 'FFT-HD-BLK-L',
    productName: 'Heavyweight DTG Hoodie',
    size: 'L',
    color: 'Pitch Black',
    completefulBlankSku: 'cat_blank_gildan_blk_l',
    available: 24,
    reserved: 6,
    committed: 3,
    threshold: 15,
    status: 'healthy'
  },
  {
    id: 'inv_03',
    sku: 'FFT-HD-BLK-XL',
    productName: 'Heavyweight DTG Hoodie',
    size: 'XL',
    color: 'Pitch Black',
    completefulBlankSku: 'cat_blank_gildan_blk_xl',
    available: 6,
    reserved: 4,
    committed: 2,
    threshold: 15,
    status: 'low_stock'
  },
  {
    id: 'inv_04',
    sku: 'FFT-TEE-CHR-L',
    productName: 'Vintage Washed Trackside Tee',
    size: 'L',
    color: 'Washed Charcoal',
    completefulBlankSku: 'cat_blank_shaka_chr_l',
    available: 35,
    reserved: 2,
    committed: 1,
    threshold: 10,
    status: 'healthy'
  },
  {
    id: 'inv_05',
    sku: 'FFT-TEE-CHR-XXL',
    productName: 'Vintage Washed Trackside Tee',
    size: 'XXL',
    color: 'Washed Charcoal',
    completefulBlankSku: 'cat_blank_shaka_chr_xxl',
    available: 3,
    reserved: 1,
    committed: 1,
    threshold: 10,
    status: 'low_stock'
  },
  {
    id: 'inv_06',
    sku: 'FFT-SNAP-GAR-OS',
    productName: 'Garage Heritage Snapback',
    size: 'OSFA',
    color: 'Heather/Black',
    completefulBlankSku: 'cat_blank_yupoong_blk',
    available: 0,
    reserved: 0,
    committed: 0,
    threshold: 10,
    status: 'out_of_stock'
  }
];

export const InventoryView: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const { addToast } = useToast();

  const handleSyncCompletefulBlanks = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      addToast({
        type: 'success',
        title: 'Completeful Blank Stock Synchronized',
        description: 'Updated availability counts across 6 warehouse child SKUs.'
      });
    }, 800);
  };

  const filteredItems = items.filter(
    (item) =>
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.completefulBlankSku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const columns: Column<InventoryItem>[] = [
    {
      key: 'sku',
      header: 'SKU & Garment',
      render: (row) => (
        <div>
          <span className="font-mono font-semibold text-zinc-100 block">{row.sku}</span>
          <span className="text-[11px] text-zinc-400 block">{row.productName}</span>
        </div>
      )
    },
    {
      key: 'variant',
      header: 'Size & Color',
      render: (row) => (
        <span className="font-mono text-xs text-zinc-300">
          {row.size} • {row.color}
        </span>
      )
    },
    {
      key: 'completefulBlankSku',
      header: 'Completeful Blank Link',
      render: (row) => (
        <span className="font-mono text-[11px] text-amber-400 block">
          {row.completefulBlankSku}
        </span>
      )
    },
    {
      key: 'available',
      header: 'Available',
      render: (row) => (
        <span className="font-bold font-mono text-zinc-200">{row.available}</span>
      )
    },
    {
      key: 'reserved',
      header: 'Reserved / Committed',
      render: (row) => (
        <span className="font-mono text-[11px] text-zinc-400">
          {row.reserved} res / {row.committed} com
        </span>
      )
    },
    {
      key: 'status',
      header: 'Stock State',
      render: (row) => {
        if (row.status === 'healthy') {
          return (
            <Badge variant="emerald" size="sm" dot>
              In Stock
            </Badge>
          );
        }
        if (row.status === 'low_stock') {
          return (
            <Badge variant="amber" size="sm" dot>
              Low Stock (&lt;{row.threshold})
            </Badge>
          );
        }
        return (
          <Badge variant="red" size="sm" dot>
            Out of Stock
          </Badge>
        );
      }
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Inventory Operations</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time garment levels, Completeful blank warehouse sync, and low-inventory warnings.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          isLoading={isSyncing}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={handleSyncCompletefulBlanks}
        >
          Sync Completeful Blanks
        </Button>
      </div>

      <Card padding="sm">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search SKU, size, or Completeful blank SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-3.5 h-3.5" />}
          />
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={filteredItems}
        keyExtractor={(row) => row.id}
        emptyMessage="No inventory items found."
        emptyIcon={<Boxes className="w-8 h-8" />}
      />
    </div>
  );
};
