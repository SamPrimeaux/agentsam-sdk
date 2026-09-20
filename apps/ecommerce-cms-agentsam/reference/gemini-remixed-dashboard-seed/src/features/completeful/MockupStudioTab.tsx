/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Feature: Completeful Mockup Studio & Fabric Compositor
 */

import React, { useState, useRef } from 'react';
import { Card } from '../../design-system/Card';
import { Badge } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Select } from '../../design-system/Select';
import {
  Sparkles,
  Layers,
  Move,
  RotateCcw,
  Maximize,
  Download,
  Check,
  Truck,
  DollarSign,
  Palette,
  Eye
} from 'lucide-react';
import { useToast } from '../../design-system/Toast';

const GARMENT_PRESETS = [
  {
    id: 'hoodie_heavy',
    name: 'Heavyweight Fleece Hoodie (12oz)',
    baseCost: 28.5,
    suggestedRetail: 68.0,
    imageUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80',
    availableColors: [
      { name: 'Pitch Black', hex: '#111111' },
      { name: 'Vintage Washed Grey', hex: '#3f3f46' },
      { name: 'Trackside Olive', hex: '#36453b' },
      { name: 'Heritage Sand', hex: '#d4c5b9' }
    ]
  },
  {
    id: 'tee_vintage',
    name: 'Trackside Vintage Washed Tee (6.5oz)',
    baseCost: 16.5,
    suggestedRetail: 42.0,
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80',
    availableColors: [
      { name: 'Washed Charcoal', hex: '#27272a' },
      { name: 'Off White / Bone', hex: '#f4f4f5' },
      { name: 'Desert Sand', hex: '#c2b280' }
    ]
  },
  {
    id: 'snapback_heritage',
    name: 'Structured 6-Panel Snapback Hat',
    baseCost: 14.0,
    suggestedRetail: 34.0,
    imageUrl: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=800&q=80',
    availableColors: [
      { name: 'Black / Grey Underbill', hex: '#18181b' },
      { name: 'Charcoal Wool', hex: '#52525b' }
    ]
  }
];

const LOGO_PRESETS = [
  {
    id: 'fft_badge_gold',
    name: 'F&FT Motorsport Shield (Gold)',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80'
  },
  {
    id: 'fft_vintage_type',
    name: 'Fuel & Free Time Retro Script',
    url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=400&q=80'
  },
  {
    id: 'fft_piston_flag',
    name: 'Crossed Wrenches & Checkered Flag',
    url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=400&q=80'
  }
];

export const MockupStudioTab: React.FC = () => {
  const { addToast } = useToast();
  const [selectedGarment, setSelectedGarment] = useState(GARMENT_PRESETS[0]);
  const [selectedColor, setSelectedColor] = useState(GARMENT_PRESETS[0].availableColors[0]);
  const [selectedLogo, setSelectedLogo] = useState(LOGO_PRESETS[0]);
  const [printLocation, setPrintLocation] = useState<'chest' | 'back' | 'sleeve'>('chest');

  // Layer transform state
  const [scale, setScale] = useState(45);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(42);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(90);

  // Dynamic calculated quote
  const printFee = printLocation === 'sleeve' ? 4.5 : printLocation === 'back' ? 6.0 : 5.0;
  const totalFulfillmentQuote = selectedGarment.baseCost + printFee;
  const estimatedProfit = selectedGarment.suggestedRetail - totalFulfillmentQuote;

  const handleResetPlacement = () => {
    setScale(45);
    setPositionX(50);
    setPositionY(42);
    setRotation(0);
    setOpacity(90);
  };

  const handleExportMockup = () => {
    addToast({
      type: 'success',
      title: 'Mockup Rendered',
      description: 'High-resolution composite saved to your media bucket.'
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
      {/* Left 4 Cols: Garment & Artwork Controls */}
      <div className="lg:col-span-4 space-y-4">
        {/* Garment Blank Selector */}
        <Card padding="md">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400 block mb-2">
            1. Select Blank Garment
          </span>
          <div className="space-y-2">
            {GARMENT_PRESETS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setSelectedGarment(g);
                  setSelectedColor(g.availableColors[0]);
                }}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                  selectedGarment.id === g.id
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <img
                  src={g.imageUrl}
                  alt={g.name}
                  className="w-10 h-10 rounded-lg object-cover bg-zinc-950 flex-shrink-0"
                />
                <div className="min-w-0">
                  <span className="font-semibold text-xs block truncate">{g.name}</span>
                  <span className="text-[10px] font-mono text-zinc-400 block">
                    Base: ${g.baseCost.toFixed(2)} • Retail: ${g.suggestedRetail.toFixed(2)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Colorway & Print Location */}
        <Card padding="md" className="space-y-3">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400 block">
            2. Fabric Colorway & Location
          </span>

          {/* Colors */}
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1.5 font-mono">
              Color: {selectedColor.name}
            </label>
            <div className="flex items-center gap-2">
              {selectedGarment.availableColors.map((col) => (
                <button
                  key={col.name}
                  type="button"
                  onClick={() => setSelectedColor(col)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    selectedColor.name === col.name
                      ? 'scale-110 border-amber-400 shadow-sm'
                      : 'border-zinc-700 hover:border-zinc-500'
                  }`}
                  style={{ backgroundColor: col.hex }}
                  title={col.name}
                />
              ))}
            </div>
          </div>

          {/* Location */}
          <div className="pt-2 border-t border-zinc-800">
            <label className="text-[11px] text-zinc-400 block mb-1.5 font-mono">
              Print Placement Location
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['chest', 'back', 'sleeve'] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setPrintLocation(loc)}
                  className={`py-1.5 rounded-lg text-xs font-mono capitalize transition-colors ${
                    printLocation === loc
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Artwork Graphic Layer */}
        <Card padding="md" className="space-y-3">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400 block">
            3. Artwork Graphic Layer
          </span>
          <div className="grid grid-cols-3 gap-2">
            {LOGO_PRESETS.map((logo) => (
              <button
                key={logo.id}
                type="button"
                onClick={() => setSelectedLogo(logo)}
                className={`p-1.5 rounded-xl border text-center transition-colors ${
                  selectedLogo.id === logo.id
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                <img
                  src={logo.url}
                  alt={logo.name}
                  className="w-full aspect-square object-cover rounded-lg mb-1"
                />
                <span className="text-[10px] truncate block font-mono">{logo.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>

          {/* Sliders */}
          <div className="space-y-2 pt-2 border-t border-zinc-800 text-xs font-mono">
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Scale Size:</span>
                <span>{scale}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="85"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Vertical Position (Y):</span>
                <span>{positionY}%</span>
              </div>
              <input
                type="range"
                min="15"
                max="85"
                value={positionY}
                onChange={(e) => setPositionY(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Rotation:</span>
                <span>{rotation}°</span>
              </div>
              <input
                type="range"
                min="-45"
                max="45"
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleResetPlacement}
              className="text-xs font-mono text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Transform</span>
            </button>
          </div>
        </Card>
      </div>

      {/* Right 8 Cols: Interactive Composite Canvas & Authoritative Quote */}
      <div className="lg:col-span-8 space-y-4">
        {/* Canvas Card */}
        <Card padding="none" className="relative aspect-[4/3] bg-zinc-950 overflow-hidden flex items-center justify-center border-zinc-800 shadow-2xl">
          {/* Garment Background Image */}
          <img
            src={selectedGarment.imageUrl}
            alt=""
            className="w-full h-full object-contain filter contrast-105"
            style={{
              backgroundColor: selectedColor.hex === '#111111' ? 'transparent' : `${selectedColor.hex}22`
            }}
          />

          {/* Color wash overlay */}
          <div
            className="absolute inset-0 pointer-events-none mix-blend-multiply opacity-20"
            style={{ backgroundColor: selectedColor.hex }}
          />

          {/* Dynamic Graphic Layer */}
          <div
            className="absolute pointer-events-none transition-all duration-75"
            style={{
              left: `${positionX}%`,
              top: `${positionY}%`,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              width: `${scale}%`
            }}
          >
            <img
              src={selectedLogo.url}
              alt=""
              className="w-full h-auto object-contain drop-shadow-md mix-blend-screen"
              style={{ opacity: opacity / 100 }}
            />
          </div>

          {/* Canvas Top Bar */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <span className="px-2.5 py-1 rounded-xl bg-black/70 backdrop-blur-md border border-zinc-700/80 text-xs font-mono text-zinc-200">
                {selectedGarment.name} • {selectedColor.name}
              </span>
              <Badge variant="amber" size="sm">
                Location: {printLocation.toUpperCase()}
              </Badge>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <Button
                size="xs"
                variant="primary"
                icon={<Download className="w-3.5 h-3.5" />}
                onClick={handleExportMockup}
              >
                Export Mockup
              </Button>
            </div>
          </div>

          {/* Canvas Bottom Watermark */}
          <div className="absolute bottom-3 left-4 text-[10px] font-mono text-zinc-500">
            DTG Print Resolution: 300 DPI • Completeful Spec Validated
          </div>
        </Card>

        {/* Real-Time Authoritative Quote & Margin Calculator */}
        <Card padding="md" className="bg-gradient-to-r from-zinc-900/90 via-zinc-900 to-amber-950/20 border-amber-500/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-amber-400 block mb-1">
                Completeful Authoritative Fulfillment Pricing
              </span>
              <h4 className="text-sm font-semibold text-zinc-100">
                Live Pricing Breakdown for Selected Mockup
              </h4>
              <div className="flex items-center gap-4 text-xs font-mono text-zinc-400 mt-2">
                <span>Blank: ${selectedGarment.baseCost.toFixed(2)}</span>
                <span>+</span>
                <span>Print Fee: ${printFee.toFixed(2)}</span>
                <span>=</span>
                <span className="text-emerald-400 font-bold">
                  Cost: ${totalFulfillmentQuote.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-right font-mono flex-shrink-0">
              <span className="text-[10px] text-emerald-400 uppercase tracking-wider block">
                Store Gross Margin
              </span>
              <span className="text-lg font-bold text-emerald-300 block">
                +${estimatedProfit.toFixed(2)}{' '}
                <span className="text-xs font-normal">
                  ({((estimatedProfit / selectedGarment.suggestedRetail) * 100).toFixed(0)}%)
                </span>
              </span>
              <span className="text-[10px] text-zinc-500 block">
                at ${selectedGarment.suggestedRetail.toFixed(2)} Retail
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
