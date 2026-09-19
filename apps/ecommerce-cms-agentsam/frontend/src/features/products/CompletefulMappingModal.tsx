/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Completeful Product Mapping Modal
 */

import React, { useState } from 'react';
import { Dialog } from '../../design-system/Dialog';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Select } from '../../design-system/Select';
import { Badge } from '../../design-system/Badge';
import { CompletefulProductLink } from '../../types';
import { Truck, Check, RefreshCw, Layers, ShieldCheck } from 'lucide-react';
import { useToast } from '../../design-system/Toast';

export interface CompletefulMappingModalProps {
  product: CompletefulProductLink | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: CompletefulProductLink) => void;
}

export const CompletefulMappingModal: React.FC<CompletefulMappingModalProps> = ({
  product,
  isOpen,
  onClose,
  onSave
}) => {
  const { addToast } = useToast();
  if (!product) return null;

  const [catalogId, setCatalogId] = useState(product.completefulCatalogId);
  const [storeProductId, setStoreProductId] = useState(product.completefulStoreProductId);
  const [designId, setDesignId] = useState(product.completefulDesignId);
  const [printTechnique, setPrintTechnique] = useState(product.designOptionMetadata.printTechnique);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSave = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      onSave({
        ...product,
        completefulCatalogId: catalogId,
        completefulStoreProductId: storeProductId,
        completefulDesignId: designId,
        designOptionMetadata: {
          ...product.designOptionMetadata,
          printTechnique: printTechnique as any
        },
        status: 'published',
        syncedAt: Date.now()
      });
      addToast({
        type: 'success',
        title: 'Completeful Mapping Updated',
        description: `Linked product ${product.productTitle} to catalog ID ${catalogId}.`
      });
      onClose();
    }, 600);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Completeful POD Catalog Mapping"
      subtitle={`Configure DTG and blank garment linkage for "${product.productTitle}"`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px] font-mono text-zinc-500">
            Validated with X-Capp-Mode: dry_run
          </span>
          <div className="flex items-center gap-2">
            <Button size="xs" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="xs"
              variant="primary"
              isLoading={isSyncing}
              icon={<Check className="w-3.5 h-3.5" />}
              onClick={handleSave}
            >
              Save Linkage
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={product.thumbnailUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover bg-zinc-950 border border-zinc-800"
            />
            <div>
              <span className="font-semibold text-zinc-100 text-xs block">
                {product.productTitle}
              </span>
              <span className="text-[11px] font-mono text-zinc-400">
                Local ID: {product.localProductId}
              </span>
            </div>
          </div>
          <Badge variant="emerald" size="sm">
            {product.status}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Completeful Catalog Blank ID"
            value={catalogId}
            onChange={(e) => setCatalogId(e.target.value)}
            helperText="Blank garment SKU from Completeful apparel catalog"
          />
          <Input
            label="Completeful Store Product ID"
            value={storeProductId}
            onChange={(e) => setStoreProductId(e.target.value)}
            helperText="Completeful store-side product reference"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Completeful Design ID"
            value={designId}
            onChange={(e) => setDesignId(e.target.value)}
            helperText="Artwork asset ID for this garment"
          />
          <Select
            label="Print Technique"
            value={printTechnique}
            onChange={(e) => setPrintTechnique(e.target.value as any)}
            options={[
              { label: 'Direct-to-Garment (DTG)', value: 'dtg' },
              { label: 'Embroidery (Puff / Flat)', value: 'embroidery' },
              { label: 'Sublimation', value: 'sublimation' },
              { label: 'Screenprint Transfer', value: 'screenprint' }
            ]}
          />
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 text-xs text-zinc-400 space-y-1">
          <span className="font-medium text-zinc-300 font-mono text-[11px] block">
            Print Location Options:
          </span>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {product.designOptionMetadata.printLocations.map((loc) => (
              <span
                key={loc}
                className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[10px]"
              >
                {loc}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
