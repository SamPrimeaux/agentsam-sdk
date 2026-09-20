```
{
  "openapi": "3.0.3",
  "info": {
    "title": "Completeful Partner API",
    "version": "0.1.0",
    "description": "Programmatic API for Completeful sellers. Shop-scoped resources use explicit /v1/shops/{shopId}/... paths so multi-shop integrations have one canonical route model. Route access is enforced with broad per-resource scopes (for example products:read / products:write); keys with an empty scopes array remain legacy full-access keys for backward compatibility. `capp_test_` API keys execute requests in dry-run mode: authenticated requests include X-Capp-Mode: test and X-Capp-Dry-Run: true, while mutating endpoints validate and return preview payloads without persisting live writes or enqueueing downstream side effects. User-supplied webhook and artwork URLs must resolve to public destinations; localhost, private-network, and metadata-style hosts are rejected."
  },
  "servers": [
    {
      "url": "https://vxapi.completeful.com/v1",
      "description": "Production"
    },
    {
      "url": "/v1",
      "description": "This host"
    }
  ],
  "x-partner-guides": {
    "quote_and_charge_semantics": "Order quotes and charges use the same authoritative fulfillment-pricing contract. The API resolves the selected catalog child first, then applies fixed or percentage overrides, subscription/store/base-cost precedence, print-location extras, patch-material extras, and configured destination-aware shipping. POST /shops/{shopId}/orders/quote performs the same validation and returns the pricing contract/version and canonical line tuples without persisting. Order creation snapshots those values; the billing importer recomputes them immediately before wallet-first, Stripe-fallback charging and rejects mismatches. Retail totals supplied by callers never determine the fulfillment charge. USD and the configured standard shipping method are currently supported; unconfigured methods are rejected instead of estimated.",
    "order_flag_semantics": "Order reads expose an additive flags array sourced from shared-db store_order_flags. Current flags include first_order (auto-stamped on the seller's first order across stores) and vip_treatment (copied from an active store-level or manual make-good flag). Each flag row includes {flag, source, reason, created_at}. Older environments that have not yet applied the Capp2 order-flags migration return an empty array instead of failing reads.",
    "order_item_review_states": "Order reads may surface `line_items[].properties.buyer_artwork_auto_placement` when the shared Capp2 fulfillment pipeline auto-places buyer-uploaded artwork into seller-defined image placeholders. Once Capp2 records this object, shared replay/re-import paths preserve it until a later explicit state update replaces it. `placed_pending_review` means review assets and even internal print files may already exist, but fulfillment must stay held until a seller/admin approval flips the state to `approved`. `failed`, `skipped`, and `no_upload` explain why the automatic path did not complete. Preserve unknown keys on this object for forward compatibility.",
    "wizard_equivalent_variants": "Product variants use the same canonical design × print-location × catalog-product × patch-material universe and marketplace projection rules as the Completeful listing wizard. The canonical version 1 input is {version: 1, axes: {<axisId>: {selectedValueIds: [...] }}, universeSignature?, inputs?: {locationVariantsEnabled?}}. The legacy {include: \"all\", exclude: [...], overrides: [...]} shape remains accepted and is adapted for v1 compatibility. Every sellable tuple is persisted; projection collisions and marketplace option/variant limits return structured errors instead of silently dropping variants.",
    "catalog_mockup_resolution": "Catalog mockup discovery is family-resolved. GET /catalog/products/{productId}/mockups and catalog responses with include=mockups return the requested product's approved family pool, not just rows whose product_id equals the anchor. For child variants, mockups resolve with exact-variant > scope-matching parent > unscoped parent precedence; inherited print_location_id values are remapped by print-location name onto the requested product before filtering or rendering. CatalogMockup.variant_scope echoes any parent scope.",
    "catalog_realistic_images": "Catalog product, variant, and asset responses expose realistic_image_url using the seller mini-map fallback order. The shared family owner is treated as a sellable member, not a privileged host: stale pins at a mockup scoped to another variant are ignored. Front is the preferred location when available; on multi-location products, a saved pin for that location wins even if the legacy single-pointer last recorded another location. Otherwise fallback prefers the current member's own visible mockup, then scope-matching shared-owner mockups, then family-shared mockups, then any custom mini_map_image_url, then the cover/main icon image.",
    "unsupported_tiktok": "TikTok is not a supported publish target. Any product create or publish request containing tiktok is rejected synchronously with HTTP 422 and code unsupported_publish_target before product or queue writes. Shopify and Etsy are the supported targets.",
    "marketplace_prerequisites": "Before publishing, inspect marketplace_readiness from GET /shops or GET /shops/{shopId}. Shopify and Etsy each require an active marketplace account for the shop owner with a connected shop_id, and the shop marketplace must be compatible. Publish only when ready is true. Shopify and Etsy projection limits are validated before external creation; Etsy also requires the connected shop's shipping/readiness configuration used by its listing workflow.",
    "order_personalization_shapes": "Create and quote requests keep using line_items[].personalization as a flat object keyed by the referenced design or store-product field ids. Stored shared-DB order rows and GET order responses may also include line_items[].properties.personalization_fields[] with structured answers (including Etsy multi-question and file-upload metadata), while properties.personalization_text remains the flattened legacy summary.",
    "webhook_diagnostics_and_redelivery": "Webhook destinations must be public HTTPS URLs. Signing secrets are revealed only on create or rotation. List deliveries to inspect status, attempts, response_status, bounded response_body, last_error, next_attempt_at, and timestamps. POST /shops/{shopId}/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver creates a linked retry while preserving the original delivery for diagnostics.",
    "structured_actionable_errors": "Failures use {error, code, request_id, path, field?, allowed_values?, remediation?, details?}. code is stable for programmatic handling, request_id correlates dashboard Activity and support diagnostics, and remediation explains the next action. Example: {\"error\":\"TikTok publishing is not supported\",\"code\":\"unsupported_publish_target\",\"request_id\":\"req_01J...\",\"path\":\"/v1/shops/{shopId}/products\",\"field\":\"publish_to\",\"allowed_values\":[\"shopify\",\"etsy\"],\"remediation\":\"Use one of the allowed values and retry.\"}",
    "referral_commissions": "GET /referrals/* exposes the account owner's referral-program commissions (the same data as the dashboard commissions page): a KPI summary, tier-1 and tier-2 referred-seller aggregates, and a per-sale payout ledger. Amounts are integer cents; rates are basis points on fulfillment cost. Because this is owner-personal earnings data, the referrals:read scope must be granted explicitly on the key — unlike other resources it is never implied by legacy empty-scope keys or a blanket * scope. Referred sellers are identified only by display name and masked email; no raw emails or foreign ids are returned."
  },
  "x-dashboard-quickstart": {
    "required_operations": [
      "GET /v1/shops",
      "POST /v1/shops",
      "GET /v1/catalog/products",
      "POST /v1/designs",
      "POST /v1/shops/{shopId}/products",
      "POST /v1/shops/{shopId}/orders/quote",
      "GET /v1/shops/{shopId}/orders",
      "GET /v1/shops/{shopId}/webhooks"
    ],
    "notes": [
      "Set VITE_CAPP_API_URL to the deployed API origin for dashboard links.",
      "The shell quickstart reads CAPP_API_URL and CAPP_KEY at runtime and defaults to the production API origin.",
      "Product, order, and webhook calls are always shop-scoped."
    ],
    "shell": [
      "# Requires bash, curl, and Node.js.",
      "set -euo pipefail",
      "API_URL=\"${CAPP_API_URL:-https://vxapi.completeful.com}\"",
      "API_URL=\"${API_URL%/}\"",
      "CAPP_KEY=\"${CAPP_KEY:?Export your Completeful API key as CAPP_KEY}\"",
      "api() { curl --fail-with-body --silent --show-error -H \"Authorization: Bearer $CAPP_KEY\" -H \"Content-Type: application/json\" \"$@\"; }",
      "",
      "# 1. Resolve the primary accessible shop; create a sub-shop only if none exists.",
      "shops_json=\"$(api \"$API_URL/v1/shops\")\"",
      "SHOP_ID=\"$(printf '%s' \"$shops_json\" | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>process.stdout.write(JSON.parse(s).shops?.[0]?.id||\"\"))')\"",
      "if [[ -z \"$SHOP_ID\" ]]; then",
      "  shop_json=\"$(api -X POST -H \"Idempotency-Key: $(uuidgen)\" --data '{\"name\":\"API quickstart shop\"}' \"$API_URL/v1/shops\")\"",
      "  SHOP_ID=\"$(printf '%s' \"$shop_json\" | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>process.stdout.write(JSON.parse(s).shop.id))')\"",
      "fi",
      "echo \"shop_id=$SHOP_ID\"",
      "",
      "# 2. Choose a catalog product.",
      "catalog_json=\"$(api \"$API_URL/v1/catalog/products?limit=1&include=variants\")\"",
      "CATALOG_PRODUCT_ID=\"$(printf '%s' \"$catalog_json\" | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const j=JSON.parse(s);process.stdout.write((j.items||j.products||[])[0]?.id||\"\")})')\"",
      "test -n \"$CATALOG_PRODUCT_ID\" || { echo 'No catalog product is available' >&2; exit 1; }",
      "",
      "# 3. Create a reusable design and capture its id.",
      "design_json=\"$(api -X POST -H \"Idempotency-Key: $(uuidgen)\" --data '{\"name\":\"API quickstart design\",\"canvas_json\":{\"version\":\"5.3.0\",\"objects\":[]}}' \"$API_URL/v1/designs\")\"",
      "DESIGN_ID=\"$(printf '%s' \"$design_json\" | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>process.stdout.write(JSON.parse(s).design.id))')\"",
      "echo \"design_id=$DESIGN_ID\"",
      "",
      "# 4. Attach the design to a shop-scoped product. Legacy include=all maps to the canonical wizard universe.",
      "product_payload=\"$(node -e 'process.stdout.write(JSON.stringify({catalog_product_id:process.argv[1],design_id:process.argv[2],title:\"API quickstart product\",retail_price:24.99,variants:{include:\"all\"}}))' \"$CATALOG_PRODUCT_ID\" \"$DESIGN_ID\")\"",
      "product_json=\"$(api -X POST -H \"Idempotency-Key: $(uuidgen)\" --data \"$product_payload\" \"$API_URL/v1/shops/$SHOP_ID/products\")\"",
      "STORE_PRODUCT_ID=\"$(printf '%s' \"$product_json\" | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>process.stdout.write(JSON.parse(s).product.id))')\"",
      "echo \"store_product_id=$STORE_PRODUCT_ID\"",
      "",
      "# 5. Quote authoritative fulfillment cost, then inspect canonical order and webhook resources.",
      "quote_payload=\"$(node -e 'process.stdout.write(JSON.stringify({shipping_method:\"standard\",shipping_address:{name:\"API Test\",line1:\"123 Test St\",city:\"Nashville\",region:\"TN\",postal_code:\"37203\",country:\"US\"},line_items:[{store_product_id:process.argv[1],quantity:1}]}))' \"$STORE_PRODUCT_ID\")\"",
      "api -X POST --data \"$quote_payload\" \"$API_URL/v1/shops/$SHOP_ID/orders/quote\"",
      "api \"$API_URL/v1/shops/$SHOP_ID/orders\"",
      "api \"$API_URL/v1/shops/$SHOP_ID/webhooks\""
    ]
  },
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "tags": [
    {
      "name": "Catalog"
    },
    {
      "name": "Mockups"
    },
    {
      "name": "Designs"
    },
    {
      "name": "Assets"
    },
    {
      "name": "Products"
    },
    {
      "name": "Orders"
    },
    {
      "name": "Webhooks"
    },
    {
      "name": "Shops (multi-shop)"
    },
    {
      "name": "Referrals"
    }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "API_KEY",
        "description": "Authorization: Bearer capp_{live|test}_<id>.<secret>. Empty-scope keys are treated as legacy full-access keys; scoped keys must satisfy each route group's required read/write scope."
      }
    },
    "headers": {
      "XCappMode": {
        "description": "Execution mode derived from the API key prefix.",
        "schema": {
          "type": "string",
          "enum": [
            "live",
            "test"
          ]
        }
      },
      "XCappDryRun": {
        "description": "Present and set to true on authenticated requests made with a capp_test_ API key.",
        "schema": {
          "type": "string",
          "enum": [
            "true"
          ]
        }
      }
    },
    "parameters": {
      "shopId": {
        "name": "shopId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        },
        "description": "A shop the partner has access to (their primary store_id or a registered sub-store_id)."
      },
      "IdempotencyKey": {
        "name": "Idempotency-Key",
        "in": "header",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "If provided, the response is cached for 24 h and replayed on retry. Reusing the key with a different body returns 409."
      }
    },
    "schemas": {
      "ReferralTierRow": {
        "type": "object",
        "description": "A referred seller with the API key owner's commission aggregates. Identity is minimized to display name and masked email.",
        "properties": {
          "display_name": {
            "type": [
              "string",
              "null"
            ]
          },
          "email_masked": {
            "type": [
              "string",
              "null"
            ],
            "description": "First character of the local part plus asterisks, then the full domain (e.g. j***@example.com)."
          },
          "joined_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "referred_via": {
            "type": [
              "string",
              "null"
            ]
          },
          "sales_count": {
            "type": "integer"
          },
          "commission_earned_cents": {
            "type": "integer"
          },
          "last_sale_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          }
        }
      },
      "DryRunDetails": {
        "type": "object",
        "properties": {
          "mode": {
            "type": "string",
            "enum": [
              "test"
            ]
          },
          "suppressed": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "created": {
            "type": "object",
            "additionalProperties": true
          },
          "current_state": {
            "type": "object",
            "additionalProperties": true
          },
          "notes": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        },
        "required": [
          "mode",
          "suppressed"
        ]
      },
      "Error": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string"
          },
          "code": {
            "type": "string",
            "description": "Stable machine-readable error code."
          },
          "request_id": {
            "type": [
              "string",
              "null"
            ],
            "description": "Echoed request identifier for support/debugging.",
            "format": "uuid"
          },
          "required_scopes": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Present on 403 responses caused by scope enforcement."
          },
          "path": {
            "type": "string",
            "description": "Canonical route template that produced the failure."
          },
          "field": {
            "type": "string",
            "description": "Request field to correct, when the failure maps to one field."
          },
          "allowed_values": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Accepted values for an enum-like field."
          },
          "remediation": {
            "type": "string",
            "description": "Actionable guidance for correcting or escalating the failure."
          },
          "details": {
            "type": "object",
            "additionalProperties": true,
            "description": "Safe structured diagnostics; request bodies, secrets, and PII are never included."
          },
          "personalization_errors": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "line_index": {
                  "type": "integer"
                },
                "missing_fields": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "unknown_fields": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "allowed_fields": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "required": [
          "error",
          "code"
        ],
        "example": {
          "error": "TikTok publishing is not supported",
          "code": "unsupported_publish_target",
          "request_id": "req_01JABCDEF123456789",
          "path": "/v1/shops/{shopId}/products",
          "field": "publish_to",
          "allowed_values": [
            "shopify",
            "etsy"
          ],
          "remediation": "Use one of the allowed values and retry."
        }
      },
      "ProductVariantSelection": {
        "type": "object",
        "description": "Wizard-equivalent canonical selection or its v1-compatible legacy adapter. Canonical axes can include design, print location, catalog product, and patch material. Projection collisions and marketplace limits are rejected; tuples are never silently dropped.",
        "oneOf": [
          {
            "type": "object",
            "required": [
              "version",
              "axes"
            ],
            "properties": {
              "version": {
                "type": "integer",
                "enum": [
                  1
                ]
              },
              "axes": {
                "type": "object",
                "additionalProperties": {
                  "type": "object",
                  "required": [
                    "selectedValueIds"
                  ],
                  "properties": {
                    "selectedValueIds": {
                      "type": "array",
                      "uniqueItems": true,
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              },
              "universeSignature": {
                "type": "string"
              },
              "inputs": {
                "type": "object",
                "properties": {
                  "locationVariantsEnabled": {
                    "type": "boolean"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "description": "Legacy v1 adapter retained for compatibility.",
            "properties": {
              "include": {
                "type": "string",
                "enum": [
                  "all"
                ]
              },
              "exclude": {
                "type": "array",
                "items": {
                  "type": "string",
                  "format": "uuid"
                }
              },
              "overrides": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": [
                    "variant_id"
                  ],
                  "properties": {
                    "variant_id": {
                      "type": "string",
                      "format": "uuid"
                    },
                    "retail_price": {
                      "type": "number",
                      "minimum": 0
                    },
                    "sku": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "Shop": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "kind": {
            "type": "string",
            "enum": [
              "primary",
              "sub"
            ]
          },
          "name": {
            "type": "string"
          },
          "display_name": {
            "type": "string"
          },
          "domain": {
            "type": [
              "string",
              "null"
            ]
          },
          "marketplace": {
            "type": [
              "string",
              "null"
            ]
          },
          "currency": {
            "type": [
              "string",
              "null"
            ]
          },
          "is_published": {
            "type": [
              "boolean",
              "null"
            ]
          },
          "connected_at": {
            "type": "string",
            "format": "date-time"
          },
          "marketplace_readiness": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/MarketplaceReadiness"
            }
          }
        },
        "required": [
          "id",
          "kind",
          "name",
          "display_name"
        ]
      },
      "Address": {
        "type": "object",
        "properties": {
          "name": {
            "type": [
              "string",
              "null"
            ]
          },
          "company": {
            "type": [
              "string",
              "null"
            ]
          },
          "line1": {
            "type": "string"
          },
          "line2": {
            "type": [
              "string",
              "null"
            ]
          },
          "city": {
            "type": "string"
          },
          "region": {
            "type": [
              "string",
              "null"
            ]
          },
          "postal_code": {
            "type": "string"
          },
          "country": {
            "type": "string",
            "minLength": 2,
            "maxLength": 2
          },
          "phone": {
            "type": [
              "string",
              "null"
            ]
          },
          "email": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "line1",
          "city",
          "postal_code",
          "country"
        ]
      },
      "LineItemInput": {
        "type": "object",
        "description": "Either an existing shop listing (`store_product_id`) or a direct catalog order line (`catalog_product_id` + `variant_id` + design source).",
        "properties": {
          "store_product_id": {
            "type": "string",
            "format": "uuid",
            "description": "store_products.id within the target shop"
          },
          "catalog_product_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid",
            "description": "Base catalog product id for direct catalog ordering."
          },
          "variant_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid",
            "description": "Catalog variant id. Required for direct catalog ordering and optional for existing store-product lines."
          },
          "quantity": {
            "type": "integer",
            "minimum": 1
          },
          "personalization": {
            "type": [
              "object",
              "null"
            ],
            "description": "Flat request-time personalization map keyed by the referenced design or store-product field ids. Shared DB order reads may also expose structured line_items[].properties.personalization_fields[] entries, but request bodies keep using this key/value object."
          },
          "design_template_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "design_option_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid",
            "description": "Canonical selected design option/template id. Existing design_template_id and design_id inputs remain supported."
          },
          "design_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid",
            "description": "Existing design_template id for direct catalog ordering."
          },
          "design": {
            "type": [
              "object",
              "null"
            ],
            "description": "Inline design input for direct catalog ordering."
          },
          "canvas_json": {
            "type": [
              "object",
              "null"
            ],
            "description": "Inline canvas payload for direct catalog ordering."
          },
          "print_files": {
            "type": [
              "array",
              "null"
            ],
            "minItems": 1,
            "description": "One artwork URL per print location for multi-location artwork (e.g. front + back). On direct catalog lines this is the line's design source and is mutually exclusive with design_id, design, canvas_json, and artfile_url. On store-listing lines (store_product_id) it overrides the listing's baked-in design for this order only and is mutually exclusive with design_template_id and design_option_id; the overriding item is fulfilled from a private fulfillment product and records print_files_override plus source_product_id in its properties. Each print_location_id must belong to the ordered catalog product, be enabled, and appear at most once.",
            "items": {
              "type": "object",
              "required": [
                "print_location_id",
                "url"
              ],
              "properties": {
                "print_location_id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Print location id from GET /v1/catalog/products/{productId}/print-locations."
                },
                "url": {
                  "type": "string",
                  "format": "uri",
                  "description": "Public artwork URL for this print location. Must resolve to a public http(s) host; localhost and private-network destinations are rejected."
                },
                "width": {
                  "type": [
                    "number",
                    "null"
                  ],
                  "description": "Artwork pixel width; defaults to the print location's file width."
                },
                "height": {
                  "type": [
                    "number",
                    "null"
                  ],
                  "description": "Artwork pixel height; defaults to the print location's file height."
                }
              }
            }
          },
          "print_location_ids": {
            "type": "array",
            "uniqueItems": true,
            "description": "Explicit canonical set of selected print locations. For direct print_files lines this is inferred when omitted.",
            "items": {
              "type": "string",
              "format": "uuid"
            }
          },
          "patch_material_option_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid",
            "description": "Selected active product_patch_material_options id."
          },
          "artfile_url": {
            "type": [
              "string",
              "null"
            ],            "format": "uri"
          },
          "art_file_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "image_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "auto_publish": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "When true on a direct catalog line, publish the created fulfillment product to the connected marketplace after order persistence succeeds."
          }
        },
        "required": [
          "quantity"
        ]
      },
      "OrderItemPersonalizationAnswerField": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "question_id": {
            "type": [
              "integer",
              "null"
            ]
          },
          "question_text": {
            "type": [
              "string",
              "null"
            ]
          },
          "type": {
            "type": "string",
            "enum": [
              "text",
              "dropdown",
              "file"
            ]
          },
          "value": {
            "type": [
              "string",
              "null"
            ]
          },
          "text": {
            "type": [
              "string",
              "null"
            ],
            "description": "Legacy alias of value retained on some text/dropdown entries."
          },
          "value_id": {
            "type": [
              "integer",
              "null"
            ]
          },
          "etsy_file_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "mirrored_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "mirrored_storage_path": {
            "type": [
              "string",
              "null"
            ]
          },
          "content_type": {
            "type": [
              "string",
              "null"
            ]
          },
          "bytes": {
            "type": [
              "integer",
              "null"
            ]
          },
          "mirrored_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "mirror_error": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "type"
        ]
      },
      "BuyerArtworkAutoPlacementField": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "node_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "label": {
            "type": [
              "string",
              "null"
            ]
          },
          "original_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "cropped_urls": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "uri"
            }
          }
        }
      },
      "BuyerArtworkAutoPlacement": {
        "type": "object",
        "additionalProperties": true,
        "required": [
          "status"
        ],
        "description": "Shared review state written onto store_order_items.properties by Capp2's buyer-artwork auto-placement flow and preserved across shared replay/re-import paths once recorded.",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "placed_pending_review",
              "approved",
              "failed",
              "skipped",
              "no_upload"
            ]
          },
          "placed_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "approved_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "failed_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "evaluated_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "error": {
            "type": [
              "string",
              "null"
            ]
          },
          "reason": {
            "type": [
              "string",
              "null"
            ]
          },
          "design_template_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "base_design_template_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "fields": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/BuyerArtworkAutoPlacementField"
            }
          },
          "print_files_saved": {
            "type": [
              "integer",
              "null"
            ]
          },
          "print_files_error": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      },
      "OrderItemProperties": {
        "type": "object",
        "additionalProperties": true,
        "description": "Shared-DB order item properties. API-created rows keep request personalization as flat keys; marketplace-ingested rows may also include structured personalization_fields entries plus file mirror metadata.",
        "properties": {
          "has_personalization": {
            "type": [
              "boolean",
              "null"
            ]
          },
          "personalization_text": {
            "type": [
              "string",
              "null"
            ]
          },
          "personalization_fields": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/OrderItemPersonalizationAnswerField"
            }
          },
          "personalization_mirror_pending": {
            "type": [
              "boolean",
              "null"
            ]
          },
          "variant_product_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "design_option_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "print_location_ids": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "uuid"
            }
          },
          "patch_material_option_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "print_files_override": {
            "type": [
              "boolean",
              "null"
            ]
          },
          "source_product_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "internal_unit_cost": {
            "type": [
              "number",
              "null"
            ]
          },
          "internal_cost_source": {
            "type": [
              "string",
              "null"
            ]
          },
          "pricing_policy_version": {
            "type": [
              "integer",
              "null"
            ]
          },
          "canonical_tuple": {
            "type": [
              "object",
              "null"
            ]
          },
          "buyer_artwork_auto_placement": {
            "$ref": "#/components/schemas/BuyerArtworkAutoPlacement"
          }
        }
      },
      "OrderLineItem": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "store_product_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "title": {
            "type": "string"
          },
          "variant_title": {
            "type": [
              "string",
              "null"
            ]
          },
          "variant_value": {
            "type": [
              "string",
              "null"
            ]
          },
          "sku": {
            "type": [
              "string",
              "null"
            ]
          },
          "price": {
            "type": "number"
          },
          "quantity": {
            "type": "integer"
          },
          "total": {
            "type": "number"
          },
          "fulfillment_status": {
            "type": "string"
          },
          "properties": {
            "$ref": "#/components/schemas/OrderItemProperties"
          },
          "internal_unit_cost": {
            "type": "number"
          },
          "pricing_source": {
            "type": [
              "string",
              "null"
            ]
          },
          "pricing_policy_version": {
            "type": [
              "integer",
              "null"
            ]
          },
          "canonical_tuple": {
            "type": [
              "object",
              "null"
            ]
          }
        }
      },
      "OrderCreateRequest": {
        "type": "object",
        "properties": {
          "external_order_id": {
            "type": [
              "string",
              "null"
            ],
            "description": "Partner PO number; reuses existing (store_id, external_order_id) unique index"
          },
          "shipping_address": {
            "$ref": "#/components/schemas/Address"
          },
          "billing_address": {
            "$ref": "#/components/schemas/Address"
          },
          "email": {
            "type": [
              "string",
              "null"
            ]
          },
          "currency": {
            "type": "string",
            "default": "USD",
            "enum": [
              "USD"
            ],
            "description": "Orders currently support USD only."
          },
          "notes": {
            "type": [
              "string",
              "null"
            ]
          },
          "shipping_method": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "standard",
              null
            ],
            "description": "Configured canonical shipping method; defaults to standard when omitted. Unconfigured methods are rejected."
          },
          "line_items": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/LineItemInput"
            },
            "minItems": 1
          }
        },
        "required": [
          "shipping_address",
          "line_items"
        ]
      },
      "OrderFlag": {
        "type": "object",
        "properties": {
          "flag": {
            "type": "string",
            "description": "Flag key stamped onto the order, for example first_order or vip_treatment."
          },
          "source": {
            "type": "string",
            "enum": [
              "auto",
              "store_flag",
              "manual"
            ],
            "description": "How the flag was applied to the order."
          },
          "reason": {
            "type": [
              "string",
              "null"
            ],
            "description": "Optional context copied from the originating store-level or manual flag."
          },
          "created_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          }
        },
        "required": [
          "flag",
          "source",
          "reason",
          "created_at"
        ]
      },
      "Order": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "shop_id": {
            "type": "string",
            "format": "uuid"
          },
          "external_order_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "order_number": {
            "type": "string"
          },
          "status": {
            "type": "string"
          },
          "payment_status": {
            "type": "string"
          },
          "billing_status": {
            "type": "string",
            "description": "Authoritative payment state for the order."
          },
          "import_status": {
            "type": [
              "string",
              "null"
            ],
            "description": "Current API order-import workflow status."
          },
          "import_processed_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "fulfillment_status": {
            "type": "string"
          },
          "refund_status": {
            "type": "string"
          },
          "currency": {
            "type": "string"
          },
          "subtotal": {
            "type": "number"
          },
          "tax_total": {
            "type": "number"
          },
          "shipping_total": {
            "type": "number"
          },
          "shipping_method": {
            "type": [
              "string",
              "null"
            ]
          },
          "shipping_service": {
            "type": [
              "string",
              "null"
            ]
          },
          "discount_total": {
            "type": "number"
          },
          "total": {
            "type": "number"
          },
          "shipping_address": {
            "$ref": "#/components/schemas/Address"
          },
          "billing_address": {
            "$ref": "#/components/schemas/Address"
          },
          "tracking": {
            "type": "array",
            "items": {
              "type": "object"
            }
          },
          "flags": {
            "type": "array",
            "description": "Shared-db order flags stamped by Capp2 after insert. Empty when no flags are present or when older environments have not yet applied the order-flags migration.",
            "items": {
              "$ref": "#/components/schemas/OrderFlag"
            }
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "updated_at": {
            "type": "string",
            "format": "date-time"
          },
          "line_items": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/OrderLineItem"
            }
          }
        }
      },
      "Webhook": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "shop_id": {
            "type": "string",
            "format": "uuid"
          },
          "url": {
            "type": "string",
            "format": "uri"
          },
          "topic": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "active",
              "paused",
              "disabled"
            ]
          },
          "secret": {
            "type": [
              "string",
              "null"
            ],
            "description": "Returned only on POST creation response"
          },
          "secret_last4": {
            "type": [
              "string",
              "null"
            ],
            "description": "Last four characters of the active signing secret."
          }
        }
      },
      "MarketplaceReadiness": {
        "type": "object",
        "properties": {
          "marketplace": {
            "type": "string",
            "enum": [
              "shopify",
              "etsy"
            ]
          },
          "store_marketplace": {
            "type": [
              "string",
              "null"
            ]
          },
          "ready": {
            "type": "boolean"
          },
          "reason": {
            "type": [              "string",
              "null"
            ]
          },
          "account_id": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      },
      "Design": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "canvas_json": {
            "type": "object"
          },
          "thumbnail_url": {
            "type": [
              "string",
              "null"
            ]
          },
          "tags": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "category_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "personalization_enabled": {
            "type": "boolean"
          },
          "personalization_fields": {
            "type": "array",
            "description": "Opaque shared design-field definitions. Etsy-originated templates may include richer multi-question metadata such as question_type, options, and add_on_price.",
            "items": {
              "type": "object"
            }
          },
          "shop_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "external_user_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "collection": {
            "type": [
              "string",
              "null"
            ]
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "DesignExport": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "design_id": {
            "type": "string",
            "format": "uuid"
          },
          "format": {
            "type": "string",
            "enum": [
              "json",
              "png",
              "jpeg",
              "svg"
            ]
          },
          "status": {
            "type": "string"
          },
          "source_url": {
            "type": [
              "string",
              "null"
            ]
          },
          "output_url": {
            "type": [
              "string",
              "null"
            ]
          },
          "error": {
            "type": [
              "string",
              "null"
            ]
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "finished_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          }
        }
      },
      "Asset": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "filename": {
            "type": [
              "string",
              "null"
            ]
          },
          "content_type": {
            "type": [
              "string",
              "null"
            ]
          },
          "size_bytes": {
            "type": "integer"
          },
          "source_url": {
            "type": [
              "string",
              "null"
            ]
          },
          "url": {
            "type": "string"
          },
          "sha256": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "WebhookDelivery": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "endpoint_id": {
            "type": "string",
            "format": "uuid"
          },
          "event_type": {
            "type": "string"
          },
          "status": {
            "type": "string"
          },
          "attempts": {
            "type": "integer"
          },
          "next_attempt_at": {
            "type": "string",
            "format": "date-time"
          },
          "last_error": {
            "type": [
              "string",
              "null"
            ]
          },
          "response_status": {
            "type": [
              "integer",
              "null"
            ]
          },
          "response_body": {
            "type": [
              "string",
              "null"
            ]
          },
          "redelivered_from": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "delivered_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          }
        }
      },
      "OrderQuoteResponse": {
        "type": "object",
        "properties": {
          "quote": {
            "type": "object",
            "properties": {
              "line_items": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "line_index": {
                      "type": "integer"
                    },
                    "quantity": {
                      "type": "integer"
                    },
                    "unit_price": {
                      "type": "number"
                    },
                    "line_total": {
                      "type": "number"
                    },
                    "catalog_product_id": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "format": "uuid"
                    },
                    "store_product_id": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "format": "uuid"
                    },
                    "title": {
                      "type": "string"
                    }
                  }
                }
              },
              "shipping_methods": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "code": {
                      "type": "string",
                      "enum": [
                        "standard",
                        "express"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "cost": {
                      "type": "number"
                    },
                    "estimated_delivery_days": {
                      "type": "array",
                      "items": {
                        "type": "integer"
                      },
                      "minItems": 2,
                      "maxItems": 2
                    }
                  }
                }
              },
              "selected_method": {
                "type": [
                  "object",
                  "null"
                ],
                "properties": {
                  "code": {
                    "type": "string",
                    "enum": [
                      "standard",
                      "express"
                    ]
                  },
                  "label": {
                    "type": "string"
                  },
                  "cost": {
                    "type": "number"
                  },
                  "estimated_delivery_days": {
                    "type": "array",
                    "items": {
                      "type": "integer"
                    },
                    "minItems": 2,
                    "maxItems": 2
                  }
                }
              },
              "estimated_production_days": {
                "type": "array",
                "items": {
                  "type": "integer"
                }
              },
              "subtotal": {
                "type": "number"
              },
              "shipping_total": {
                "type": "number"
              },
              "tax_total": {
                "type": "number"
              },
              "discount_total": {
                "type": "number"
              },
              "total_partner_cost": {
                "type": "number"
              },
              "currency": {
                "type": "string",
                "enum": [
                  "USD"
                ]
              }
            }
          }
        }
      },
      "MockupRenderRequest": {
        "type": "object",
        "properties": {
          "mockup_id": {
            "type": "string",
            "format": "uuid",
            "description": "product_mockup.id returned by catalog mockup discovery."
          },
          "art_url": {
            "type": "string",
            "format": "uri",
            "description": "Public URL for the artwork to place into the mockup."
          },
          "output": {
            "type": "object",
            "properties": {
              "format": {
                "type": "string",
                "enum": [
                  "png",
                  "jpeg"
                ],
                "default": "png"
              },
              "max_size": {
                "type": "integer",
                "minimum": 100,
                "maximum": 5000,
                "default": 1500
              },
              "clip_to_print_area": {
                "type": "boolean",
                "default": true,
                "description": "Clip the artwork to the print location's shape (circle, ellipse, rounded rectangle, or mask path) before rendering, matching Completeful's own mockup renders. Set false to place the artwork unclipped. Plain rectangular print areas are unaffected either way."
              }
            }
          }
        },
        "required": [
          "mockup_id",
          "art_url"
        ]
      },
      "MockupRenderImage": {
        "type": "object",
        "properties": {
          "url": {
            "type": "string",
            "format": "uri"
          },
          "width": {
            "type": "integer"
          },
          "height": {
            "type": "integer"
          }
        },
        "required": [
          "url",
          "width",
          "height"
        ]
      },
      "MockupRenderResponse": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "queued",
              "running",
              "succeeded",
              "failed"
            ]
          },
          "render_id": {
            "type": "string",
            "format": "uuid"
          },
          "mockups": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/MockupRenderImage"
            }
          },
          "cache_hit": {
            "type": "boolean"
          },
          "render_time_ms": {
            "type": "integer"
          },
          "error": {
            "type": "string"
          }
        },
        "required": [
          "status",
          "render_id"
        ]
      },
      "CatalogPrintLocation": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "x": {
            "type": [
              "number",
              "null"
            ]
          },
          "y": {
            "type": [
              "number",
              "null"
            ]
          },
          "width": {
            "type": [
              "number",
              "null"
            ]
          },
          "height": {
            "type": [
              "number",
              "null"
            ]
          },
          "artboard_width": {
            "type": "integer"
          },
          "artboard_height": {
            "type": "integer"
          },
          "file_width": {
            "type": [
              "number",
              "null"
            ]
          },
          "file_height": {
            "type": [
              "number",
              "null"
            ]
          },
          "unit": {
            "type": [
              "string",
              "null"
            ]
          },
          "dpi": {
            "type": [
              "integer",
              "null"
            ]
          },
          "enabled": {
            "type": "boolean"
          },
          "shape_type": {
            "type": [
              "string",
              "null"
            ]
          },
          "artboard_image_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri",
            "description": "Product photo the placement coordinates were drawn against. Render `placement` (x/y/width/height) on this image at its natural pixel size (`artboard_width` x `artboard_height`) to reproduce the designer print-area preview."
          },
          "extra_cost": {
            "type": [
              "number",
              "null"
            ]
          }
        }
      },
      "CatalogPricing": {
        "type": "object",
        "description": "Fulfillment cost per Completeful subscription plan. Amounts are two-decimal strings (e.g. \"4.80\") in the stated currency. Catalog pricing is indicative for margin planning; POST /shops/{shopId}/orders/quote is the authoritative price for an order.",
        "properties": {
          "currency": {
            "type": "string",
            "description": "ISO 4217 currency code for all amounts in this object."
          },
          "fulfillment_cost": {
            "type": "object",
            "description": "Per-unit fulfillment cost keyed by subscription plan slug.",
            "properties": {
              "free": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "growth": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "business": {
                "type": [
                  "string",
                  "null"
                ]
              }
            },
            "required": [
              "free",
              "growth",
              "business"
            ]
          }
        },
        "required": [
          "currency",
          "fulfillment_cost"
        ]
      },
      "CatalogVariant": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "sku": {
            "type": [
              "string",
              "null"
            ]
          },
          "name": {
            "type": [
              "string",
              "null"
            ]
          },
          "title": {
            "type": [
              "string",
              "null"
            ]
          },
          "variant_title": {
            "type": [
              "string",
              "null"
            ]
          },
          "variants_category": {
            "type": [
              "string",
              "null"
            ]
          },
          "attributes": {
            "type": "object",
            "additionalProperties": true
          },
          "variant_attributes": {
            "type": "object",
            "additionalProperties": true
          },
          "is_primary": {
            "type": "boolean"
          },
          "is_lead": {
            "type": "boolean",
            "description": "True for the family lead: the catalog product row itself, which is a sellable variant (its id and sku equal the product's). Exactly one variant in a family has is_lead=true."
          },
          "pricing": {
            "$ref": "#/components/schemas/CatalogPricing"
          },
          "cover_image_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "main_icon_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "realistic_image_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri",
            "description": "Seller mini-map style preview: stale pins at another variant scope are ignored, including on the shared-owner sellable member. Front is preferred when available; on multi-location products, a saved pin for that location wins even if the legacy single-pointer last recorded another location. Otherwise fallback prefers own, then scope-matching, then shared approved mockups, then custom mini_map_image_url, then cover/main icon."
          }
        }
      },
      "CatalogImage": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "url": {
            "type": "string",
            "format": "uri"
          },
          "thumbnail_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "type": {
            "type": "string"
          },
          "media_type": {
            "type": [              "string",
              "null"
            ]
          },
          "sort_order": {
            "type": "integer"
          },
          "is_primary": {
            "type": "boolean"
          },
          "variant_title": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      },
      "CatalogMockup": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "preview_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "print_location_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "active": {
            "type": "boolean"
          },
          "sort_order": {
            "type": "integer"
          }
        }
      },
      "CatalogShipping": {
        "type": "object",
        "properties": {
          "profile_id": {
            "type": "string"
          },
          "domestic": {
            "type": "object",
            "additionalProperties": true
          },
          "international": {
            "type": "object",
            "additionalProperties": true
          },
          "package": {
            "type": "object",
            "additionalProperties": true
          }
        }
      },
      "CatalogProductEnriched": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "catalog_product_id": {
            "type": "string",
            "format": "uuid"
          },
          "sku": {
            "type": [
              "string",
              "null"
            ]
          },
          "name": {
            "type": "string"
          },
          "product_type": {
            "type": [
              "string",
              "null"
            ]
          },
          "print_type": {
            "type": [
              "string",
              "null"
            ]
          },
          "available": {
            "type": "boolean"
          },
          "marketplace_eligible": {
            "type": "boolean"
          },
          "pricing": {
            "$ref": "#/components/schemas/CatalogPricing"
          },
          "material": {
            "type": [
              "string",
              "null"
            ]
          },
          "dimensions": {
            "oneOf": [
              {
                "type": "object",
                "additionalProperties": true
              },
              {
                "type": "string"
              }
            ]
          },
          "default_title": {
            "type": [
              "string",
              "null"
            ]
          },
          "default_description": {
            "type": [
              "string",
              "null"
            ],
            "description": "Canonical catalog product description."
          },
          "tags": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "cover_image_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "main_icon_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "realistic_image_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri",
            "description": "Seller mini-map style preview: stale pins at another variant scope are ignored, including on the shared-owner sellable member. Front is preferred when available; on multi-location products, a saved pin for that location wins even if the legacy single-pointer last recorded another location. Otherwise fallback prefers own, then scope-matching, then shared approved mockups, then custom mini_map_image_url, then cover/main icon."
          },
          "variants": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/CatalogVariant"
            },
            "description": "Present when include=variants. Every sellable family member: the lead (is_lead=true; same id/sku as the product) plus all child variants, sorted by variant_title."
          },
          "print_locations": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/CatalogPrintLocation"
            }
          },
          "images": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/CatalogImage"
            }
          },
          "mockups": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/CatalogMockup"
            }
          },
          "shipping": {
            "$ref": "#/components/schemas/CatalogShipping"
          },
          "variant_title": {
            "type": [
              "string",
              "null"
            ],
            "description": "The catalog product row is itself a sellable variant (the family lead); this is that variant's own title (e.g. \"Glitter Black\")."
          },
          "variant_attributes": {
            "type": "object",
            "additionalProperties": true,
            "description": "The lead variant's own attributes (e.g. {\"Color\": \"Glitter Black\"})."
          }
        },
        "required": [
          "id",
          "catalog_product_id",
          "name",
          "available",
          "marketplace_eligible",
          "pricing"
        ]
      },
      "CatalogProductListResponse": {
        "type": "object",
        "properties": {
          "items": {
            "description": "Canonical product list.",
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/CatalogProductEnriched"
            }
          },
          "products": {
            "description": "Deprecated duplicate alias of `items`. Removal no earlier than 2027-03-01; see docs/deprecations.md.",
            "deprecated": true,
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/CatalogProductEnriched"
            }
          },
          "next_cursor": {
            "description": "Deprecated duplicate alias of `pagination.next_cursor`. Removal no earlier than 2027-03-01; see docs/deprecations.md.",
            "deprecated": true,
            "type": [
              "string",
              "null"
            ]
          },
          "has_more": {
            "description": "Deprecated duplicate alias of `pagination.has_more`. Removal no earlier than 2027-03-01; see docs/deprecations.md.",
            "deprecated": true,
            "type": "boolean"
          },
          "pagination": {
            "$ref": "#/components/schemas/CursorPagination"
          }
        }
      },
      "CursorPagination": {
        "type": "object",
        "description": "Canonical pagination envelope for list endpoints.",
        "properties": {
          "limit": {
            "type": "integer"
          },
          "offset": {
            "type": "integer"
          },
          "count": {
            "type": "integer"
          },
          "next_cursor": {
            "type": [
              "string",
              "null"
            ],
            "description": "Opaque cursor for the next page; null when has_more is false."
          },
          "has_more": {
            "type": "boolean"
          }
        }
      },
      "CatalogProductDetailResponse": {
        "type": "object",
        "properties": {
          "product": {
            "$ref": "#/components/schemas/CatalogProductEnriched"
          },
          "item": {
            "description": "Deprecated duplicate alias of `product`. Removal no earlier than 2027-03-01; see docs/deprecations.md.",
            "deprecated": true,
            "allOf": [
              {
                "$ref": "#/components/schemas/CatalogProductEnriched"
              }
            ]
          }
        }
      },
      "CatalogAssetsResponse": {
        "type": "object",
        "properties": {
          "assets": {
            "type": "object",
            "properties": {
              "cover_image_url": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "uri"
              },
              "main_icon_url": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "uri"
              },
              "realistic_image_url": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "uri",
                "description": "Seller mini-map style preview: stale pins at another variant scope are ignored, including on the shared-owner sellable member. Front is preferred when available; on multi-location products, a saved pin for that location wins even if the legacy single-pointer last recorded another location. Otherwise fallback prefers own, then scope-matching, then shared approved mockups, then custom mini_map_image_url, then cover/main icon."
              },
              "images": {
                "type": "array",
                "items": {
                  "$ref": "#/components/schemas/CatalogImage"
                }
              },
              "mockups": {
                "type": "array",
                "items": {
                  "$ref": "#/components/schemas/CatalogMockup"
                }
              }
            }
          }
        }
      }
    }
  },
  "paths": {
    "/referrals/summary": {
      "get": {
        "tags": [
          "Referrals"
        ],
        "summary": "Referral commission summary for the API key owner",
        "description": "KPI rollup of the owner's referral program standing: referral code/link, program rates (basis points), referred-seller counts, and lifetime/current-month earnings in integer cents. Requires the explicitly granted referrals:read scope; legacy empty-scope and * keys are rejected with 403 missing_scope.",
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "referral_code": {
                      "type": [
                        "string",
                        "null"
                      ]
                    },
                    "referral_username": {
                      "type": [
                        "string",
                        "null"
                      ]
                    },
                    "referral_link": {
                      "type": [
                        "string",
                        "null"
                      ]
                    },
                    "tier1_bps": {
                      "type": "integer"
                    },
                    "tier2_bps": {
                      "type": "integer"
                    },
                    "tier1_count": {
                      "type": "integer"
                    },
                    "tier2_count": {
                      "type": "integer"
                    },
                    "total_earnings_cents": {
                      "type": "integer"
                    },
                    "this_month_cents": {
                      "type": "integer"
                    },
                    "tier1_earnings_cents": {
                      "type": "integer"
                    },
                    "tier2_earnings_cents": {
                      "type": "integer"
                    },
                    "sales_count": {
                      "type": "integer"
                    },
                    "referred_by_name": {
                      "type": [
                        "string",
                        "null"
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/referrals/tier1": {
      "get": {
        "tags": [
          "Referrals"
        ],
        "summary": "List directly referred sellers with commission aggregates",
        "description": "Sellers the owner referred directly (tier 1), each with sales count, lifetime commission earned in cents, and last-sale timestamp. Sellers are identified by display name and masked email only. Requires the explicitly granted referrals:read scope.",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200,
              "default": 50
            }
          },
          {
            "name": "offset",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 0,
              "default": 0
            }
          },
          {
            "name": "sort",
            "in": "query",
            "description": "Sort key, prefix with - for descending. One of joined_at, commission_earned_cents, sales_count, last_sale_at, display_name. Defaults to -joined_at.",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "rows": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/ReferralTierRow"
                      }
                    },
                    "total": {
                      "type": "integer"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/referrals/tier2": {
      "get": {
        "tags": [
          "Referrals"
        ],
        "summary": "List second-tier referred sellers with commission aggregates",
        "description": "Sellers referred by the owner's tier-1 referrals, each with sales count, lifetime tier-2 commission earned in cents, last-sale timestamp, and the display name of the tier-1 seller they came through (via_display_name). Requires the explicitly granted referrals:read scope.",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200,
              "default": 50
            }
          },
          {
            "name": "offset",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 0,
              "default": 0
            }
          },
          {
            "name": "sort",
            "in": "query",
            "description": "Sort key, prefix with - for descending. One of joined_at, commission_earned_cents, sales_count, last_sale_at, display_name. Defaults to -joined_at.",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "rows": {
                      "type": "array",
                      "items": {
                        "allOf": [
                          {
                            "$ref": "#/components/schemas/ReferralTierRow"
                          },
                          {
                            "type": "object",
                            "properties": {
                              "via_display_name": {
                                "type": [
                                  "string",
                                  "null"
                                ]
                              }
                            }
                          }
                        ]
                      }
                    },
                    "total": {
                      "type": "integer"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/referrals/payouts": {
      "get": {
        "tags": [
          "Referrals"
        ],
        "summary": "Per-sale referral payout ledger",
        "description": "One row per commission awarded to the API key owner, newest first: base fulfillment cost in cents, rate in basis points, amount in cents, tier, order number, and the referred seller's display name. Requires the explicitly granted referrals:read scope.",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200,
              "default": 50
            }
          },
          {
            "name": "offset",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 0,
              "default": 0
            }
          },
          {
            "name": "tier",
            "in": "query",
            "schema": {
              "type": "integer",
              "enum": [
                1,
                2
              ]
            }
          },
          {
            "name": "from",
            "in": "query",
            "description": "Inclusive ISO 8601 lower bound on created_at.",
            "schema": {
              "type": "string",
              "format": "date-time"
            }
          },
          {
            "name": "to",
            "in": "query",
            "description": "Inclusive ISO 8601 upper bound on created_at.",
            "schema": {
              "type": "string",
              "format": "date-time"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "rows": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": {
                            "type": "string",
                            "format": "uuid"
                          },
                          "created_at": {
                            "type": [
                              "string",
                              "null"
                            ],
                            "format": "date-time"
                          },
                          "order_number": {
                            "type": [
                              "string",
                              "null"
                            ]
                          },
                          "seller_display_name": {
                            "type": [
                              "string",
                              "null"
                            ]
                          },
                          "tier": {
                            "type": "integer"
                          },
                          "base_fulfillment_cents": {
                            "type": "integer"
                          },
                          "rate_bps": {
                            "type": "integer"
                          },
                          "amount_cents": {
                            "type": "integer"
                          }
                        }
                      }
                    },
                    "total": {
                      "type": "integer"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/shops": {
      "get": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "List shops the API key has access to",
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      },
      "post": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Register a new sub-shop (multi-shop integrators only)",
        "parameters": [
          {
            "$ref": "#/components/parameters/IdempotencyKey"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {              "schema": {
                "type": "object",
                "properties": {
                  "name": {
                    "type": "string"
                  },
                  "display_name": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "domain": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "marketplace": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "default": "CUSTOM"
                  },
                  "currency": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "default": "USD"
                  }
                },
                "required": [
                  "name"
                ]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Created"
          }
        }
      }
    },
    "/shops/{shopId}": {
      "get": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Get a shop",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/shops/{shopId}/connection": {
      "delete": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Disconnect a sub-shop (cannot disconnect the partner primary)",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          },
          "400": {
            "description": "Cannot disconnect primary"
          }
        }
      }
    },
    "/catalog/products": {
      "get": {
        "tags": [
          "Catalog"
        ],
        "summary": "List catalog products",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50,
              "maximum": 200
            }
          },
          {
            "name": "offset",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 0
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "search",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "marketplace_eligible",
            "in": "query",
            "required": false,
            "schema": {
              "type": "boolean"
            }
          },
          {
            "name": "include",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "example": "variants,print_locations,images,mockups,shipping"
            },
            "description": "Comma-separated related resources to embed (variants, print_locations, images, mockups, shipping). Use all for every supported relation. variants returns every sellable family member: the lead (is_lead=true) plus all child variants."
          }
        ],
        "responses": {
          "200": {
            "description": "Catalog products.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CatalogProductListResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid API key.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "500": {
            "description": "Server error.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/catalog/products/semantic": {
      "get": {
        "tags": [
          "Catalog"
        ],
        "summary": "Semantic catalog search",
        "description": "Hybrid catalog search over the public product base: Voyage embeddings for semantic recall, fused with lexical and taxonomy matches via Reciprocal Rank Fusion, then an optional Voyage rerank pass. Returns the same product payload as GET /v1/catalog/products, ordered by relevance, with a per-item `relevance` block and top-level search diagnostics. Falls back to lexical/taxonomy ranking when Voyage is not configured.",
        "parameters": [
          {
            "name": "q",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "maxLength": 200,
              "example": "cozy gift for dog lovers"
            },
            "description": "Natural-language search query. Aliases: `query`, `search`."
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 12,
              "maximum": 50
            }
          },
          {
            "name": "include",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "example": "variants,print_locations,images,mockups,shipping"
            },
            "description": "Comma-separated related resources to embed (variants, print_locations, images, mockups, shipping). Use all for every supported relation. variants returns every sellable family member: the lead (is_lead=true) plus all child variants."
          }
        ],
        "responses": {
          "200": {
            "description": "Ranked catalog products with relevance diagnostics.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "items": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "description": "A catalog product (see GET /v1/catalog/products) plus a `relevance` block.",
                        "additionalProperties": true,
                        "properties": {
                          "relevance": {
                            "type": "object",
                            "nullable": true,
                            "properties": {
                              "match_score": {
                                "type": "number"
                              },
                              "rrf_score": {
                                "type": "number"
                              },
                              "lexical_score": {
                                "type": "number"
                              },
                              "semantic_distance": {
                                "type": "number",
                                "nullable": true
                              },
                              "rerank_score": {
                                "type": "number",
                                "nullable": true
                              }
                            }
                          }
                        }
                      }
                    },
                    "products": {
                      "description": "Deprecated duplicate alias of `items`. Removal no earlier than 2027-03-01; see docs/deprecations.md.",
                      "deprecated": true,
                      "type": "array",
                      "items": {
                        "type": "object",
                        "additionalProperties": true
                      }
                    },
                    "query": {
                      "type": "string"
                    },
                    "count": {
                      "type": "integer"
                    },
                    "confidence": {
                      "type": "string",
                      "enum": [
                        "high",
                        "medium",
                        "low"
                      ]
                    },
                    "used_semantic": {
                      "type": "boolean"
                    },
                    "semantic_model": {
                      "type": "string",
                      "nullable": true
                    },
                    "used_rerank": {
                      "type": "boolean"
                    },
                    "rerank_model": {
                      "type": "string",
                      "nullable": true
                    },
                    "matched_categories": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    },
                    "matched_groups": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Missing query.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid API key.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "500": {
            "description": "Server error.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/catalog/products/{productId}": {
      "get": {
        "tags": [
          "Catalog"
        ],
        "summary": "Fetch enriched catalog product",
        "parameters": [
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "include",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "example": "variants,print_locations,images,mockups,shipping"
            },
            "description": "Comma-separated related resources to embed (variants, print_locations, images, mockups, shipping). Use all for every supported relation. variants returns every sellable family member: the lead (is_lead=true) plus all child variants."
          }
        ],
        "responses": {
          "200": {
            "description": "Catalog product.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CatalogProductDetailResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid product id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid API key.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "Product not found.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "500": {
            "description": "Server error.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/catalog/products/{productId}/variants": {
      "get": {
        "tags": [
          "Catalog"
        ],
        "summary": "List catalog product variants",
        "parameters": [
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/catalog/products/{productId}/print-locations": {
      "get": {
        "tags": [
          "Catalog"
        ],
        "summary": "List enabled print locations for a catalog product",
        "parameters": [
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/catalog/products/{productId}/mockups": {
      "get": {
        "tags": [
          "Catalog"
        ],
        "summary": "List mockups",
        "parameters": [
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "print_location_id",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/catalog/products/{productId}/shipping": {
      "get": {
        "tags": [
          "Catalog"
        ],
        "summary": "Catalog shipping cost columns",
        "parameters": [
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/addresses/validate": {
      "post": {
        "tags": [
          "Validation"
        ],
        "summary": "Validate and normalize an address",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "description": "Accepts either { address: { ... } } or the raw address object."
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Validated"
          }
        }
      }
    },
    "/print-files/validate": {
      "post": {
        "tags": [
          "Validation"
        ],
        "summary": "Validate a print file URL against print-location requirements",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "art_url": {
                    "type": "string",
                    "format": "uri"
                  },
                  "print_location_id": {
                    "type": "string",
                    "format": "uuid"
                  },
                  "catalog_product_id": {
                    "type": "string",
                    "format": "uuid"
                  }
                },
                "required": [
                  "art_url"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Validated"
          }
        }
      }
    },
    "/designs": {
      "get": {
        "tags": [
          "Designs"
        ],
        "operationId": "listDesigns",
        "summary": "List designs",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50,
              "maximum": 200
            }
          },
          {
            "name": "offset",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 0
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "description": "Opaque cursor from pagination.next_cursor; takes precedence over offset.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "search",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "shop_id",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "external_user_id",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "collection",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "designs": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/Design"
                      }
                    },
                    "pagination": {
                      "$ref": "#/components/schemas/CursorPagination"
                    }
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "Designs"
        ],
        "operationId": "createDesign",        "summary": "Create a design (design_template)",
        "parameters": [
          {
            "$ref": "#/components/parameters/IdempotencyKey"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": {
                    "type": "string"
                  },
                  "canvas_json": {
                    "type": "object"
                  },
                  "artfile_url": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "description": "Public artwork URL. If provided without canvas_json, the API wraps it in a design document automatically. Must resolve to a public http(s) host; localhost and private-network destinations are rejected."
                  },
                  "image_url": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "description": "Alias for artfile_url. Must resolve to a public http(s) host."
                  },
                  "url": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "description": "Alias for artfile_url. Must resolve to a public http(s) host."
                  },
                  "width": {
                    "type": [
                      "number",
                      "null"
                    ],
                    "exclusiveMinimum": 0
                  },
                  "height": {
                    "type": [
                      "number",
                      "null"
                    ],
                    "exclusiveMinimum": 0
                  },
                  "thumbnail_url": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "tags": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  },
                  "personalization_enabled": {
                    "type": "boolean"
                  },
                  "personalization_fields": {
                    "type": "array",
                    "description": "Opaque shared design-field definitions. Etsy-originated store products may include richer multi-question metadata such as question_type, options, and add_on_price.",
                    "items": {
                      "type": "object"
                    }
                  },
                  "shop_id": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "format": "uuid"
                  },
                  "external_user_id": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "collection": {
                    "type": [
                      "string",
                      "null"
                    ]
                  }
                },
                "required": [
                  "name"
                ]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "design": {
                      "$ref": "#/components/schemas/Design"
                    },
                    "dry_run": {
                      "$ref": "#/components/schemas/DryRunDetails"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/designs/exports/{exportId}": {
      "get": {
        "tags": [
          "Designs"
        ],
        "operationId": "getDesignExport",
        "summary": "Get a design export job/result",
        "parameters": [
          {
            "name": "exportId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "export": {
                      "$ref": "#/components/schemas/DesignExport"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/designs/{designId}/exports": {
      "post": {
        "tags": [
          "Designs"
        ],
        "operationId": "createDesignExport",
        "summary": "Create a design export",
        "parameters": [
          {
            "name": "designId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "$ref": "#/components/parameters/IdempotencyKey"
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "format": {
                    "type": "string",
                    "enum": [
                      "json",
                      "png",
                      "jpeg",
                      "svg"
                    ],
                    "default": "json"
                  },
                  "max_size": {
                    "type": "integer",
                    "minimum": 128,
                    "maximum": 4096,
                    "default": 1600
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "export": {
                      "$ref": "#/components/schemas/DesignExport"
                    },
                    "dry_run": {
                      "$ref": "#/components/schemas/DryRunDetails"
                    }
                  }
                }
              }
            }
          },
          "202": {
            "description": "Accepted (export row created but finished with a non-succeeded status)"
          }
        }
      }
    },
    "/designs/{designId}": {
      "get": {
        "tags": [
          "Designs"
        ],
        "operationId": "getDesign",
        "summary": "Get a design",
        "parameters": [
          {
            "name": "designId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "design": {
                      "$ref": "#/components/schemas/Design"
                    }
                  }
                }
              }
            }
          }
        }
      },
      "patch": {
        "tags": [
          "Designs"
        ],
        "operationId": "updateDesign",
        "summary": "Patch a design",
        "parameters": [
          {
            "name": "designId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      },
      "delete": {
        "tags": [
          "Designs"
        ],
        "operationId": "deleteDesign",
        "summary": "Delete a design",
        "parameters": [
          {
            "name": "designId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/assets": {
      "post": {
        "tags": [
          "Assets"
        ],
        "operationId": "createAsset",
        "summary": "Upload an asset from inline bytes",
        "parameters": [
          {
            "$ref": "#/components/parameters/IdempotencyKey"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "filename": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "content_type": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "content_base64": {
                    "type": "string"
                  }
                },
                "required": [
                  "content_base64"
                ]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "asset": {
                      "$ref": "#/components/schemas/Asset"
                    },
                    "dry_run": {
                      "$ref": "#/components/schemas/DryRunDetails"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/assets/from-url": {
      "post": {
        "tags": [
          "Assets"
        ],
        "operationId": "createAssetFromUrl",
        "summary": "Import an asset from a public URL",
        "parameters": [
          {
            "$ref": "#/components/parameters/IdempotencyKey"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "url": {
                    "type": "string",
                    "format": "uri"
                  },
                  "filename": {
                    "type": [
                      "string",
                      "null"
                    ]
                  }
                },
                "required": [
                  "url"
                ]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "asset": {
                      "$ref": "#/components/schemas/Asset"
                    },
                    "dry_run": {
                      "$ref": "#/components/schemas/DryRunDetails"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/assets/{assetId}": {
      "get": {
        "tags": [
          "Assets"
        ],
        "operationId": "getAsset",
        "summary": "Get an uploaded asset",
        "parameters": [
          {
            "name": "assetId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "asset": {
                      "$ref": "#/components/schemas/Asset"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/shops/{shopId}/products": {
      "get": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "List products in a specific shop",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50,
              "maximum": 200
            }
          },
          {
            "name": "offset",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 0
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "description": "Opaque cursor from pagination.next_cursor; takes precedence over offset.",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "products": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "description": "Shop product (store_products row plus design options and marketplace listings)."
                      }
                    },
                    "pagination": {
                      "$ref": "#/components/schemas/CursorPagination"
                    }
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Create a shop product (store_products)",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "$ref": "#/components/parameters/IdempotencyKey"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "catalog_product_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The base catalog product id."
                  },
                  "title": {
                    "type": "string"
                  },
                  "description": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "retail_price": {
                    "type": "number",
                    "minimum": 0
                  },
                  "compare_at_price": {
                    "type": [
                      "number",
                      "null"
                    ]
                  },
                  "sku": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "design_id": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "format": "uuid"
                  },
                  "preview_url": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "artfile_url": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "description": "Public URL for the base artwork. If provided, the API creates a design from it and links that design to the product. Must resolve to a public http(s) host."
                  },
                  "print_files": {
                    "type": [
                      "array",
                      "null"
                    ],
                    "minItems": 1,
                    "description": "One artwork URL per print location for a multi-location base design (e.g. front + back). Mutually exclusive with design_id and other inline design sources. Each print_location_id must belong to the catalog product, be enabled, and appear at most once; missing width/height default to the location's file dimensions.",
                    "items": {
                      "type": "object",
                      "required": [
                        "print_location_id",
                        "url"
                      ],
                      "properties": {
                        "print_location_id": {
                          "type": "string",
                          "format": "uuid",
                          "description": "Print location id from GET /v1/catalog/products/{productId}/print-locations."
                        },
                        "url": {
                          "type": "string",
                          "format": "uri",
                          "description": "Public artwork URL for this print location. Must resolve to a public http(s) host; localhost and private-network destinations are rejected."
                        },
                        "width": {
                          "type": [
                            "number",
                            "null"
                          ],
                          "description": "Artwork pixel width; defaults to the print location's file width."
                        },
                        "height": {
                          "type": [
                            "number",
                            "null"
                          ],
                          "description": "Artwork pixel height; defaults to the print location's file height."
                        }
                      }
                    }
                  },
                  "design": {
                    "type": "object",
                    "description": "Inline design payload. Supports canvas_json, artfile_url/image_url/url, or print_files (one artwork URL per print location). Width/height must be positive numbers when supplied."
                  },
                  "design_options": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "design_template_id": {
                          "type": "string",
                          "format": "uuid"
                        },
                        "label": {
                          "type": "string"
                        },
                        "artfile_url": {
                          "type": [
                            "string",
                            "null"
                          ],
                          "description": "Public artwork URL for this design option."
                        },
                        "print_files": {
                          "type": [
                            "array",
                            "null"
                          ],
                          "minItems": 1,
                          "description": "One artwork URL per print location for a multi-location design option. Same shape and validation as the top-level print_files field.",
                          "items": {
                            "type": "object",
                            "required": [
                              "print_location_id",
                              "url"
                            ],
                            "properties": {
                              "print_location_id": {
                                "type": "string",
                                "format": "uuid"
                              },
                              "url": {
                                "type": "string",
                                "format": "uri"
                              },
                              "width": {                                "type": [
                                  "number",
                                  "null"
                                ]
                              },
                              "height": {
                                "type": [
                                  "number",
                                  "null"
                                ]
                              }
                            }
                          }
                        },
                        "design": {
                          "type": "object"
                        },
                        "preview_url": {
                          "type": [
                            "string",
                            "null"
                          ]
                        },
                        "sort_index": {
                          "type": "integer"
                        }
                      },
                      "required": []
                    }
                  },
                  "variants": {
                    "$ref": "#/components/schemas/ProductVariantSelection"
                  },
                  "publish_to": {
                    "type": "array",
                    "uniqueItems": true,
                    "description": "Supported auto-publish targets. TikTok is rejected synchronously with HTTP 422 and code unsupported_publish_target before writes.",
                    "items": {
                      "type": "string",
                      "enum": [
                        "shopify",
                        "etsy"
                      ]
                    }
                  },
                  "publish_overrides": {
                    "type": "object",
                    "description": "Marketplace-specific publish settings. The shop must report ready=true for each requested target.",
                    "additionalProperties": true
                  },
                  "tags": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  },
                  "images": {
                    "type": "array",
                    "items": {
                      "type": "object"
                    }
                  },
                  "personalization_enabled": {
                    "type": "boolean"
                  }
                },
                "required": [
                  "catalog_product_id"
                ]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Created"
          },
          "422": {
            "description": "Unsupported publish target (including TikTok); rejected synchronously before product or publish-queue writes.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                },
                "example": {
                  "error": "TikTok publishing is not supported",
                  "code": "unsupported_publish_target",
                  "request_id": "req_01JABCDEF123456789",
                  "path": "/v1/shops/{shopId}/products",
                  "field": "publish_to",
                  "allowed_values": [
                    "shopify",
                    "etsy"
                  ],
                  "remediation": "Use one of the allowed values and retry."
                }
              }
            }
          }
        }
      }
    },
    "/shops/{shopId}/products/{productId}": {
      "get": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Get a shop product",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      },
      "patch": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Partial update of a shop product",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      },
      "delete": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Delete a shop product",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/shops/{shopId}/products/{productId}/publish": {
      "post": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Start publish (emits product:publish:started)",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/shops/{shopId}/products/{productId}/publishing_succeeded": {
      "post": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Acknowledge publish success",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/shops/{shopId}/products/{productId}/publishing_failed": {
      "post": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Acknowledge publish failure",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/shops/{shopId}/products/{productId}/unpublish": {
      "post": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Unpublish a product",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/shops/{shopId}/orders": {
      "get": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "List orders",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "orders": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/Order"
                      }
                    },
                    "pagination": {
                      "$ref": "#/components/schemas/CursorPagination"
                    },
                    "next_cursor": {
                      "description": "Deprecated duplicate alias of `pagination.next_cursor`. Removal no earlier than 2027-03-01; see docs/deprecations.md.",
                      "deprecated": true,
                      "type": [
                        "string",
                        "null"
                      ]
                    },
                    "has_more": {
                      "description": "Deprecated duplicate alias of `pagination.has_more`. Removal no earlier than 2027-03-01; see docs/deprecations.md.",
                      "deprecated": true,
                      "type": "boolean"
                    }
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Create an order (idempotent via Idempotency-Key OR external_order_id)",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "$ref": "#/components/parameters/IdempotencyKey"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/OrderCreateRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Replay (existing order returned)"
          },
          "201": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "order": {
                      "$ref": "#/components/schemas/Order"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/shops/{shopId}/orders/{orderId}": {
      "get": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Get an order",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/shops/{shopId}/orders/{orderId}/cancel": {
      "post": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Cancel order",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/shops/{shopId}/webhooks": {
      "get": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "List webhook subscriptions",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      },
      "post": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Register a webhook subscription (one row per topic)",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "$ref": "#/components/parameters/IdempotencyKey"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "url": {
                    "type": "string",
                    "format": "uri",
                    "description": "Destination for signed webhook deliveries. Must be https:// by default and must resolve to a public destination. Set ALLOW_INSECURE_WEBHOOK_URLS=true only for local/dev testing."
                  },
                  "topic": {
                    "type": "string",
                    "enum": [
                      "order:created",
                      "order:updated",
                      "order:sent-to-production",
                      "order:cancelled",
                      "order:refunded",
                      "order:shipment:created",
                      "catalog:product:created",
                      "catalog:product:updated",
                      "catalog:product:price_changed",
                      "catalog:product:availability_changed",
                      "product:created",
                      "product:updated",
                      "product:deleted",
                      "product:publish:started",
                      "product:publish:succeeded",
                      "product:publish:failed",
                      "shop:disconnected",
                      "ping"
                    ]
                  },
                  "secret": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "description": "If omitted, server generates one"
                  }
                },
                "required": [
                  "url",
                  "topic"
                ]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Created (secret returned once)"
          }
        }
      }
    },
    "/shops/{shopId}/webhooks/{webhookId}": {
      "get": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Get a webhook",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "webhookId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      },
      "patch": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Update a webhook (url / status)",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "webhookId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      },
      "delete": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Delete a webhook",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "webhookId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/shops/{shopId}/webhooks/{webhookId}/test": {
      "post": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "Enqueue a synthetic ping delivery",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "webhookId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/shops/{shopId}/webhooks/{webhookId}/deliveries": {
      "get": {
        "tags": [
          "Shops (multi-shop)"
        ],
        "summary": "List recent delivery attempts",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "webhookId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    },
    "/mockups/renders": {
      "post": {
        "tags": [
          "Mockups"
        ],
        "summary": "Render a catalog mockup",
        "description": "Renders an approved product mockup with a public artwork URL. Artwork is clipped to the print location's shape by default (disable with output.clip_to_print_area=false). Returns 200 when cached or fast, otherwise 202 with a render_id to poll.",
        "parameters": [
          {
            "$ref": "#/components/parameters/IdempotencyKey"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/MockupRenderRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Render succeeded or terminal cached result.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/MockupRenderResponse"
                }
              }
            }
          },
          "202": {
            "description": "Render queued or running. Poll the status endpoint.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/MockupRenderResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request.",
            "content": {
              "application/json": {                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid API key.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "Mockup not found.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "422": {
            "description": "Artwork URL or mockup cannot be rendered.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "500": {
            "description": "Server error.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/mockups/renders/{renderId}": {
      "get": {
        "tags": [
          "Mockups"
        ],
        "summary": "Fetch mockup render status",
        "parameters": [
          {
            "name": "renderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Current render status.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/MockupRenderResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid render id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid API key.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "Render not found.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "500": {
            "description": "Server error.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/catalog/products/by-sku/{sku}": {
      "get": {
        "tags": [
          "Catalog"
        ],
        "summary": "Fetch catalog product by SKU",
        "parameters": [
          {
            "name": "sku",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "include",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "example": "variants,print_locations,images,mockups,shipping"
            },
            "description": "Comma-separated related resources to embed (variants, print_locations, images, mockups, shipping). Use all for every supported relation. variants returns every sellable family member: the lead (is_lead=true) plus all child variants."
          }
        ],
        "responses": {
          "200": {
            "description": "Catalog product.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CatalogProductDetailResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid SKU.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid API key.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "Product not found.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "500": {
            "description": "Server error.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/catalog/products/{productId}/assets": {
      "get": {
        "tags": [
          "Catalog"
        ],
        "summary": "Fetch catalog product assets",
        "parameters": [
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Catalog product assets.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CatalogAssetsResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid product id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid API key.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "Product not found.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "500": {
            "description": "Server error.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/shops/{shopId}/orders/quote": {
      "post": {
        "tags": [
          "Orders"
        ],
        "operationId": "quoteOrder",
        "summary": "Quote an order without persisting it",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/OrderCreateRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Quote response",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OrderQuoteResponse"
                }
              }
            }
          }
        }
      }
    },
    "/shops/{shopId}/orders/lookup/{externalOrderId}": {
      "get": {
        "tags": [
          "Orders"
        ],
        "operationId": "lookupOrderByExternalId",
        "summary": "Find an order by external_order_id",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "externalOrderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "order": {
                      "$ref": "#/components/schemas/Order"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/shops/{shopId}/webhooks/{webhookId}/rotate-secret": {
      "post": {
        "tags": [
          "Webhooks"
        ],
        "operationId": "rotateWebhookSecret",
        "summary": "Rotate a webhook signing secret",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "webhookId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "$ref": "#/components/parameters/IdempotencyKey"
          }
        ],
        "responses": {
          "200": {
            "description": "Rotated (secret returned once)"
          }
        }
      }
    },
    "/shops/{shopId}/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver": {
      "post": {
        "tags": [
          "Webhooks"
        ],
        "operationId": "redeliverWebhookDelivery",
        "summary": "Create a redelivery attempt from a prior delivery row",
        "parameters": [
          {
            "$ref": "#/components/parameters/shopId"
          },
          {
            "name": "webhookId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "deliveryId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "202": {
            "description": "Accepted",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "delivery": {
                      "$ref": "#/components/schemas/WebhookDelivery"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```