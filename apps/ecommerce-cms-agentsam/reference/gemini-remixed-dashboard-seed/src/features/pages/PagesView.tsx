/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: CMS Content Pages View
 */

import React, { useState } from 'react';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Dialog } from '../../design-system/Dialog';
import { FileText, Plus, Edit2, ExternalLink, Globe } from 'lucide-react';
import { useToast } from '../../design-system/Toast';

interface CmsPage {
  id: string;
  slug: string;
  title: string;
  updatedAt: number;
  status: 'published' | 'draft';
  content: string;
}

const INITIAL_PAGES: CmsPage[] = [
  {
    id: 'pg_about',
    slug: 'about',
    title: 'About Fuel & Free Time',
    updatedAt: Date.now() - 86400000 * 12,
    status: 'published',
    content: 'Fuel & Free Time represents motorsport heritage, garage culture, and high-octane passion. Born in the pit lanes and grease-stained workshops.'
  },
  {
    id: 'pg_shipping',
    slug: 'shipping-fulfillment',
    title: 'Fulfillment & Completeful Shipping Policy',
    updatedAt: Date.now() - 86400000 * 3,
    status: 'published',
    content: 'All apparel is custom produced on-demand via Completeful Charlotte DTG facility. Typical production is 2-4 business days followed by standard carrier tracking.'
  },
  {
    id: 'pg_sizing',
    slug: 'sizing-chart',
    title: 'Garment Sizing & Fit Guide',
    updatedAt: Date.now() - 86400000 * 6,
    status: 'published',
    content: 'Our Heavyweight Hoodies and Vintage Washed Tees are pre-shrunk cotton. See measurements for chest width and body length.'
  }
];

export const PagesView: React.FC = () => {
  const { addToast } = useToast();
  const [pages, setPages] = useState<CmsPage[]>(INITIAL_PAGES);
  const [editingPage, setEditingPage] = useState<CmsPage | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            CMS Pages & Storefront Editorial
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage legal disclosures, garment sizing tables, and brand storytelling pages.
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() =>
            setEditingPage({
              id: `pg_${Date.now()}`,
              slug: 'new-page',
              title: 'New Page',
              updatedAt: Date.now(),
              status: 'draft',
              content: ''
            })
          }
        >
          Add New Page
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pages.map((p) => (
          <Card key={p.id} padding="md" className="flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Badge variant={p.status === 'published' ? 'emerald' : 'zinc'} size="sm" dot>
                  {p.status}
                </Badge>
                <span className="text-[10px] font-mono text-zinc-500">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <h3 className="font-semibold text-xs text-zinc-100 mb-1">{p.title}</h3>
              <span className="text-[11px] font-mono text-amber-400 block mb-2">/{p.slug}</span>
              <p className="text-xs text-zinc-400 line-clamp-3">{p.content}</p>
            </div>

            <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
              <Button
                size="xs"
                variant="outline"
                icon={<Edit2 className="w-3 h-3" />}
                onClick={() => setEditingPage(p)}
              >
                Edit Page
              </Button>
              <a
                href={`https://fuelnfreetime.com/${p.slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
              >
                <span>Live View</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </Card>
        ))}
      </div>

      {/* Page Editor Dialog */}
      {editingPage && (
        <Dialog
          isOpen={!!editingPage}
          onClose={() => setEditingPage(null)}
          title={`Edit Page: ${editingPage.title}`}
          maxWidth="lg"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button size="xs" variant="outline" onClick={() => setEditingPage(null)}>
                Cancel
              </Button>
              <Button
                size="xs"
                variant="primary"
                onClick={() => {
                  setPages((prev) =>
                    prev.map((item) => (item.id === editingPage.id ? editingPage : item))
                  );
                  setEditingPage(null);
                  addToast({
                    type: 'success',
                    title: 'Page Saved',
                    description: `Updated page /${editingPage.slug}.`
                  });
                }}
              >
                Save Page
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Page Title"
                value={editingPage.title}
                onChange={(e) => setEditingPage({ ...editingPage, title: e.target.value })}
              />
              <Input
                label="URL Slug"
                value={editingPage.slug}
                onChange={(e) => setEditingPage({ ...editingPage, slug: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Markdown / HTML Content
              </label>
              <textarea
                rows={8}
                value={editingPage.content}
                onChange={(e) => setEditingPage({ ...editingPage, content: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
