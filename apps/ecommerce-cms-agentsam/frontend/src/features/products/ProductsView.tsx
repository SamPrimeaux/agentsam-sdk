/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Products & Merchandising View
 */

import React, { useState } from 'react';
import { CompletefulProductLink } from '../../types';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { DataTable, Column } from '../../design-system/DataTable';
import { CompletefulMappingModal } from './CompletefulMappingModal';
import { useAdmin } from '../../app/AdminProvider';
import {
  Tag,
  Search,
  Grid,
  List,
  Plus,
  Truck,
  Sparkles,
  Layers,
  ArrowUpRight,
  Edit2
} from 'lucide-react';

export const INITIAL_PRODUCTS: CompletefulProductLink[] = [
  {
    id: 'prod_link_01',
    localProductId: 'fft_hoodie_black_01',
    productTitle: 'F&FT Heavyweight DTG Hoodie (Black)',
    completefulStoreProductId: 'capp_sp_88192',
    completefulCatalogId: 'cat_blank_gildan_heavy_blk',
    completefulDesignId: 'capp_des_vintage_chest_01',
    designOptionMetadata: {
      printTechnique: 'dtg',
      printLocations: ['front', 'back'],
      colorway: 'Pitch Black',
      dpi: 300,
      aspectRatio: '1:1'
    },
    thumbnailUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=80',
    status: 'published',
    syncedAt: Date.now() - 86400000 * 2
  },
  {
    id: 'prod_link_02',
    localProductId: 'fft_tee_vintage_charcoal_02',
    productTitle: 'Vintage Washed Trackside Tee (Charcoal)',
    completefulStoreProductId: 'capp_sp_88204',
    completefulCatalogId: 'cat_blank_shaka_tee_chr',
    completefulDesignId: 'capp_des_motorcycle_badge_02',
    designOptionMetadata: {
      printTechnique: 'dtg',
      printLocations: ['front'],
      colorway: 'Washed Charcoal',
      dpi: 300,
      aspectRatio: '4:5'
    },
    thumbnailUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80',
    status: 'published',
    syncedAt: Date.now() - 86400000 * 4
  },
  {
    id: 'prod_link_03',
    localProductId: 'fft_snapback_garage_03',
    productTitle: 'Garage Heritage Structured Snapback',
    completefulStoreProductId: 'capp_sp_88310',
    completefulCatalogId: 'cat_blank_yupoong_snapback',
    completefulDesignId: 'capp_des_embroidery_patch_03',
    designOptionMetadata: {
      printTechnique: 'embroidery',
      printLocations: ['chest'],
      colorway: 'Dark Heather / Black',
      dpi: 300,
      aspectRatio: '1:1'
    },
    thumbnailUrl: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=600&q=80',
    status: 'published',
    syncedAt: Date.now() - 86400000 * 1
  },
  {
    id: 'prod_link_04',
    localProductId: 'fft_windbreaker_track_04',
    productTitle: 'Speedway Lightweight Windbreaker Jacket',
    completefulStoreProductId: 'capp_sp_88421',
    completefulCatalogId: 'cat_blank_independent_coach_jkt',
    completefulDesignId: 'capp_des_sleeve_stripe_04',
    designOptionMetadata: {
      printTechnique: 'dtg',
      printLocations: ['front', 'sleeve-left'],
      colorway: 'Olive Green',
      dpi: 300,
      aspectRatio: '1:1'
    },
    thumbnailUrl: 'https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=600&q=80',
    status: 'draft',
    syncedAt: Date.now() - 86400000 * 7
  }
];

export const ProductsView: React.FC = () => {
  const { navigate } = useAdmin();
  const [products, setProducts] = useState<CompletefulProductLink[]>(INITIAL_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [editingProduct, setEditingProduct] = useState<CompletefulProductLink | null>(null);

  const filteredProducts = products.filter((p) =>
    p.productTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.completefulCatalogId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.localProductId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleUpdateProduct = (updated: CompletefulProductLink) => {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const columns: Column<CompletefulProductLink>[] = [
    {
      key: 'product',
      header: 'Product & Blank',
      render: (row) => (
        <div className="flex items-center gap-3">
          <img
            src={row.thumbnailUrl}
            alt=""
            className="w-10 h-10 rounded-xl object-cover bg-zinc-900 border border-zinc-800 flex-shrink-0"
          />
          <div>
            <span className="font-semibold text-zinc-100 block">{row.productTitle}</span>
            <span className="text-[11px] font-mono text-zinc-400">
              Blank: {row.completefulCatalogId}
            </span>
          </div>
        </div>
      )
    },
    {
      key: 'technique',
      header: 'Print Technique',
      render: (row) => (
        <div>
          <Badge variant="indigo" size="sm">
            {row.designOptionMetadata.printTechnique.toUpperCase()}
          </Badge>
          <span className="text-[10px] font-mono text-zinc-500 block mt-0.5">
            {row.designOptionMetadata.printLocations.join(', ')}
          </span>
        </div>
      )
    },
    {
      key: 'completefulStoreProductId',
      header: 'Completeful Mapping',
      render: (row) => (
        <div>
          <span className="font-mono text-[11px] text-amber-400 block">
            {row.completefulStoreProductId}
          </span>
          <span className="text-[10px] font-mono text-zinc-500">
            Design: {row.completefulDesignId}
          </span>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Catalog Status',
      render: (row) => (
        <Badge
          variant={row.status === 'published' ? 'emerald' : 'zinc'}
          size="sm"
          dot
        >
          {row.status}
        </Badge>
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
            variant="outline"
            icon={<Edit2 className="w-3 h-3" />}
            onClick={() => setEditingProduct(row)}
          >
            Edit Mapping
          </Button>
          <Button
            size="xs"
            variant="ghost"
            icon={<Sparkles className="w-3 h-3 text-amber-400" />}
            onClick={() => navigate('/admin/completeful', { tab: 'mockups' })}
          >
            Mockup
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Merchandising & Product Catalog
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage storefront apparel, DTG print options, and Completeful catalog mappings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<Truck className="w-3.5 h-3.5 text-amber-400" />}
            onClick={() => navigate('/admin/completeful', { tab: 'catalog' })}
          >
            Browse Completeful Blanks
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Sparkles className="w-3.5 h-3.5" />}
            onClick={() => navigate('/admin/completeful', { tab: 'mockups' })}
          >
            New Product Mockup
          </Button>
        </div>
      </div>

      {/* Filter and View Toggles */}
      <Card padding="sm" className="flex items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search products, catalog IDs, or designs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-3.5 h-3.5" />}
          />
        </div>

        <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'grid'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Grid View"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'table'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Table View"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </Card>

      {/* Grid or Table Display */}
      {viewMode === 'table' ? (
        <DataTable
          columns={columns}
          data={filteredProducts}
          keyExtractor={(row) => row.id}
          emptyMessage="No products match your search."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredProducts.map((prod) => (
            <Card
              key={prod.id}
              padding="none"
              className="overflow-hidden group hover:border-amber-500/40 transition-all flex flex-col"
            >
              {/* Product Thumbnail */}
              <div className="relative aspect-square bg-zinc-950 overflow-hidden">
                <img
                  src={prod.thumbnailUrl}
                  alt={prod.productTitle}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-2.5 left-2.5">
                  <Badge variant="indigo" size="sm">
                    {prod.designOptionMetadata.printTechnique.toUpperCase()}
                  </Badge>
                </div>
                <div className="absolute top-2.5 right-2.5">
                  <Badge
                    variant={prod.status === 'published' ? 'emerald' : 'zinc'}
                    size="sm"
                    dot
                  >
                    {prod.status}
                  </Badge>
                </div>
              </div>

              {/* Product Details */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="font-semibold text-zinc-100 text-xs line-clamp-1">
                    {prod.productTitle}
                  </h4>
                  <p className="text-[11px] font-mono text-zinc-400 mt-1">
                    Blank: {prod.completefulCatalogId}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Color: {prod.designOptionMetadata.colorway} • {prod.designOptionMetadata.printLocations.join(', ')}
                  </p>
                </div>

                <div className="pt-3 mt-3 border-t border-zinc-800/80 flex items-center justify-between">
                  <button
                    onClick={() => setEditingProduct(prod)}
                    className="text-xs font-mono text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <span>Mapping</span>
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => navigate('/admin/completeful', { tab: 'mockups' })}
                    className="text-xs font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                  >
                    <span>Mockup Studio</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Completeful Mapping Modal */}
      <CompletefulMappingModal
        product={editingProduct}
        isOpen={!!editingProduct}
        onClose={() => setEditingProduct(null)}
        onSave={handleUpdateProduct}
      />
    </div>
  );
};
