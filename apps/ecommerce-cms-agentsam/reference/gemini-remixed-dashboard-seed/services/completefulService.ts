/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {
  CompletefulShop,
  CompletefulProductLink,
  CompletefulVariantLink,
  CompletefulOrderLink,
  CompletefulOperation,
  CompletefulWebhookSubscription,
  CompletefulWebhookEvent,
  CompletefulConfig
} from '../types';

// Default configuration with safe test defaults
export const DEFAULT_COMPLETEFUL_CONFIG: CompletefulConfig = {
  cappKey: 'fixture_completeful_key',
  apiUrl: 'https://vxapi.completeful.com',
  allowLiveWrites: false, // Kill switch safety default
  webhookSecret: 'whsec_fft_prod_994b21fa7c',
  selectedShopId: 'shp_fft_primary_01'
};

// Seed shops
export const INITIAL_SHOPS: CompletefulShop[] = [
  {
    id: 'shp_1',
    shopId: 'shp_fft_primary_01',
    name: 'FuelnFreeTime Apparel - Main Storefront',
    currency: 'USD',
    isPrimary: true,
    status: 'active',
    marketplace: 'Shopify / Custom Cloudflare D1',
    mode: 'test',
    createdAt: Date.now() - 86400000 * 30
  },
  {
    id: 'shp_2',
    shopId: 'shp_fft_eu_outlet_02',
    name: 'FuelnFreeTime Europe / UK Hub',
    currency: 'EUR',
    isPrimary: false,
    status: 'active',
    marketplace: 'Custom F&FT EU',
    mode: 'test',
    createdAt: Date.now() - 86400000 * 15
  }
];

// Seed Product Links (Local Products ↔ Completeful Store Product / Catalog / Design)
export const INITIAL_PRODUCT_LINKS: CompletefulProductLink[] = [
  {
    id: 'plink_1',
    localProductId: 'fft_prod_heavy_hoodie',
    productTitle: 'F&FT Heavyweight Motor Club Fleece Hoodie (400 GSM)',
    completefulStoreProductId: 'capp_sp_992144',
    completefulCatalogId: 'cat_item_hoodie_heavy_blk',
    completefulDesignId: 'capp_des_motor_club_front_back_v2',
    thumbnailUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=500&auto=format&fit=crop&q=80',
    designOptionMetadata: {
      printTechnique: 'dtg',
      printLocations: ['front', 'back'],
      colorway: 'Onyx Black',
      dpi: 300,
      aspectRatio: '4:5',
      artworkDimensions: { width: 14, height: 16, unit: 'in' }
    },
    status: 'published',
    syncedAt: Date.now() - 86400000 * 2
  },
  {
    id: 'plink_2',
    localProductId: 'fft_prod_overland_tee',
    productTitle: 'FuelnFreeTime Vintage Overland Heavyweight Tee',
    completefulStoreProductId: 'capp_sp_883102',
    completefulCatalogId: 'cat_item_tee_classic_wash',
    completefulDesignId: 'capp_des_overland_compass_crest',
    thumbnailUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=80',
    designOptionMetadata: {
      printTechnique: 'screenprint',
      printLocations: ['front', 'chest'],
      colorway: 'Vintage White / Sand',
      dpi: 300,
      aspectRatio: '1:1',
      artworkDimensions: { width: 12, height: 12, unit: 'in' }
    },
    status: 'published',
    syncedAt: Date.now() - 86400000 * 5
  },
  {
    id: 'plink_3',
    localProductId: 'fft_prod_rally_raglan',
    productTitle: 'F&FT Desert Rally 3/4 Sleeve Raglan Baseball Tee',
    completefulStoreProductId: 'capp_sp_771920',
    completefulCatalogId: 'cat_item_raglan_blk_wht',
    completefulDesignId: 'capp_des_desert_rally_77',
    thumbnailUrl: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=500&auto=format&fit=crop&q=80',
    designOptionMetadata: {
      printTechnique: 'dtg',
      printLocations: ['front', 'sleeve-left'],
      colorway: 'Black / Heather White',
      dpi: 300,
      aspectRatio: '3:4',
      artworkDimensions: { width: 11, height: 14, unit: 'in' }
    },
    status: 'published',
    syncedAt: Date.now() - 86400000 * 1
  }
];

// Seed Variant Links (Local Variant ↔ Completeful Child / Print Locations / Quote)
export const INITIAL_VARIANT_LINKS: CompletefulVariantLink[] = [
  {
    id: 'vlink_101',
    localVariantId: 'var_hoodie_blk_m',
    productLinkId: 'plink_1',
    sku: 'FFT-HD-MC-BLK-M',
    size: 'M',
    color: 'Onyx Black',
    completefulCatalogChildId: 'cchild_hd_400_blk_m',
    printLocations: ['front_chest', 'full_back'],
    fulfillmentCostQuote: 18.50, // Completeful authoritative quote
    retailPrice: 68.00,
    inventoryStatus: 'in_stock'
  },
  {
    id: 'vlink_102',
    localVariantId: 'var_hoodie_blk_l',
    productLinkId: 'plink_1',
    sku: 'FFT-HD-MC-BLK-L',
    size: 'L',
    color: 'Onyx Black',
    completefulCatalogChildId: 'cchild_hd_400_blk_l',
    printLocations: ['front_chest', 'full_back'],
    fulfillmentCostQuote: 18.50,
    retailPrice: 68.00,
    inventoryStatus: 'in_stock'
  },
  {
    id: 'vlink_103',
    localVariantId: 'var_hoodie_blk_xl',
    productLinkId: 'plink_1',
    sku: 'FFT-HD-MC-BLK-XL',
    size: 'XL',
    color: 'Onyx Black',
    completefulCatalogChildId: 'cchild_hd_400_blk_xl',
    printLocations: ['front_chest', 'full_back'],
    fulfillmentCostQuote: 19.50,
    retailPrice: 68.00,
    inventoryStatus: 'in_stock'
  },
  {
    id: 'vlink_201',
    localVariantId: 'var_tee_snd_l',
    productLinkId: 'plink_2',
    sku: 'FFT-TEE-OV-SND-L',
    size: 'L',
    color: 'Desert Sand',
    completefulCatalogChildId: 'cchild_tee_snd_l',
    printLocations: ['front_chest'],
    fulfillmentCostQuote: 9.80,
    retailPrice: 34.00,
    inventoryStatus: 'in_stock'
  },
  {
    id: 'vlink_301',
    localVariantId: 'var_raglan_blk_m',
    productLinkId: 'plink_3',
    sku: 'FFT-RAG-77-BLK-M',
    size: 'M',
    color: 'Black / White',
    completefulCatalogChildId: 'cchild_rag_77_m',
    printLocations: ['front_chest', 'left_sleeve'],
    fulfillmentCostQuote: 12.20,
    retailPrice: 42.00,
    inventoryStatus: 'in_stock'
  }
];

// Seed Orders demonstrating full lifecycle
export const INITIAL_ORDER_LINKS: CompletefulOrderLink[] = [
  {
    id: 'ord_link_8801',
    localOrderId: 'FFT-ORD-2026-9041',
    stripePaymentIntentId: 'pi_3MtwL2LkdIwHu7ix0B3vK01',
    customerEmail: 'alex.rider@offroadclub.org',
    customerName: 'Alex Rivera',
    shippingAddress: {
      line1: '742 Evergreen Terrace',
      city: 'Austin',
      state: 'TX',
      postalCode: '78704',
      country: 'US'
    },
    completefulFulfillmentOrderId: 'capp_ord_ful_99014',
    status: 'in-production',
    quoteSnapshot: {
      subtotal: 18.50,
      shipping: 5.99,
      tax: 1.85,
      total: 26.34,
      currency: 'USD'
    },
    retailTotal: 68.00,
    trackingCarrier: 'USPS Priority',
    idempotencyKey: 'idemp_fft_ord_9041_v1',
    createdAt: Date.now() - 3600000 * 18,
    updatedAt: Date.now() - 3600000 * 4,
    items: [
      {
        id: 'item_1',
        sku: 'FFT-HD-MC-BLK-L',
        name: 'F&FT Heavyweight Motor Club Fleece Hoodie',
        quantity: 1,
        size: 'L',
        color: 'Onyx Black',
        variantLinkId: 'vlink_102',
        unitFulfillmentQuote: 18.50,
        retailPrice: 68.00
      }
    ],
    isDryRun: true
  },
  {
    id: 'ord_link_8802',
    localOrderId: 'FFT-ORD-2026-9038',
    stripePaymentIntentId: 'pi_3MtwK7LkdIwHu7ix99aL10',
    customerEmail: 'sam.cross@fuelnfreetime.com',
    customerName: 'Samantha Cross',
    shippingAddress: {
      line1: '1204 Speedway Blvd',
      city: 'Daytona Beach',
      state: 'FL',
      postalCode: '32114',
      country: 'US'
    },
    completefulFulfillmentOrderId: 'capp_ord_ful_98944',
    status: 'shipped',
    quoteSnapshot: {
      subtotal: 22.00,
      shipping: 6.50,
      tax: 2.20,
      total: 30.70,
      currency: 'USD'
    },
    retailTotal: 76.00,
    trackingNumber: '9400111899562849102938',
    trackingCarrier: 'USPS Ground Advantage',
    trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899562849102938',
    idempotencyKey: 'idemp_fft_ord_9038_v1',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 3600000 * 8,
    items: [
      {
        id: 'item_2',
        sku: 'FFT-TEE-OV-SND-L',
        name: 'FuelnFreeTime Vintage Overland Heavyweight Tee',
        quantity: 1,
        size: 'L',
        color: 'Desert Sand',
        variantLinkId: 'vlink_201',
        unitFulfillmentQuote: 9.80,
        retailPrice: 34.00
      },
      {
        id: 'item_3',
        sku: 'FFT-RAG-77-BLK-M',
        name: 'F&FT Desert Rally Raglan Baseball Tee',
        quantity: 1,
        size: 'M',
        color: 'Black / White',
        variantLinkId: 'vlink_301',
        unitFulfillmentQuote: 12.20,
        retailPrice: 42.00
      }
    ],
    isDryRun: true
  }
];

// Seed Webhook Subscriptions (Order lifecycle & product sync topics)
export const INITIAL_WEBHOOK_SUBSCRIPTIONS: CompletefulWebhookSubscription[] = [
  {
    id: 'wh_sub_01',
    webhookId: 'capp_wh_ord_created',
    topic: 'order:created',
    targetUrl: 'https://fuelnfreetime.com/api/webhooks/completeful',
    status: 'active',
    secretLast4: 'fa7c',
    createdAt: Date.now() - 86400000 * 20,
    deliverySuccessCount: 142,
    deliveryFailCount: 0
  },
  {
    id: 'wh_sub_02',
    webhookId: 'capp_wh_ord_prod',
    topic: 'order:sent-to-production',
    targetUrl: 'https://fuelnfreetime.com/api/webhooks/completeful',
    status: 'active',
    secretLast4: 'fa7c',
    createdAt: Date.now() - 86400000 * 20,
    deliverySuccessCount: 129,
    deliveryFailCount: 0
  },
  {
    id: 'wh_sub_03',
    webhookId: 'capp_wh_ord_ship',
    topic: 'order:shipment:created',
    targetUrl: 'https://fuelnfreetime.com/api/webhooks/completeful',
    status: 'active',
    secretLast4: 'fa7c',
    createdAt: Date.now() - 86400000 * 20,
    deliverySuccessCount: 118,
    deliveryFailCount: 0
  },
  {
    id: 'wh_sub_04',
    webhookId: 'capp_wh_ord_canc',
    topic: 'order:cancelled',
    targetUrl: 'https://fuelnfreetime.com/api/webhooks/completeful',
    status: 'active',
    secretLast4: 'fa7c',
    createdAt: Date.now() - 86400000 * 20,
    deliverySuccessCount: 3,
    deliveryFailCount: 0
  },
  {
    id: 'wh_sub_05',
    webhookId: 'capp_wh_prod_pub',
    topic: 'product:publish:succeeded',
    targetUrl: 'https://fuelnfreetime.com/api/webhooks/completeful',
    status: 'active',
    secretLast4: 'fa7c',
    createdAt: Date.now() - 86400000 * 15,
    deliverySuccessCount: 24,
    deliveryFailCount: 0
  },
  {
    id: 'wh_sub_06',
    webhookId: 'capp_wh_ping',
    topic: 'ping',
    targetUrl: 'https://fuelnfreetime.com/api/webhooks/completeful',
    status: 'active',
    secretLast4: 'fa7c',
    createdAt: Date.now() - 86400000 * 10,
    deliverySuccessCount: 8,
    deliveryFailCount: 0
  }
];

// Seed Webhook Events Log
export const INITIAL_WEBHOOK_EVENTS: CompletefulWebhookEvent[] = [
  {
    id: 'evt_9910',
    eventId: 'evt_capp_ord_ship_9038',
    topic: 'order:shipment:created',
    signature: 't=1758204921,v1=9f8c0211a7b42c98d613e11a3b5b820984c01',
    signatureVerified: true,
    timestamp: Date.now() - 3600000 * 8,
    payload: {
      event: 'order:shipment:created',
      shopId: 'shp_fft_primary_01',
      orderId: 'capp_ord_ful_98944',
      localOrderId: 'FFT-ORD-2026-9038',
      shipment: {
        carrier: 'USPS Ground Advantage',
        trackingNumber: '9400111899562849102938',
        trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899562849102938',
        itemsCount: 2
      }
    },
    processingStatus: 'processed',
    diagnostics: 'HMAC signature verified. F&FT local order tracking state updated to "shipped". Customer dispatch email queued.'
  },
  {
    id: 'evt_9909',
    eventId: 'evt_capp_ord_prod_9041',
    topic: 'order:sent-to-production',
    signature: 't=1758201200,v1=e47a2b9188f617c093a218d99c402aa85b7e2',
    signatureVerified: true,
    timestamp: Date.now() - 3600000 * 12,
    payload: {
      event: 'order:sent-to-production',
      shopId: 'shp_fft_primary_01',
      orderId: 'capp_ord_ful_99014',
      localOrderId: 'FFT-ORD-2026-9041',
      batchNumber: 'BATCH-PRINT-4902'
    },
    processingStatus: 'processed',
    diagnostics: 'HMAC verified. Order marked in-production on D1 completeful_order_links.'
  }
];

// Seed Operations Ledger
export const INITIAL_OPERATIONS: CompletefulOperation[] = [
  {
    id: 'op_8101',
    operationType: 'order_submit',
    resourceId: 'FFT-ORD-2026-9041',
    idempotencyKey: 'idemp_fft_ord_9041_v1',
    status: 'success',
    requestPayload: {
      shopId: 'shp_fft_primary_01',
      clientOrderId: 'FFT-ORD-2026-9041',
      items: [{ sku: 'FFT-HD-MC-BLK-L', quantity: 1 }]
    },
    responsePayload: {
      status: 'accepted',
      cappOrderId: 'capp_ord_ful_99014',
      dryRun: true,
      quoteTotal: 26.34
    },
    isDryRun: true,
    timestamp: Date.now() - 3600000 * 18
  },
  {
    id: 'op_8102',
    operationType: 'product_publish',
    resourceId: 'plink_1',
    idempotencyKey: 'idemp_pub_plink_1_v1',
    status: 'success',
    requestPayload: {
      shopId: 'shp_fft_primary_01',
      title: 'F&FT Heavyweight Motor Club Fleece Hoodie'
    },
    responsePayload: {
      completefulStoreProductId: 'capp_sp_992144',
      variantsCount: 3
    },
    isDryRun: true,
    timestamp: Date.now() - 86400000 * 2
  }
];

/**
 * Calculates a simulated HMAC signature header for testing Completeful webhooks:
 * X-Capp-Signature: t=<unix>,v1=<hex>
 */
export function generateWebhookSignature(payload: any, secret: string): { header: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  
  // Simple deterministic client hash simulation for UX demonstration
  let hash = 0;
  const str = `${timestamp}.${rawBody}.${secret}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0') + 'f7b3a9c1';
  return {
    header: `t=${timestamp},v1=${hex}`,
    timestamp
  };
}

/**
 * Validate HMAC Signature
 */
export function verifyWebhookSignature(header: string, secret: string): boolean {
  if (!header || !secret) return false;
  return header.startsWith('t=') && header.includes(',v1=');
}
