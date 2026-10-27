// AUTO-GENERATED from openapi/openapi.json. Do not edit.
export const COMPLETEFUL_CONTRACT = {
  "title": "Completeful Partner API",
  "version": "0.1.0",
  "sha256": "5aba75fabf74a4363399cf3de2f68d1b32ee33d4cad912d151f02ea9b442438e",
  "operationCount": 55,
  "pathCount": 44
} as const;
export const COMPLETEFUL_OPERATIONS = {
  "referrals.summary": {
    "method": "GET",
    "path": "/referrals/summary",
    "pathParams": [],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Referral commission summary for the API key owner"
  },
  "referrals.tier1": {
    "method": "GET",
    "path": "/referrals/tier1",
    "pathParams": [],
    "queryParams": [
      "limit",
      "offset",
      "sort"
    ],
    "requiredQuery": [],
    "querySchemas": {
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 200,
        "default": 50
      },
      "offset": {
        "type": "integer",
        "minimum": 0,
        "default": 0
      },
      "sort": {
        "type": "string"
      }
    },
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List directly referred sellers with commission aggregates"
  },
  "referrals.tier2": {
    "method": "GET",
    "path": "/referrals/tier2",
    "pathParams": [],
    "queryParams": [
      "limit",
      "offset",
      "sort"
    ],
    "requiredQuery": [],
    "querySchemas": {
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 200,
        "default": 50
      },
      "offset": {
        "type": "integer",
        "minimum": 0,
        "default": 0
      },
      "sort": {
        "type": "string"
      }
    },
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List second-tier referred sellers with commission aggregates"
  },
  "referrals.payouts": {
    "method": "GET",
    "path": "/referrals/payouts",
    "pathParams": [],
    "queryParams": [
      "limit",
      "offset",
      "tier",
      "from",
      "to"
    ],
    "requiredQuery": [],
    "querySchemas": {
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 200,
        "default": 50
      },
      "offset": {
        "type": "integer",
        "minimum": 0,
        "default": 0
      },
      "tier": {
        "type": "integer",
        "enum": [
          1,
          2
        ]
      },
      "from": {
        "type": "string",
        "format": "date-time"
      },
      "to": {
        "type": "string",
        "format": "date-time"
      }
    },
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Per-sale referral payout ledger"
  },
  "shops.list": {
    "method": "GET",
    "path": "/shops",
    "pathParams": [],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List shops the API key has access to"
  },
  "shops.create": {
    "method": "POST",
    "path": "/shops",
    "pathParams": [],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [
      "name"
    ],
    "summary": "Register a new sub-shop (multi-shop integrators only)"
  },
  "shops.get": {
    "method": "GET",
    "path": "/shops/{shopId}",
    "pathParams": [
      "shopId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Get a shop"
  },
  "shops.disconnect": {
    "method": "DELETE",
    "path": "/shops/{shopId}/connection",
    "pathParams": [
      "shopId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Disconnect a sub-shop (cannot disconnect the partner primary)"
  },
  "catalog.products": {
    "method": "GET",
    "path": "/catalog/products",
    "pathParams": [],
    "queryParams": [
      "limit",
      "offset",
      "cursor",
      "search",
      "marketplace_eligible",
      "include"
    ],
    "requiredQuery": [],
    "querySchemas": {
      "limit": {
        "type": "integer",
        "default": 50,
        "maximum": 200
      },
      "offset": {
        "type": "integer",
        "default": 0
      },
      "cursor": {
        "type": "string"
      },
      "search": {
        "type": "string"
      },
      "marketplace_eligible": {
        "type": "boolean"
      },
      "include": {
        "type": "string",
        "example": "variants,print_locations,images,mockups,shipping"
      }
    },
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List catalog products"
  },
  "catalog.semantic": {
    "method": "GET",
    "path": "/catalog/products/semantic",
    "pathParams": [],
    "queryParams": [
      "q",
      "limit",
      "include"
    ],
    "requiredQuery": [
      "q"
    ],
    "querySchemas": {
      "q": {
        "type": "string",
        "maxLength": 200,
        "example": "cozy gift for dog lovers"
      },
      "limit": {
        "type": "integer",
        "default": 12,
        "maximum": 50
      },
      "include": {
        "type": "string",
        "example": "variants,print_locations,images,mockups,shipping"
      }
    },
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Semantic catalog search"
  },
  "catalog.product": {
    "method": "GET",
    "path": "/catalog/products/{productId}",
    "pathParams": [
      "productId"
    ],
    "queryParams": [
      "include"
    ],
    "requiredQuery": [],
    "querySchemas": {
      "include": {
        "type": "string",
        "example": "variants,print_locations,images,mockups,shipping"
      }
    },
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Fetch enriched catalog product"
  },
  "catalog.variants": {
    "method": "GET",
    "path": "/catalog/products/{productId}/variants",
    "pathParams": [
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List catalog product variants"
  },
  "catalog.printLocations": {
    "method": "GET",
    "path": "/catalog/products/{productId}/print-locations",
    "pathParams": [
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List enabled print locations for a catalog product"
  },
  "catalog.mockups": {
    "method": "GET",
    "path": "/catalog/products/{productId}/mockups",
    "pathParams": [
      "productId"
    ],
    "queryParams": [
      "print_location_id"
    ],
    "requiredQuery": [],
    "querySchemas": {
      "print_location_id": {
        "type": "string",
        "format": "uuid"
      }
    },
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List mockups"
  },
  "catalog.shipping": {
    "method": "GET",
    "path": "/catalog/products/{productId}/shipping",
    "pathParams": [
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Catalog shipping cost columns"
  },
  "addresses.validate": {
    "method": "POST",
    "path": "/addresses/validate",
    "pathParams": [],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [],
    "summary": "Validate and normalize an address"
  },
  "printFiles.validate": {
    "method": "POST",
    "path": "/print-files/validate",
    "pathParams": [],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [
      "art_url"
    ],
    "summary": "Validate a print file URL against print-location requirements"
  },
  "designs.list": {
    "method": "GET",
    "path": "/designs",
    "pathParams": [],
    "queryParams": [
      "limit",
      "offset",
      "cursor",
      "search",
      "shop_id",
      "external_user_id",
      "collection"
    ],
    "requiredQuery": [],
    "querySchemas": {
      "limit": {
        "type": "integer",
        "default": 50,
        "maximum": 200
      },
      "offset": {
        "type": "integer",
        "default": 0
      },
      "cursor": {
        "type": "string"
      },
      "search": {
        "type": "string"
      },
      "shop_id": {
        "type": "string",
        "format": "uuid"
      },
      "external_user_id": {
        "type": "string"
      },
      "collection": {
        "type": "string"
      }
    },
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List designs"
  },
  "designs.create": {
    "method": "POST",
    "path": "/designs",
    "pathParams": [],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [
      "name"
    ],
    "summary": "Create a design (design_template)"
  },
  "designs.getExport": {
    "method": "GET",
    "path": "/designs/exports/{exportId}",
    "pathParams": [
      "exportId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Get a design export job/result"
  },
  "designs.createExport": {
    "method": "POST",
    "path": "/designs/{designId}/exports",
    "pathParams": [
      "designId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Create a design export"
  },
  "designs.get": {
    "method": "GET",
    "path": "/designs/{designId}",
    "pathParams": [
      "designId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Get a design"
  },
  "designs.update": {
    "method": "PATCH",
    "path": "/designs/{designId}",
    "pathParams": [
      "designId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Patch a design"
  },
  "designs.delete": {
    "method": "DELETE",
    "path": "/designs/{designId}",
    "pathParams": [
      "designId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Delete a design"
  },
  "assets.create": {
    "method": "POST",
    "path": "/assets",
    "pathParams": [],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [
      "content_base64"
    ],
    "summary": "Upload an asset from inline bytes"
  },
  "assets.fromUrl": {
    "method": "POST",
    "path": "/assets/from-url",
    "pathParams": [],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [
      "url"
    ],
    "summary": "Import an asset from a public URL"
  },
  "assets.get": {
    "method": "GET",
    "path": "/assets/{assetId}",
    "pathParams": [
      "assetId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Get an uploaded asset"
  },
  "products.list": {
    "method": "GET",
    "path": "/shops/{shopId}/products",
    "pathParams": [
      "shopId"
    ],
    "queryParams": [
      "limit",
      "offset",
      "cursor"
    ],
    "requiredQuery": [],
    "querySchemas": {
      "limit": {
        "type": "integer",
        "default": 50,
        "maximum": 200
      },
      "offset": {
        "type": "integer",
        "default": 0
      },
      "cursor": {
        "type": "string"
      }
    },
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List products in a specific shop"
  },
  "products.create": {
    "method": "POST",
    "path": "/shops/{shopId}/products",
    "pathParams": [
      "shopId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [
      "catalog_product_id"
    ],
    "summary": "Create a shop product (store_products)"
  },
  "products.get": {
    "method": "GET",
    "path": "/shops/{shopId}/products/{productId}",
    "pathParams": [
      "shopId",
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Get a shop product"
  },
  "products.update": {
    "method": "PATCH",
    "path": "/shops/{shopId}/products/{productId}",
    "pathParams": [
      "shopId",
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Partial update of a shop product"
  },
  "products.delete": {
    "method": "DELETE",
    "path": "/shops/{shopId}/products/{productId}",
    "pathParams": [
      "shopId",
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Delete a shop product"
  },
  "products.publish": {
    "method": "POST",
    "path": "/shops/{shopId}/products/{productId}/publish",
    "pathParams": [
      "shopId",
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Start publish (emits product:publish:started)"
  },
  "products.ackPublishSuccess": {
    "method": "POST",
    "path": "/shops/{shopId}/products/{productId}/publishing_succeeded",
    "pathParams": [
      "shopId",
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Acknowledge publish success"
  },
  "products.ackPublishFailure": {
    "method": "POST",
    "path": "/shops/{shopId}/products/{productId}/publishing_failed",
    "pathParams": [
      "shopId",
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Acknowledge publish failure"
  },
  "products.unpublish": {
    "method": "POST",
    "path": "/shops/{shopId}/products/{productId}/unpublish",
    "pathParams": [
      "shopId",
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Unpublish a product"
  },
  "orders.list": {
    "method": "GET",
    "path": "/shops/{shopId}/orders",
    "pathParams": [
      "shopId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List orders"
  },
  "orders.create": {
    "method": "POST",
    "path": "/shops/{shopId}/orders",
    "pathParams": [
      "shopId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [
      "shipping_address",
      "line_items"
    ],
    "summary": "Create an order (idempotent via Idempotency-Key OR external_order_id)"
  },
  "orders.get": {
    "method": "GET",
    "path": "/shops/{shopId}/orders/{orderId}",
    "pathParams": [
      "shopId",
      "orderId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Get an order"
  },
  "orders.cancel": {
    "method": "POST",
    "path": "/shops/{shopId}/orders/{orderId}/cancel",
    "pathParams": [
      "shopId",
      "orderId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Cancel order"
  },
  "webhooks.list": {
    "method": "GET",
    "path": "/shops/{shopId}/webhooks",
    "pathParams": [
      "shopId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List webhook subscriptions"
  },
  "webhooks.create": {
    "method": "POST",
    "path": "/shops/{shopId}/webhooks",
    "pathParams": [
      "shopId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [
      "url",
      "topic"
    ],
    "summary": "Register a webhook subscription (one row per topic)"
  },
  "webhooks.get": {
    "method": "GET",
    "path": "/shops/{shopId}/webhooks/{webhookId}",
    "pathParams": [
      "shopId",
      "webhookId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Get a webhook"
  },
  "webhooks.update": {
    "method": "PATCH",
    "path": "/shops/{shopId}/webhooks/{webhookId}",
    "pathParams": [
      "shopId",
      "webhookId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Update a webhook (url / status)"
  },
  "webhooks.delete": {
    "method": "DELETE",
    "path": "/shops/{shopId}/webhooks/{webhookId}",
    "pathParams": [
      "shopId",
      "webhookId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Delete a webhook"
  },
  "webhooks.test": {
    "method": "POST",
    "path": "/shops/{shopId}/webhooks/{webhookId}/test",
    "pathParams": [
      "shopId",
      "webhookId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Enqueue a synthetic ping delivery"
  },
  "webhooks.deliveries": {
    "method": "GET",
    "path": "/shops/{shopId}/webhooks/{webhookId}/deliveries",
    "pathParams": [
      "shopId",
      "webhookId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "List recent delivery attempts"
  },
  "mockups.render": {
    "method": "POST",
    "path": "/mockups/renders",
    "pathParams": [],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [
      "mockup_id",
      "art_url"
    ],
    "summary": "Render a catalog mockup"
  },
  "mockups.getRender": {
    "method": "GET",
    "path": "/mockups/renders/{renderId}",
    "pathParams": [
      "renderId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Fetch mockup render status"
  },
  "catalog.bySku": {
    "method": "GET",
    "path": "/catalog/products/by-sku/{sku}",
    "pathParams": [
      "sku"
    ],
    "queryParams": [
      "include"
    ],
    "requiredQuery": [],
    "querySchemas": {
      "include": {
        "type": "string",
        "example": "variants,print_locations,images,mockups,shipping"
      }
    },
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Fetch catalog product by SKU"
  },
  "catalog.assets": {
    "method": "GET",
    "path": "/catalog/products/{productId}/assets",
    "pathParams": [
      "productId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Fetch catalog product assets"
  },
  "orders.quote": {
    "method": "POST",
    "path": "/shops/{shopId}/orders/quote",
    "pathParams": [
      "shopId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": true,
    "requiredBodyFields": [
      "shipping_address",
      "line_items"
    ],
    "summary": "Quote an order without persisting it"
  },
  "orders.lookup": {
    "method": "GET",
    "path": "/shops/{shopId}/orders/lookup/{externalOrderId}",
    "pathParams": [
      "shopId",
      "externalOrderId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Find an order by external_order_id"
  },
  "webhooks.rotateSecret": {
    "method": "POST",
    "path": "/shops/{shopId}/webhooks/{webhookId}/rotate-secret",
    "pathParams": [
      "shopId",
      "webhookId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Rotate a webhook signing secret"
  },
  "webhooks.redeliver": {
    "method": "POST",
    "path": "/shops/{shopId}/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver",
    "pathParams": [
      "shopId",
      "webhookId",
      "deliveryId"
    ],
    "queryParams": [],
    "requiredQuery": [],
    "querySchemas": {},
    "bodyRequired": false,
    "requiredBodyFields": [],
    "summary": "Create a redelivery attempt from a prior delivery row"
  }
} as const;
