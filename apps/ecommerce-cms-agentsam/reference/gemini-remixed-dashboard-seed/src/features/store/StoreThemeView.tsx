/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Online Storefront & Theme Customizer View
 */

import React, { useState } from 'react';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Select } from '../../design-system/Select';
import { Globe, ExternalLink, Smartphone, Monitor, Save, Sparkles } from 'lucide-react';
import { useToast } from '../../design-system/Toast';

export const StoreThemeView: React.FC = () => {
  const { addToast } = useToast();
  const [devicePreview, setDevicePreview] = useState<'desktop' | 'mobile'>('desktop');
  const [storeHeadline, setStoreHeadline] = useState('AUTHENTIC MOTORSPORT HERITAGE // FALL DROP LIVE');
  const [accentColor, setAccentColor] = useState('#f59e0b');
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveTheme = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      addToast({
        type: 'success',
        title: 'Theme Settings Saved',
        description: 'Storefront layout parameters updated.'
      });
    }, 500);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Online Storefront & Theme Customizer
            </h1>
            <Badge variant="emerald" size="sm" dot>
              Live Production
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure storefront hero announcements, brand accent colors, and live shop preview.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<ExternalLink className="w-3.5 h-3.5" />}
            onClick={() => window.open('https://fuelnfreetime.com', '_blank')}
          >
            Open Live Shop
          </Button>
          <Button
            size="sm"
            variant="primary"
            isLoading={isSaving}
            icon={<Save className="w-3.5 h-3.5" />}
            onClick={handleSaveTheme}
          >
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Theme Settings Sidebar */}
        <Card padding="md" className="lg:col-span-4 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-100">Theme Parameters</h3>

          <Input
            label="Hero Announcement Banner"
            value={storeHeadline}
            onChange={(e) => setStoreHeadline(e.target.value)}
          />

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5 font-mono">
              Brand Accent Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border border-zinc-700"
              />
              <span className="font-mono text-xs text-zinc-300">{accentColor}</span>
            </div>
          </div>

          <Select
            label="Typography Pairing"
            value="syne-mono"
            options={[
              { label: 'Syne (Display) + JetBrains Mono (Body)', value: 'syne-mono' },
              { label: 'Cinzel + Inter', value: 'cinzel-inter' },
              { label: 'Space Grotesk + Plus Jakarta Sans', value: 'space-jakarta' }
            ]}
          />

          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 space-y-1">
            <span className="font-semibold text-zinc-200 block">Cloudflare Edge Serving</span>
            <p className="text-[11px]">
              Theme assets are compiled and cached globally across Cloudflare edge CDN POPs.
            </p>
          </div>
        </Card>

        {/* Live Storefront Preview */}
        <Card padding="none" className="lg:col-span-8 overflow-hidden flex flex-col">
          <div className="p-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-mono text-zinc-300">https://fuelnfreetime.com</span>
            </div>

            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              <button
                onClick={() => setDevicePreview('desktop')}
                className={`p-1 rounded transition-colors ${
                  devicePreview === 'desktop' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDevicePreview('mobile')}
                className={`p-1 rounded transition-colors ${
                  devicePreview === 'mobile' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Storefront Mock Rendering */}
          <div className="p-6 bg-zinc-950 min-h-[440px] flex flex-col items-center justify-center">
            <div
              className={`w-full transition-all duration-300 border border-zinc-800/80 rounded-2xl overflow-hidden bg-[#0a0a0a] shadow-2xl ${
                devicePreview === 'mobile' ? 'max-w-sm' : 'max-w-2xl'
              }`}
            >
              {/* Header */}
              <div
                className="py-2 px-4 text-center text-[11px] font-mono font-bold tracking-wider uppercase text-zinc-950"
                style={{ backgroundColor: accentColor }}
              >
                {storeHeadline}
              </div>

              {/* Navigation */}
              <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-800/60">
                <span className="font-bold text-sm tracking-tight text-zinc-100">
                  FUEL &amp; FREE TIME
                </span>
                <span className="text-xs font-mono text-zinc-400">Shop • About • Cart (0)</span>
              </div>

              {/* Hero Banner Mock */}
              <div className="p-8 text-center space-y-3">
                <h2 className="text-lg font-bold text-zinc-100">
                  Heavyweight Garments For High Octane Weekends
                </h2>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Built for cold garages and fast tracks. Engineered with Completeful print-on-demand craftsmanship.
                </p>
                <button
                  className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-950 shadow-md transition-all"
                  style={{ backgroundColor: accentColor }}
                >
                  Explore Collection
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
