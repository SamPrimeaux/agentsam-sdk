/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Asset } from '../types';

export const INITIAL_ASSETS: Asset[] = [
  // Products (Apparel Blanks)
  {
    id: 'prod_fft_hoodie_blk',
    type: 'product',
    name: 'F&FT Heavy Fleece Hoodie (Onyx Black)',
    category: 'apparel',
    data: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80',
    mimeType: 'image/jpeg'
  },
  {
    id: 'prod_fft_tee_sand',
    type: 'product',
    name: 'F&FT Vintage Heavyweight Tee (Desert Sand)',
    category: 'apparel',
    data: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80',
    mimeType: 'image/jpeg'
  },
  {
    id: 'prod_fft_raglan_blk_wht',
    type: 'product',
    name: 'F&FT Desert Rally 3/4 Raglan Tee',
    category: 'apparel',
    data: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800&auto=format&fit=crop&q=80',
    mimeType: 'image/jpeg'
  },
  {
    id: 'prod_fft_cap_snapback',
    type: 'product',
    name: 'F&FT Overland Trucker Cap (Charcoal)',
    category: 'headwear',
    data: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=800&auto=format&fit=crop&q=80',
    mimeType: 'image/jpeg'
  },

  // Logos & Graphics
  {
    id: 'logo_fft_main_clear',
    type: 'logo',
    name: 'FuelnFreeTime Official Emblem (Clear)',
    category: 'graphics',
    data: 'https://fuelnfreetime.com/media/archive/shopify-import/logos/fandft-clear-background.png',
    mimeType: 'image/png'
  },
  {
    id: 'logo_fft_motor_club',
    type: 'logo',
    name: 'F&FT Speedway Piston Crest (Vector)',
    category: 'graphics',
    data: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
    mimeType: 'image/jpeg'
  },
  {
    id: 'logo_fft_overland_compass',
    type: 'logo',
    name: 'Overland Freedom Badge 1994',
    category: 'graphics',
    data: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
    mimeType: 'image/jpeg'
  }
];
