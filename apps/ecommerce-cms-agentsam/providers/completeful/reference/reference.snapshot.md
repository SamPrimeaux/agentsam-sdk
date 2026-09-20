### **List catalog products**

**​svgCopy link**

**svgAuth Required**

#### Query Parameters

- **limit**

  Type\:integer

  max:  

  200

  Default

  svgCopy link to limit

  Integer numbers.
- **offset**

  Type\:integer

  Default

  svgCopy link to offset

  Integer numbers.
- **cursor**

  Type\:stringsvgCopy link to cursor
- **search**

  Type\:stringsvgCopy link to search
- **marketplace\_eligible**

  Type\:booleansvgCopy link to marketplace\_eligible
- **include**

  Type\:string

  Example

  svgCopy link to include

  Comma-separated related resources to embed (variants, print\_locations, images, mockups, shipping). Use all for every supported relation. variants returns every sellable family member: the lead (is\_lead=true) plus all child variants.

#### Responses

- **svg**

  **200**

  Catalog products.

  application/json
- **svg**

  **401**

  Missing or invalid API key.

  application/json
- **svg**

  **500**

  Server error.

  application/json

**Request Example forget/catalog/products**

**Shell Curlsvg**

```curl
curl https://vxapi.completeful.com/v1/catalog/products \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'

```

svg

**svgTest Request(get /catalog/products)**

**Status:200Status:401Status:500**

**svg**

```json
{
  "items": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "catalog_product_id": "123e4567-e89b-12d3-a456-426614174000",
      "sku": null,
      "name": "string",
      "product_type": null,
      "print_type": null,
      "available": true,
      "marketplace_eligible": true,
      "pricing": {
        "currency": "string",
        "fulfillment_cost": {
          "free": null,
          "growth": null,
          "business": null
        }
      },
      "material": null,
      "dimensions": {
        "additionalProperty": "anything"
      },
      "default_title": null,
      "default_description": null,
      "tags": [
        "string"
      ],
      "cover_image_url": null,
      "main_icon_url": null,
      "realistic_image_url": null,
      "variants": [
        {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "sku": null,
          "name": null,
          "title": null,
          "variant_title": null,
          "variants_category": null,
          "attributes": {
            "additionalProperty": "anything"
          },
          "variant_attributes": {
            "additionalProperty": "anything"
          },
          "is_primary": true,
          "is_lead": true,
          "pricing": {
            "currency": "string",
            "fulfillment_cost": {
              "free": null,
              "growth": null,
              "business": null
            }
          },
          "cover_image_url": null,
          "main_icon_url": null,
          "realistic_image_url": null
        }
      ],
      "print_locations": [
        {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "name": "string",
          "x": null,
          "y": null,
          "width": null,
          "height": null,
          "artboard_width": 1,
          "artboard_height": 1,
          "file_width": null,
          "file_height": null,
          "unit": null,
          "dpi": null,
          "enabled": true,
          "shape_type": null,
          "artboard_image_url": null,
          "extra_cost": null
        }
      ],
      "images": [
        {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "url": "https://example.com",
          "thumbnail_url": null,
          "type": "string",
          "media_type": null,
          "sort_order": 1,
          "is_primary": true,
          "variant_title": null
        }
      ],
      "mockups": [
        {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "name": "string",
          "preview_url": null,
          "print_location_id": null,
          "active": true,
          "sort_order": 1
        }
      ],
      "shipping": {
        "profile_id": "string",
        "domestic": {
          "additionalProperty": "anything"
        },
        "international": {
          "additionalProperty": "anything"
        },
        "package": {
          "additionalProperty": "anything"
        }
      },
      "variant_title": null,
      "variant_attributes": {
        "additionalProperty": "anything"
      }
    }
  ],
  "pagination": {
    "limit": 1,
    "offset": 1,
    "count": 1,
    "next_cursor": null,
    "has_more": true
  }
}
```

svg

**Catalog products.**

### **Semantic catalog search**

**​svgCopy link**

**svgAuth Required**

Hybrid catalog search over the public product base: Voyage embeddings for semantic recall, fused with lexical and taxonomy matches via Reciprocal Rank Fusion, then an optional Voyage rerank pass. Returns the same product payload as GET /v1/catalog/products, ordered by relevance, with a per-item `relevance` block and top-level search diagnostics. Falls back to lexical/taxonomy ranking when Voyage is not configured.

#### Query Parameters

- **q**

  Type\:string

  max length:  

  200

  required

  Example

  svgCopy link to q

  Natural-language search query. Aliases: `query`, `search`.
- **limit**

  Type\:integer

  max:  

  50

  Default

  svgCopy link to limit

  Integer numbers.
- **include**

  Type\:string

  Example

  svgCopy link to include

  Comma-separated related resources to embed (variants, print\_locations, images, mockups, shipping). Use all for every supported relation. variants returns every sellable family member: the lead (is\_lead=true) plus all child variants.

#### Responses

- **svg**

  **200**

  Ranked catalog products with relevance diagnostics.

  application/json
- **svg**

  **400**

  Missing query.

  application/json
- **svg**

  **401**

  Missing or invalid API key.

  application/json
- **svg**

  **500**

  Server error.

  application/json

**Request Example forget/catalog/products/semantic**

**Shell Curlsvg**

```curl
curl 'https://vxapi.completeful.com/v1/catalog/products/semantic?q=cozy%20gift%20for%20dog%20lovers' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'

```

svg

**svgTest Request(get /catalog/products/semantic)**

**Status:200Status:400Status:401Status:500**

**svg**

```json
{
  "items": [
    {
      "relevance": {
        "match_score": 1,
        "rrf_score": 1,
        "lexical_score": 1,
        "semantic_distance": null,
        "rerank_score": null
      },
      "additionalProperty": "anything"
    }
  ],
  "query": "string",
  "count": 1,
  "confidence": "high",
  "used_semantic": true,
  "semantic_model": null,
  "used_rerank": true,
  "rerank_model": null,
  "matched_categories": [
    "string"
  ],
  "matched_groups": [
    "string"
  ]
}
```

svg

**Ranked catalog products with relevance diagnostics.**

### **Fetch enriched catalog product**

**​svgCopy link**

**svgAuth Required**

#### Path Parameters

- **productId**

  Type\:stringFormat\:uuid

  required

  svgCopy link to productId

#### Query Parameters

- **include**

  Type\:string

  Example

  svgCopy link to include

  Comma-separated related resources to embed (variants, print\_locations, images, mockups, shipping). Use all for every supported relation. variants returns every sellable family member: the lead (is\_lead=true) plus all child variants.

#### Responses

- **svg**

  **200**

  Catalog product.

  application/json
- **svg**

  **400**

  Invalid product id.

  application/json
- **svg**

  **401**

  Missing or invalid API key.

  application/json
- **svg**

  **404**

  Product not found.

  application/json
- **svg**

  **500**

  Server error.

  application/json

**Request Example forget/catalog/products/*****{productId}***

**Shell Curlsvg**

```curl
curl https://vxapi.completeful.com/v1/catalog/products/123e4567-e89b-12d3-a456-426614174000 \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'

```

svg

**svgTest Request(get /catalog/products/{productId})**

**Status:200Status:400Status:401Status:404Status:500**

**svg**

```json
{
  "product": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "catalog_product_id": "123e4567-e89b-12d3-a456-426614174000",
    "sku": null,
    "name": "string",
    "product_type": null,
    "print_type": null,
    "available": true,
    "marketplace_eligible": true,
    "pricing": {
      "currency": "string",
      "fulfillment_cost": {
        "free": null,
        "growth": null,
        "business": null
      }
    },
    "material": null,
    "dimensions": {
      "additionalProperty": "anything"
    },
    "default_title": null,
    "default_description": null,
    "tags": [
      "string"
    ],
    "cover_image_url": null,
    "main_icon_url": null,
    "realistic_image_url": null,
    "variants": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "sku": null,
        "name": null,
        "title": null,
        "variant_title": null,
        "variants_category": null,
        "attributes": {
          "additionalProperty": "anything"
        },
        "variant_attributes": {
          "additionalProperty": "anything"
        },
        "is_primary": true,
        "is_lead": true,
        "pricing": {
          "currency": "string",
          "fulfillment_cost": {
            "free": null,
            "growth": null,
            "business": null
          }
        },
        "cover_image_url": null,
        "main_icon_url": null,
        "realistic_image_url": null
      }
    ],
    "print_locations": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "name": "string",
        "x": null,
        "y": null,
        "width": null,
        "height": null,
        "artboard_width": 1,
        "artboard_height": 1,
        "file_width": null,
        "file_height": null,
        "unit": null,
        "dpi": null,
        "enabled": true,
        "shape_type": null,
        "artboard_image_url": null,
        "extra_cost": null
      }
    ],
    "images": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "url": "https://example.com",
        "thumbnail_url": null,
        "type": "string",
        "media_type": null,
        "sort_order": 1,
        "is_primary": true,
        "variant_title": null
      }
    ],
    "mockups": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "name": "string",
        "preview_url": null,
        "print_location_id": null,
        "active": true,
        "sort_order": 1
      }
    ],
    "shipping": {
      "profile_id": "string",
      "domestic": {
        "additionalProperty": "anything"
      },
      "international": {
        "additionalProperty": "anything"
      },
      "package": {
        "additionalProperty": "anything"
      }
    },
    "variant_title": null,
    "variant_attributes": {
      "additionalProperty": "anything"
    }
  }
}
```

svg

**Catalog product.**

### **List catalog product variants**

**​svgCopy link**

**svgAuth Required**

#### Path Parameters

- **productId**

  Type\:stringFormat\:uuid

  required

  svgCopy link to productId

#### Responses

- **200**

  svgCopy link to 200

  OK

**Request Example forget/catalog/products/*****{productId}*****/variants**

**Shell Curlsvg**

```curl
curl https://vxapi.completeful.com/v1/catalog/products/123e4567-e89b-12d3-a456-426614174000/variants \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'

```

svg

**svgTest Request(get /catalog/products/{productId}/variants)**

**Status:200**

No Body

**OK**

### **List enabled print locations for a catalog product**

**​svgCopy link**

**svgAuth Required**

#### Path Parameters

- **productId**

  Type\:stringFormat\:uuid

  required

  svgCopy link to productId

#### Responses

- **200**

  svgCopy link to 200

  OK

**Request Example forget/catalog/products/*****{productId}*****/print-locations**

**Shell Curlsvg**

```curl
curl https://vxapi.completeful.com/v1/catalog/products/123e4567-e89b-12d3-a456-426614174000/print-locations \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'

```

svg

**svgTest Request(get /catalog/products/{productId}/print-locations)**

**Status:200**

No Body

**OK**

### **List mockups**

**​svgCopy link**

**svgAuth Required**

#### Path Parameters

- **productId**

  Type\:stringFormat\:uuid

  required

  svgCopy link to productId

#### Query Parameters

- **print\_location\_id**

  Type\:stringFormat\:uuidsvgCopy link to print\_location\_id

#### Responses

- **200**

  svgCopy link to 200

  OK

**Request Example forget/catalog/products/*****{productId}*****/mockups**

**Shell Curlsvg**

```curl
curl https://vxapi.completeful.com/v1/catalog/products/123e4567-e89b-12d3-a456-426614174000/mockups \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'

```

svg

**svgTest Request(get /catalog/products/{productId}/mockups)**

**Status:200**
No Body

**OK**

### **Catalog shipping cost columns**

**​svgCopy link**

**svgAuth Required**

#### Path Parameters

- **productId**

  Type\:stringFormat\:uuid

  required

  svgCopy link to productId

#### Responses

- **200**

  svgCopy link to 200

  OK

**Request Example forget/catalog/products/*****{productId}*****/shipping**

**Shell Curlsvg**

```curl
curl https://vxapi.completeful.com/v1/catalog/products/123e4567-e89b-12d3-a456-426614174000/shipping \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'

```

svg

**svgTest Request(get /catalog/products/{productId}/shipping)**

**Status:200**

No Body

**OK**

### **Fetch catalog product by SKU**

**​svgCopy link**

**svgAuth Required**

#### Path Parameters

- **sku**

  Type\:string

  required

  svgCopy link to sku

#### Query Parameters

- **include**

  Type\:string

  Example

  svgCopy link to include

  Comma-separated related resources to embed (variants, print\_locations, images, mockups, shipping). Use all for every supported relation. variants returns every sellable family member: the lead (is\_lead=true) plus all child variants.

#### Responses

- **svg**

  **200**

  Catalog product.

  application/json
- **svg**

  **400**

  Invalid SKU.

  application/json
- **svg**

  **401**

  Missing or invalid API key.

  application/json
- **svg**

  **404**

  Product not found.

  application/json
- **svg**

  **500**

  Server error.

  application/json

**Request Example forget/catalog/products/by-sku/*****{sku}***

**Shell Curlsvg**

```curl
curl 'https://vxapi.completeful.com/v1/catalog/products/by-sku/{sku}' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'

```

svg

**svgTest Request(get /catalog/products/by-sku/{sku})**

**Status:200Status:400Status:401Status:404Status:500**

**svg**

```json
{
  "product": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "catalog_product_id": "123e4567-e89b-12d3-a456-426614174000",
    "sku": null,
    "name": "string",
    "product_type": null,
    "print_type": null,
    "available": true,
    "marketplace_eligible": true,
    "pricing": {
      "currency": "string",
      "fulfillment_cost": {
        "free": null,
        "growth": null,
        "business": null
      }
    },
    "material": null,
    "dimensions": {
      "additionalProperty": "anything"
    },
    "default_title": null,
    "default_description": null,
    "tags": [
      "string"
    ],
    "cover_image_url": null,
    "main_icon_url": null,
    "realistic_image_url": null,
    "variants": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "sku": null,
        "name": null,
        "title": null,
        "variant_title": null,
        "variants_category": null,
        "attributes": {
          "additionalProperty": "anything"
        },
        "variant_attributes": {
          "additionalProperty": "anything"
        },
        "is_primary": true,
        "is_lead": true,
        "pricing": {
          "currency": "string",
          "fulfillment_cost": {
            "free": null,
            "growth": null,
            "business": null
          }
        },
        "cover_image_url": null,
        "main_icon_url": null,
        "realistic_image_url": null
      }
    ],
    "print_locations": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "name": "string",
        "x": null,
        "y": null,
        "width": null,
        "height": null,
        "artboard_width": 1,
        "artboard_height": 1,
        "file_width": null,
        "file_height": null,
        "unit": null,
        "dpi": null,
        "enabled": true,
        "shape_type": null,
        "artboard_image_url": null,
        "extra_cost": null
      }
    ],
    "images": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "url": "https://example.com",
        "thumbnail_url": null,
        "type": "string",
        "media_type": null,
        "sort_order": 1,
        "is_primary": true,
        "variant_title": null
      }
    ],
    "mockups": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "name": "string",
        "preview_url": null,
        "print_location_id": null,
        "active": true,
        "sort_order": 1
      }
    ],
    "shipping": {
      "profile_id": "string",
      "domestic": {
        "additionalProperty": "anything"
      },
      "international": {
        "additionalProperty": "anything"
      },
      "package": {
        "additionalProperty": "anything"
      }
    },
    "variant_title": null,
    "variant_attributes": {
      "additionalProperty": "anything"
    }
  }
}
```

svg

**Catalog product.**

### **Fetch catalog product assets**

**​svgCopy link**

**svgAuth Required**

#### Path Parameters

- **productId**

  Type\:stringFormat\:uuid

  required

  svgCopy link to productId

#### Responses

- **svg**

  **200**

  Catalog product assets.

  application/json
- **svg**

  **400**

  Invalid product id.

  application/json
- **svg**

  **401**

  Missing or invalid API key.

  application/json
- **svg**

  **404**

  Product not found.

  application/json
- **svg**

  **500**

  Server error.

  application/json

**Request Example forget/catalog/products/*****{productId}*****/assets**

**Shell Curlsvg**

```curl
curl https://vxapi.completeful.com/v1/catalog/products/123e4567-e89b-12d3-a456-426614174000/assets \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'

```

svg

**svgTest Request(get /catalog/products/{productId}/assets)**

**Status:200Status:400Status:401Status:404Status:500**

**svg**

```json
{
  "assets": {
    "cover_image_url": null,
    "main_icon_url": null,
    "realistic_image_url": null,
    "images": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "url": "https://example.com",
        "thumbnail_url": null,
        "type": "string",
        "media_type": null,
        "sort_order": 1,
        "is_primary": true,
        "variant_title": null
      }
    ],
    "mockups": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "name": "string",
        "preview_url": null,
        "print_location_id": null,
        "active": true,
        "sort_order": 1
      }
    ]
  }
}
```

svg

**Catalog product assets.**

## **Mockups **

**​svgCopy link**

**MockupsOperations**

- post/mockups/renders
- get/mockups/renders/{renderId}

### **Render a catalog mockup**

**​svgCopy link**

**svgAuth Required**

Renders an approved product mockup with a public artwork URL. Artwork is clipped to the print location's shape by default (disable with output.clip\_to\_print\_area=false). Returns 200 when cached or fast, otherwise 202 with a render\_id to poll.

#### Headers

- **Idempotency-Key**

  Type\:stringsvgCopy link to Idempotency-Key

  If provided, the response is cached for 24 h and replayed on retry. Reusing the key with a different body returns 409.

#### Body·MockupRenderRequest

required

application/json

- **art\_url**

  Type\:stringFormat\:uri

  required

  svgCopy link to art\_url

  Public URL for the artwork to place into the mockup.
- **mockup\_id**

  Type\:stringFormat\:uuid

  required

  svgCopy link to mockup\_id

  product\_mockup.id returned by catalog mockup discovery.
- svg

  **output**

  Type\:object{ clip\_to\_print\_area, format, max\_size }svgCopy link to output

  Properties: 3

#### Responses

- **svg**

  **200**

  Render succeeded or terminal cached result.

  application/json
- **svg**

  **202**

  Render queued or running. Poll the status endpoint.

  application/json
- **svg**

  **400**

  Invalid request.

  application/json
- **svg**

  **401**

  Missing or invalid API key.

  application/json
- **svg**

  **404**

  Mockup not found.

  application/json
- **svg**

  **422**

  Artwork URL or mockup cannot be rendered.

  application/json
- **svg**

  **500**

  Server error.

  application/json

**Request Example forpost/mockups/renders**

**Shell Curlsvg**

```curl
curl https://vxapi.completeful.com/v1/mockups/renders \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
  "mockup_id": "",
  "art_url": "",
  "output": {
    "format": "png",
    "max_size": 1500,
    "clip_to_print_area": true
  }
}'

```

svg

**svgTest Request(post /mockups/renders)**

**Status:200Status:202Status:400Status:401Status:404Status:422Status:500**

**svg**

```json
{
  "status": "queued",
  "render_id": "123e4567-e89b-12d3-a456-426614174000",
  "mockups": [
    {
      "url": "https://example.com",
      "width": 1,
      "height": 1
    }
  ],
  "cache_hit": true,
  "render_time_ms": 1,
  "error": "string"
}
```

svg

**Render succeeded or terminal cached result.**

### **Fetch mockup render status**

**​svgCopy link**

**svgAuth Required**

#### Path Parameters

- **renderId**

  Type\:stringFormat\:uuid

  required

  svgCopy link to renderId

#### Responses

- **svg**

  **200**

  Current render status.

  application/json
- **svg**

  **400**

  Invalid render id.

  application/json
- **svg**

  **401**

  Missing or invalid API key.

  application/json
- **svg**

  **404**

  Render not found.

  application/json
- **svg**

  **500**

  Server error.

  application/json

**Request Example forget/mockups/renders/*****{renderId}***

**Shell Curlsvg**

```curl
curl https://vxapi.completeful.com/v1/mockups/renders/123e4567-e89b-12d3-a456-426614174000 \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'

```

svg

**svgTest Request(get /mockups/renders/{renderId})**

**Status:200Status:400Status:401Status:404Status:500**

**svg**

```json
{
  "status": "queued",
  "render_id": "123e4567-e89b-12d3-a456-426614174000",
  "mockups": [
    {
      "url": "https://example.com",
      "width": 1,
      "height": 1
    }
  ],
  "cache_hit": true,
  "render_time_ms": 1,
  "error": "string"
}
```

svg

**Current render status.**

## **Designs (Collapsed)**

**​svgCopy link**

**DesignsOperations**

- get/designs
- post/designs
- get/designs/exports/{exportId}
- post/designs/{designId}/exports
- get/designs/{designId}
- patch/designs/{designId}
- delete/designs/{designId}

**Show Moresvg**

## **Assets (Collapsed)**

**​svgCopy link**

**AssetsOperations**

- post/assets
- post/assets/from-url
- get/assets/{assetId}

**Show Moresvg**

## **Products (Collapsed)**

**​svgCopy link**

## **Orders (Collapsed)**

**​svgCopy link**

**OrdersOperations**

- post/shops/{shopId}/orders/quote
- get/shops/{shopId}/orders/lookup/{externalOrderId}

**Show Moresvg**

## **Webhooks (Collapsed)**

**​svgCopy link**

**WebhooksOperations**

- post/shops/{shopId}/webhooks/{webhookId}/rotate-secret
- post/shops/{shopId}/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver

**Show Moresvg**

## **Shops (multi-shop) (Collapsed)**

**​svgCopy link**

**Shops (multi-shop)Operations**

- get/shops
- post/shops
- get/shops/{shopId}
- delete/shops/{shopId}/connection
- get/shops/{shopId}/products
- post/shops/{shopId}/products
- get/shops/{shopId}/products/{productId}
- patch/shops/{shopId}/products/{productId}
- delete/shops/{shopId}/products/{productId}
- post/shops/{shopId}/products/{productId}/publish
- post/shops/{shopId}/products/{productId}/publishing\_succeeded
- post/shops/{shopId}/products/{productId}/publishing\_failed
- post/shops/{shopId}/products/{productId}/unpublish
- get/shops/{shopId}/orders
- post/shops/{shopId}/orders
- get/shops/{shopId}/orders/{orderId}
- post/shops/{shopId}/orders/{orderId}/cancel
- get/shops/{shopId}/webhooks
- post/shops/{shopId}/webhooks
- get/shops/{shopId}/webhooks/{webhookId}
- patch/shops/{shopId}/webhooks/{webhookId}- delete/shops/{shopId}/webhooks/{webhookId}
- post/shops/{shopId}/webhooks/{webhookId}/test
- get/shops/{shopId}/webhooks/{webhookId}/deliveries

**Show Moresvg**

## **Referrals (Collapsed)**

**​svgCopy link**

**ReferralsOperations**

- get/referrals/summary
- get/referrals/tier1
- get/referrals/tier2
- get/referrals/payouts

**Show Moresvg**

## **Validation (Collapsed)**

**​svgCopy link**

**ValidationOperations**

- post/addresses/validate
- post/print-files/validate

**Show Moresvg**

## **Models**