/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Asset {
  id: string;
  type: 'logo' | 'product';
  name: string;
  data: string; // Base64 or URL
  mimeType: string;
  category?: 'apparel' | 'headwear' | 'accessories' | 'graphics';
}

export interface PlacedLayer {
  uid: string; // unique instance id
  assetId: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  scale: number; // 1 = 100%
  rotation: number;
  printLocation?: 'front' | 'back' | 'sleeve-left' | 'sleeve-right' | 'embroidery-chest' | 'pocket';
}

export interface GeneratedMockup {
  id: string;
  imageUrl: string;
  prompt: string;
  createdAt: number;
  layers?: PlacedLayer[]; // Store layout used
  productId?: string;
  productName?: string;
  completefulDesignId?: string;
  syncedToCompleteful?: boolean;
}

export type AppView = 'dashboard' | 'assets' | 'studio' | 'gallery' | 'completeful' | 'orders' | 'webhooks' | 'settings';

export interface LoadingState {
  isGenerating: boolean;
  message: string;
}

// --- COMPLETEFUL & D1 SCHEMA TYPES ---

export interface CompletefulShop {
  id: string;
  shopId: string;
  name: string;
  currency: string;
  isPrimary: boolean;
  status: 'active' | 'pending' | 'disconnected';
  marketplace: string;
  mode: 'test' | 'live';
  createdAt: number;
}

export interface DesignOptionMetadata {
  printTechnique: 'dtg' | 'embroidery' | 'sublimation' | 'screenprint';
  printLocations: ('front' | 'back' | 'sleeve-left' | 'sleeve-right' | 'chest')[];
  colorway: string;
  dpi: number;
  aspectRatio: string;
  artworkDimensions?: { width: number; height: number; unit: 'in' | 'cm' };
}

export interface CompletefulProductLink {
  id: string;
  localProductId: string;
  productTitle: string;
  completefulStoreProductId: string;
  completefulCatalogId: string;
  completefulDesignId: string;
  designOptionMetadata: DesignOptionMetadata;
  thumbnailUrl: string;
  status: 'published' | 'draft' | 'syncing' | 'failed';
  syncedAt: number;
}

export interface CompletefulVariantLink {
  id: string;
  localVariantId: string;
  productLinkId: string;
  sku: string;
  size: string;
  color: string;
  completefulCatalogChildId: string;
  printLocations: string[];
  fulfillmentCostQuote: number; // Authoritative fulfillment price from Completeful
  retailPrice: number; // Retail price on F&FT storefront
  inventoryStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface CompletefulOrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  size: string;
  color: string;
  variantLinkId: string;
  unitFulfillmentQuote: number;
  retailPrice: number;
}

export interface CompletefulOrderLink {
  id: string;
  localOrderId: string;
  stripePaymentIntentId: string;
  customerEmail: string;
  customerName: string;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  completefulFulfillmentOrderId?: string;
  status: 'created' | 'sent-to-production' | 'in-production' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  quoteSnapshot: {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
    currency: string;
  };
  retailTotal: number;
  trackingNumber?: string;
  trackingCarrier?: string;
  trackingUrl?: string;
  idempotencyKey: string;
  createdAt: number;
  updatedAt: number;
  items: CompletefulOrderItem[];
  lastError?: string;
  isDryRun: boolean;
}

export interface CompletefulOperation {
  id: string;
  operationType: 'design_create' | 'product_publish' | 'order_submit' | 'order_cancel' | 'webhook_rotate' | 'mockup_render';
  resourceId: string;
  idempotencyKey: string;
  status: 'pending' | 'success' | 'failed';
  requestPayload: any;
  responsePayload: any;
  isDryRun: boolean;
  timestamp: number;
  errorMessage?: string;
}

export interface CompletefulWebhookSubscription {
  id: string;
  webhookId: string;
  topic: string;
  targetUrl: string;
  status: 'active' | 'paused' | 'disabled';
  secretLast4: string;
  createdAt: number;
  deliverySuccessCount: number;
  deliveryFailCount: number;
}

export interface CompletefulWebhookEvent {
  id: string;
  eventId: string;
  topic: string;
  signature: string;
  signatureVerified: boolean;
  timestamp: number;
  payload: any;
  processingStatus: 'processed' | 'ignored' | 'failed';
  diagnostics: string;
}

export interface CompletefulConfig {
  cappKey: string;
  apiUrl: string;
  allowLiveWrites: boolean;
  webhookSecret: string;
  selectedShopId: string;
}

// --- GEMINI CHATBOT TYPES ---

export type ChatRole = 'designer' | 'fulfillment' | 'architect';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelUsed?: string;
  suggestedPrompts?: string[];
  actionPayload?: {
    type: 'apply_prompt' | 'create_mockup' | 'quote_check' | 'link_variant';
    data: any;
  };
}
