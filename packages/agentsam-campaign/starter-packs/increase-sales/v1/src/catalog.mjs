export const catalogMeta = {
  "schema": "agentsam.growth.campaign-starter-library.v1",
  "version": "1.0.0",
  "family": "increase_sales",
  "objective_key": "increase_sales",
  "count": 14,
  "contains_demo_data": false,
  "requires_tenant_bindings_for_publish": true
};
export const starterCampaigns = [
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "product-launch",
    "slug": "product-launch",
    "name": "Product launch",
    "summary": "Introduce something worth discovering",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 1,
    "eyebrow": "Launch collection",
    "headline": "Meet your next favorite",
    "body": "Fresh arrivals, thoughtfully made and ready to explore.",
    "cta_label": "Explore the launch",
    "subtitle": "Product launch",
    "segment_hint": "catalog",
    "visual_key": "new",
    "destination_label": "Product detail page",
    "channel_defaults": [
      "homepage_banner",
      "email",
      "product_pages",
      "social"
    ],
    "setup_groups": [
      "products",
      "start_date",
      "creative"
    ],
    "workflow_kind": "launch",
    "fields": [
      {
        "key": "product_refs",
        "label": "Products / variants",
        "type": "catalog",
        "required": true,
        "help": "Use site-scoped Commerce IDs"
      },
      {
        "key": "inventory_rule",
        "label": "Inventory policy",
        "type": "select",
        "required": true,
        "help": "Verify stock before activating"
      },
      {
        "key": "starts_at",
        "label": "Starts at",
        "type": "datetime",
        "required": true,
        "help": ""
      },
      {
        "key": "ends_at",
        "label": "Ends at",
        "type": "datetime",
        "required": true,
        "help": ""
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "publishable_products",
      "approved_claims",
      "valid_destination"
    ],
    "assets": {
      "website": {
        "eyebrow": "Launch collection",
        "headline": "Meet your next favorite",
        "body": "Fresh arrivals, thoughtfully made and ready to explore.",
        "cta_label": "Explore the launch",
        "destination_kind": "Product detail page"
      },
      "email": {
        "subject": "Meet your next favorite",
        "preheader": "Introduce something worth discovering",
        "heading": "Meet your next favorite",
        "body": "Fresh arrivals, thoughtfully made and ready to explore.",
        "cta_label": "Explore the launch",
        "requires_consent": true
      },
      "social": {
        "caption": "Meet your next favorite. Fresh arrivals, thoughtfully made and ready to explore.",
        "cta_label": "Explore the launch",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Launch collection",
        "title": "Meet your next favorite",
        "description": "Fresh arrivals, thoughtfully made and ready to explore.",
        "cta_label": "Explore the launch"
      },
      "sms": {
        "text": "Meet your next favorite. Explore the launch.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "Meet your next favorite",
        "description": "Fresh arrivals, thoughtfully made and ready to explore.",
        "cta_label": "Explore the launch",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "collection-promotion",
    "slug": "collection-promotion",
    "name": "Collection promotion",
    "summary": "Give an entire collection the spotlight",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 2,
    "eyebrow": "The collection edit",
    "headline": "A collection with something for everyone",
    "body": "Discover a curated selection brought together for this moment.",
    "cta_label": "Shop the collection",
    "subtitle": "Collection promotion",
    "segment_hint": "collection",
    "visual_key": "featured",
    "destination_label": "Collection page",
    "channel_defaults": [
      "homepage_banner",
      "email",
      "product_pages",
      "social"
    ],
    "setup_groups": [
      "collection",
      "creative"
    ],
    "workflow_kind": "collection",
    "fields": [
      {
        "key": "collection_refs",
        "label": "Collections",
        "type": "collection",
        "required": true,
        "help": "Use cms_collections; resolve cms_collection_items"
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "publishable_collection",
      "valid_destination"
    ],
    "assets": {
      "website": {
        "eyebrow": "The collection edit",
        "headline": "A collection with something for everyone",
        "body": "Discover a curated selection brought together for this moment.",
        "cta_label": "Shop the collection",
        "destination_kind": "Collection page"
      },
      "email": {
        "subject": "A collection with something for everyone",
        "preheader": "Give an entire collection the spotlight",
        "heading": "A collection with something for everyone",
        "body": "Discover a curated selection brought together for this moment.",
        "cta_label": "Shop the collection",
        "requires_consent": true
      },
      "social": {
        "caption": "A collection with something for everyone. Discover a curated selection brought together for this moment.",
        "cta_label": "Shop the collection",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "The collection edit",
        "title": "A collection with something for everyone",
        "description": "Discover a curated selection brought together for this moment.",
        "cta_label": "Shop the collection"
      },
      "sms": {
        "text": "A collection with something for everyone. Shop the collection.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "A collection with something for everyone",
        "description": "Discover a curated selection brought together for this moment.",
        "cta_label": "Shop the collection",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "flash-sale",
    "slug": "flash-sale",
    "name": "Flash sale",
    "summary": "A short window, a clear offer",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 3,
    "eyebrow": "Limited-time offer",
    "headline": "A little less. For a little while.",
    "body": "Selected products, available at a special price during this offer.",
    "cta_label": "Shop the offer",
    "subtitle": "Flash sale",
    "segment_hint": "discount",
    "visual_key": "limited",
    "destination_label": "Eligible product or collection page",
    "channel_defaults": [
      "homepage_banner",
      "email",
      "social",
      "subscriber_offer"
    ],
    "setup_groups": [
      "product",
      "discount",
      "date",
      "creative"
    ],
    "workflow_kind": "countdown",
    "fields": [
      {
        "key": "product_refs",
        "label": "Products / variants",
        "type": "catalog",
        "required": true,
        "help": "Use site-scoped Commerce IDs"
      },
      {
        "key": "inventory_rule",
        "label": "Inventory policy",
        "type": "select",
        "required": true,
        "help": "Verify stock before activating"
      },
      {
        "key": "discount_ref",
        "label": "Discount / promotion",
        "type": "discount",
        "required": true,
        "help": "Reference the existing Commerce promotion contract"
      },
      {
        "key": "starts_at",
        "label": "Starts at",
        "type": "datetime",
        "required": true,
        "help": ""
      },
      {
        "key": "ends_at",
        "label": "Ends at",
        "type": "datetime",
        "required": true,
        "help": ""
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "offer_valid",
      "start_before_end",
      "inventory_checked"
    ],
    "assets": {
      "website": {
        "eyebrow": "Limited-time offer",
        "headline": "A little less. For a little while.",
        "body": "Selected products, available at a special price during this offer.",
        "cta_label": "Shop the offer",
        "destination_kind": "Eligible product or collection page"
      },
      "email": {
        "subject": "A little less. For a little while.",
        "preheader": "A short window, a clear offer",
        "heading": "A little less. For a little while.",
        "body": "Selected products, available at a special price during this offer.",
        "cta_label": "Shop the offer",
        "requires_consent": true
      },
      "social": {
        "caption": "A little less. For a little while.. Selected products, available at a special price during this offer.",
        "cta_label": "Shop the offer",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Limited-time offer",
        "title": "A little less. For a little while.",
        "description": "Selected products, available at a special price during this offer.",
        "cta_label": "Shop the offer"
      },
      "sms": {
        "text": "A little less. For a little while.. Shop the offer.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "A little less. For a little while.",
        "description": "Selected products, available at a special price during this offer.",
        "cta_label": "Shop the offer",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "seasonal-sale",
    "slug": "seasonal-sale",
    "name": "Seasonal sale",
    "summary": "A timely promotion with a defined season",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 4,
    "eyebrow": "The seasonal edit",
    "headline": "Make room for something new",
    "body": "Shop selected favorites this season, with offers worth exploring.",
    "cta_label": "Explore seasonal picks",
    "subtitle": "Seasonal sale",
    "segment_hint": "seasonal",
    "visual_key": "seasonal",
    "destination_label": "Seasonal collection",
    "channel_defaults": [
      "homepage_banner",
      "email",
      "social",
      "product_pages"
    ],
    "setup_groups": [
      "collection",
      "discount",
      "date",
      "creative"
    ],
    "workflow_kind": "calendar",
    "fields": [
      {
        "key": "collection_refs",
        "label": "Collections",
        "type": "collection",
        "required": true,
        "help": "Use cms_collections; resolve cms_collection_items"
      },
      {
        "key": "discount_ref",
        "label": "Discount / promotion",
        "type": "discount",
        "required": true,
        "help": "Reference the existing Commerce promotion contract"
      },
      {
        "key": "starts_at",
        "label": "Starts at",
        "type": "datetime",
        "required": true,
        "help": ""
      },
      {
        "key": "ends_at",
        "label": "Ends at",
        "type": "datetime",
        "required": true,
        "help": ""
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "offer_valid",
      "start_before_end"
    ],
    "assets": {
      "website": {
        "eyebrow": "The seasonal edit",
        "headline": "Make room for something new",
        "body": "Shop selected favorites this season, with offers worth exploring.",
        "cta_label": "Explore seasonal picks",
        "destination_kind": "Seasonal collection"
      },
      "email": {
        "subject": "Make room for something new",
        "preheader": "A timely promotion with a defined season",
        "heading": "Make room for something new",
        "body": "Shop selected favorites this season, with offers worth exploring.",
        "cta_label": "Explore seasonal picks",
        "requires_consent": true
      },
      "social": {
        "caption": "Make room for something new. Shop selected favorites this season, with offers worth exploring.",
        "cta_label": "Explore seasonal picks",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "The seasonal edit",
        "title": "Make room for something new",
        "description": "Shop selected favorites this season, with offers worth exploring.",
        "cta_label": "Explore seasonal picks"
      },
      "sms": {
        "text": "Make room for something new. Explore seasonal picks.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "Make room for something new",
        "description": "Shop selected favorites this season, with offers worth exploring.",
        "cta_label": "Explore seasonal picks",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "bundle-offer",
    "slug": "bundle-offer",
    "name": "Bundle offer",
    "summary": "Sell complementary products together",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 5,
    "eyebrow": "Better together",
    "headline": "Made to go together",
    "body": "Discover a thoughtfully paired selection and explore the complete bundle.",
    "cta_label": "View the bundle",
    "subtitle": "Bundle offer",
    "segment_hint": "bundle",
    "visual_key": "bundle",
    "destination_label": "Bundle product / collection",
    "channel_defaults": [
      "homepage_banner",
      "email",
      "product_pages",
      "social"
    ],
    "setup_groups": [
      "product",
      "discount",
      "creative"
    ],
    "workflow_kind": "bundle",
    "fields": [
      {
        "key": "product_refs",
        "label": "Products / variants",
        "type": "catalog",
        "required": true,
        "help": "Use site-scoped Commerce IDs"
      },
      {
        "key": "inventory_rule",
        "label": "Inventory policy",
        "type": "select",
        "required": true,
        "help": "Verify stock before activating"
      },
      {
        "key": "discount_ref",
        "label": "Discount / promotion",
        "type": "discount",
        "required": true,
        "help": "Reference the existing Commerce promotion contract"
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "bundle_eligibility",
      "bundle_price_authoritative"
    ],
    "assets": {
      "website": {
        "eyebrow": "Better together",
        "headline": "Made to go together",
        "body": "Discover a thoughtfully paired selection and explore the complete bundle.",
        "cta_label": "View the bundle",
        "destination_kind": "Bundle product / collection"
      },
      "email": {
        "subject": "Made to go together",
        "preheader": "Sell complementary products together",
        "heading": "Made to go together",
        "body": "Discover a thoughtfully paired selection and explore the complete bundle.",
        "cta_label": "View the bundle",
        "requires_consent": true
      },
      "social": {
        "caption": "Made to go together. Discover a thoughtfully paired selection and explore the complete bundle.",
        "cta_label": "View the bundle",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Better together",
        "title": "Made to go together",
        "description": "Discover a thoughtfully paired selection and explore the complete bundle.",
        "cta_label": "View the bundle"
      },
      "sms": {
        "text": "Made to go together. View the bundle.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "Made to go together",
        "description": "Discover a thoughtfully paired selection and explore the complete bundle.",
        "cta_label": "View the bundle",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "back-in-stock",
    "slug": "back-in-stock",
    "name": "Back in stock",
    "summary": "Turn replenished inventory into demand",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 6,
    "eyebrow": "Back by request",
    "headline": "The wait is over",
    "body": "Your requested favorite is available again, subject to live inventory.",
    "cta_label": "See availability",
    "subtitle": "Back in stock",
    "segment_hint": "inventory",
    "visual_key": "return",
    "destination_label": "Product or variant detail",
    "channel_defaults": [
      "email",
      "product_pages",
      "social"
    ],
    "setup_groups": [
      "product",
      "audience",
      "creative"
    ],
    "workflow_kind": "stock",
    "fields": [
      {
        "key": "product_refs",
        "label": "Products / variants",
        "type": "catalog",
        "required": true,
        "help": "Use site-scoped Commerce IDs"
      },
      {
        "key": "inventory_rule",
        "label": "Inventory policy",
        "type": "select",
        "required": true,
        "help": "Verify stock before activating"
      },
      {
        "key": "audience_segment_ref",
        "label": "Audience",
        "type": "segment",
        "required": true,
        "help": "Verify consent for outbound channels"
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "live_inventory_positive",
      "stock_trigger_verified"
    ],
    "assets": {
      "website": {
        "eyebrow": "Back by request",
        "headline": "The wait is over",
        "body": "Your requested favorite is available again, subject to live inventory.",
        "cta_label": "See availability",
        "destination_kind": "Product or variant detail"
      },
      "email": {
        "subject": "The wait is over",
        "preheader": "Turn replenished inventory into demand",
        "heading": "The wait is over",
        "body": "Your requested favorite is available again, subject to live inventory.",
        "cta_label": "See availability",
        "requires_consent": true
      },
      "social": {
        "caption": "The wait is over. Your requested favorite is available again, subject to live inventory.",
        "cta_label": "See availability",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Back by request",
        "title": "The wait is over",
        "description": "Your requested favorite is available again, subject to live inventory.",
        "cta_label": "See availability"
      },
      "sms": {
        "text": "The wait is over. See availability.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "The wait is over",
        "description": "Your requested favorite is available again, subject to live inventory.",
        "cta_label": "See availability",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "clearance-sale",
    "slug": "clearance-sale",
    "name": "Clearance sale",
    "summary": "Move end-of-line inventory responsibly",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 7,
    "eyebrow": "Last selection",
    "headline": "A final chance to explore",
    "body": "Selected products are in their final run. Availability varies by item.",
    "cta_label": "Shop final picks",
    "subtitle": "Clearance sale",
    "segment_hint": "clearance",
    "visual_key": "last",
    "destination_label": "Clearance collection",
    "channel_defaults": [
      "homepage_banner",
      "email",
      "product_pages",
      "social"
    ],
    "setup_groups": [
      "collection",
      "discount",
      "date",
      "creative"
    ],
    "workflow_kind": "clearance",
    "fields": [
      {
        "key": "collection_refs",
        "label": "Collections",
        "type": "collection",
        "required": true,
        "help": "Use cms_collections; resolve cms_collection_items"
      },
      {
        "key": "discount_ref",
        "label": "Discount / promotion",
        "type": "discount",
        "required": true,
        "help": "Reference the existing Commerce promotion contract"
      },
      {
        "key": "starts_at",
        "label": "Starts at",
        "type": "datetime",
        "required": true,
        "help": ""
      },
      {
        "key": "ends_at",
        "label": "Ends at",
        "type": "datetime",
        "required": true,
        "help": ""
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "remaining_stock_verified",
      "pricing_authoritative"
    ],
    "assets": {
      "website": {
        "eyebrow": "Last selection",
        "headline": "A final chance to explore",
        "body": "Selected products are in their final run. Availability varies by item.",
        "cta_label": "Shop final picks",
        "destination_kind": "Clearance collection"
      },
      "email": {
        "subject": "A final chance to explore",
        "preheader": "Move end-of-line inventory responsibly",
        "heading": "A final chance to explore",
        "body": "Selected products are in their final run. Availability varies by item.",
        "cta_label": "Shop final picks",
        "requires_consent": true
      },
      "social": {
        "caption": "A final chance to explore. Selected products are in their final run. Availability varies by item.",
        "cta_label": "Shop final picks",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Last selection",
        "title": "A final chance to explore",
        "description": "Selected products are in their final run. Availability varies by item.",
        "cta_label": "Shop final picks"
      },
      "sms": {
        "text": "A final chance to explore. Shop final picks.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "A final chance to explore",
        "description": "Selected products are in their final run. Availability varies by item.",
        "cta_label": "Shop final picks",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "preorder",
    "slug": "preorder",
    "name": "Preorder campaign",
    "summary": "Collect interest ahead of fulfillment",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 8,
    "eyebrow": "Coming soon",
    "headline": "Get ahead of the release",
    "body": "Reserve eligible items before their scheduled availability. Details appear at checkout.",
    "cta_label": "View preorder details",
    "subtitle": "Preorder",
    "segment_hint": "preorder",
    "visual_key": "future",
    "destination_label": "Preorder product detail",
    "channel_defaults": [
      "homepage_banner",
      "email",
      "social",
      "product_pages"
    ],
    "setup_groups": [
      "product",
      "date",
      "creative"
    ],
    "workflow_kind": "preorder",
    "fields": [
      {
        "key": "product_refs",
        "label": "Products / variants",
        "type": "catalog",
        "required": true,
        "help": "Use site-scoped Commerce IDs"
      },
      {
        "key": "inventory_rule",
        "label": "Inventory policy",
        "type": "select",
        "required": true,
        "help": "Verify stock before activating"
      },
      {
        "key": "starts_at",
        "label": "Starts at",
        "type": "datetime",
        "required": true,
        "help": ""
      },
      {
        "key": "ends_at",
        "label": "Ends at",
        "type": "datetime",
        "required": true,
        "help": ""
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "preorder_enabled",
      "fulfillment_date_disclosed",
      "refund_terms"
    ],
    "assets": {
      "website": {
        "eyebrow": "Coming soon",
        "headline": "Get ahead of the release",
        "body": "Reserve eligible items before their scheduled availability. Details appear at checkout.",
        "cta_label": "View preorder details",
        "destination_kind": "Preorder product detail"
      },
      "email": {
        "subject": "Get ahead of the release",
        "preheader": "Collect interest ahead of fulfillment",
        "heading": "Get ahead of the release",
        "body": "Reserve eligible items before their scheduled availability. Details appear at checkout.",
        "cta_label": "View preorder details",
        "requires_consent": true
      },
      "social": {
        "caption": "Get ahead of the release. Reserve eligible items before their scheduled availability. Details appear at checkout.",
        "cta_label": "View preorder details",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Coming soon",
        "title": "Get ahead of the release",
        "description": "Reserve eligible items before their scheduled availability. Details appear at checkout.",
        "cta_label": "View preorder details"
      },
      "sms": {
        "text": "Get ahead of the release. View preorder details.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "Get ahead of the release",
        "description": "Reserve eligible items before their scheduled availability. Details appear at checkout.",
        "cta_label": "View preorder details",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "first-purchase",
    "slug": "first-purchase",
    "name": "First-purchase offer",
    "summary": "Give new buyers a reason to try",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 9,
    "eyebrow": "A welcome offer",
    "headline": "Your first order starts here",
    "body": "Explore the collection and see whether you qualify for a first-order offer.",
    "cta_label": "Browse the store",
    "subtitle": "First purchase",
    "segment_hint": "new_customers",
    "visual_key": "welcome",
    "destination_label": "Collection or product page",
    "channel_defaults": [
      "homepage_banner",
      "email",
      "subscriber_offer"
    ],
    "setup_groups": [
      "product",
      "discount",
      "audience",
      "creative"
    ],
    "workflow_kind": "welcome",
    "fields": [
      {
        "key": "product_refs",
        "label": "Products / variants",
        "type": "catalog",
        "required": true,
        "help": "Use site-scoped Commerce IDs"
      },
      {
        "key": "inventory_rule",
        "label": "Inventory policy",
        "type": "select",
        "required": true,
        "help": "Verify stock before activating"
      },
      {
        "key": "discount_ref",
        "label": "Discount / promotion",
        "type": "discount",
        "required": true,
        "help": "Reference the existing Commerce promotion contract"
      },
      {
        "key": "audience_segment_ref",
        "label": "Audience",
        "type": "segment",
        "required": true,
        "help": "Verify consent for outbound channels"
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "new_customer_eligibility",
      "marketing_consent"
    ],
    "assets": {
      "website": {
        "eyebrow": "A welcome offer",
        "headline": "Your first order starts here",
        "body": "Explore the collection and see whether you qualify for a first-order offer.",
        "cta_label": "Browse the store",
        "destination_kind": "Collection or product page"
      },
      "email": {
        "subject": "Your first order starts here",
        "preheader": "Give new buyers a reason to try",
        "heading": "Your first order starts here",
        "body": "Explore the collection and see whether you qualify for a first-order offer.",
        "cta_label": "Browse the store",
        "requires_consent": true
      },
      "social": {
        "caption": "Your first order starts here. Explore the collection and see whether you qualify for a first-order offer.",
        "cta_label": "Browse the store",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "A welcome offer",
        "title": "Your first order starts here",
        "description": "Explore the collection and see whether you qualify for a first-order offer.",
        "cta_label": "Browse the store"
      },
      "sms": {
        "text": "Your first order starts here. Browse the store.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "Your first order starts here",
        "description": "Explore the collection and see whether you qualify for a first-order offer.",
        "cta_label": "Browse the store",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "customer-winback",
    "slug": "customer-winback",
    "name": "Customer winback",
    "summary": "Reconnect with customers who have gone quiet",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 10,
    "eyebrow": "Good to see you again",
    "headline": "Find something new",
    "body": "Discover what's changed since your last visit, with choices picked for this moment.",
    "cta_label": "Explore what's new",
    "subtitle": "Winback",
    "segment_hint": "returning",
    "visual_key": "reconnect",
    "destination_label": "Personalized collection",
    "channel_defaults": [
      "email",
      "social",
      "retargeting"
    ],
    "setup_groups": [
      "collection",
      "audience",
      "creative"
    ],
    "workflow_kind": "winback",
    "fields": [
      {
        "key": "collection_refs",
        "label": "Collections",
        "type": "collection",
        "required": true,
        "help": "Use cms_collections; resolve cms_collection_items"
      },
      {
        "key": "audience_segment_ref",
        "label": "Audience",
        "type": "segment",
        "required": true,
        "help": "Verify consent for outbound channels"
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "inactive_segment_verified",
      "consent_and_suppression"
    ],
    "assets": {
      "website": {
        "eyebrow": "Good to see you again",
        "headline": "Find something new",
        "body": "Discover what's changed since your last visit, with choices picked for this moment.",
        "cta_label": "Explore what's new",
        "destination_kind": "Personalized collection"
      },
      "email": {
        "subject": "Find something new",
        "preheader": "Reconnect with customers who have gone quiet",
        "heading": "Find something new",
        "body": "Discover what's changed since your last visit, with choices picked for this moment.",
        "cta_label": "Explore what's new",
        "requires_consent": true
      },
      "social": {
        "caption": "Find something new. Discover what's changed since your last visit, with choices picked for this moment.",
        "cta_label": "Explore what's new",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Good to see you again",
        "title": "Find something new",
        "description": "Discover what's changed since your last visit, with choices picked for this moment.",
        "cta_label": "Explore what's new"
      },
      "sms": {
        "text": "Find something new. Explore what's new.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "Find something new",
        "description": "Discover what's changed since your last visit, with choices picked for this moment.",
        "cta_label": "Explore what's new",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "upsell-cross-sell",
    "slug": "upsell-cross-sell",
    "name": "Upsell / cross-sell",
    "summary": "Surface relevant additions, not irrelevant interruptions",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 11,
    "eyebrow": "Perfectly paired",
    "headline": "Make more of the moment",
    "body": "Explore complementary options chosen to work well with your selection.",
    "cta_label": "See the pairing",
    "subtitle": "Cross-sell",
    "segment_hint": "cross_sell",
    "visual_key": "pair",
    "destination_label": "Related product detail",
    "channel_defaults": [
      "product_pages",
      "email",
      "retargeting"
    ],
    "setup_groups": [
      "product",
      "creative"
    ],
    "workflow_kind": "recommend",
    "fields": [
      {
        "key": "product_refs",
        "label": "Products / variants",
        "type": "catalog",
        "required": true,
        "help": "Use site-scoped Commerce IDs"
      },
      {
        "key": "inventory_rule",
        "label": "Inventory policy",
        "type": "select",
        "required": true,
        "help": "Verify stock before activating"
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "product_relationship_valid",
      "no_false_compatibility"
    ],
    "assets": {
      "website": {
        "eyebrow": "Perfectly paired",
        "headline": "Make more of the moment",
        "body": "Explore complementary options chosen to work well with your selection.",
        "cta_label": "See the pairing",
        "destination_kind": "Related product detail"
      },
      "email": {
        "subject": "Make more of the moment",
        "preheader": "Surface relevant additions, not irrelevant interruptions",
        "heading": "Make more of the moment",
        "body": "Explore complementary options chosen to work well with your selection.",
        "cta_label": "See the pairing",
        "requires_consent": true
      },
      "social": {
        "caption": "Make more of the moment. Explore complementary options chosen to work well with your selection.",
        "cta_label": "See the pairing",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Perfectly paired",
        "title": "Make more of the moment",
        "description": "Explore complementary options chosen to work well with your selection.",
        "cta_label": "See the pairing"
      },
      "sms": {
        "text": "Make more of the moment. See the pairing.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "Make more of the moment",
        "description": "Explore complementary options chosen to work well with your selection.",
        "cta_label": "See the pairing",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "abandoned-checkout",
    "slug": "abandoned-checkout",
    "name": "Abandoned checkout",
    "summary": "Recover eligible unfinished orders with consent",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 12,
    "eyebrow": "Your selection, saved",
    "headline": "Pick up where you left off",
    "body": "Your selection may still be available. Return to review your order securely.",
    "cta_label": "Return to checkout",
    "subtitle": "Checkout recovery",
    "segment_hint": "recovery",
    "visual_key": "cart",
    "destination_label": "Authorized checkout recovery",
    "channel_defaults": [
      "email",
      "retargeting"
    ],
    "setup_groups": [
      "audience",
      "creative"
    ],
    "workflow_kind": "triggered",
    "fields": [
      {
        "key": "audience_segment_ref",
        "label": "Audience",
        "type": "segment",
        "required": true,
        "help": "Verify consent for outbound channels"
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "consent_verified",
      "no_completed_order",
      "valid_recovery_token"
    ],
    "assets": {
      "website": {
        "eyebrow": "Your selection, saved",
        "headline": "Pick up where you left off",
        "body": "Your selection may still be available. Return to review your order securely.",
        "cta_label": "Return to checkout",
        "destination_kind": "Authorized checkout recovery"
      },
      "email": {
        "subject": "Pick up where you left off",
        "preheader": "Recover eligible unfinished orders with consent",
        "heading": "Pick up where you left off",
        "body": "Your selection may still be available. Return to review your order securely.",
        "cta_label": "Return to checkout",
        "requires_consent": true
      },
      "social": {
        "caption": "Pick up where you left off. Your selection may still be available. Return to review your order securely.",
        "cta_label": "Return to checkout",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Your selection, saved",
        "title": "Pick up where you left off",
        "description": "Your selection may still be available. Return to review your order securely.",
        "cta_label": "Return to checkout"
      },
      "sms": {
        "text": "Pick up where you left off. Return to checkout.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "Pick up where you left off",
        "description": "Your selection may still be available. Return to review your order securely.",
        "cta_label": "Return to checkout",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "event_trigger",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "subscription-upgrade",
    "slug": "subscription-upgrade",
    "name": "Subscription upgrade",
    "summary": "Encourage upgrades to real available plans",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 13,
    "eyebrow": "Explore the next plan",
    "headline": "More room for what matters",
    "body": "Compare available features and choose the plan that fits your needs.",
    "cta_label": "Compare plans",
    "subtitle": "Plan upgrade",
    "segment_hint": "subscription",
    "visual_key": "upgrade",
    "destination_label": "Plan comparison page",
    "channel_defaults": [
      "email",
      "product_pages",
      "subscriber_offer"
    ],
    "setup_groups": [
      "product",
      "audience",
      "creative"
    ],
    "workflow_kind": "plan",
    "fields": [
      {
        "key": "product_refs",
        "label": "Products / variants",
        "type": "catalog",
        "required": true,
        "help": "Use site-scoped Commerce IDs"
      },
      {
        "key": "inventory_rule",
        "label": "Inventory policy",
        "type": "select",
        "required": true,
        "help": "Verify stock before activating"
      },
      {
        "key": "audience_segment_ref",
        "label": "Audience",
        "type": "segment",
        "required": true,
        "help": "Verify consent for outbound channels"
      },
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "eligible_plan_transition",
      "billing_prorations_disclosed"
    ],
    "assets": {
      "website": {
        "eyebrow": "Explore the next plan",
        "headline": "More room for what matters",
        "body": "Compare available features and choose the plan that fits your needs.",
        "cta_label": "Compare plans",
        "destination_kind": "Plan comparison page"
      },
      "email": {
        "subject": "More room for what matters",
        "preheader": "Encourage upgrades to real available plans",
        "heading": "More room for what matters",
        "body": "Compare available features and choose the plan that fits your needs.",
        "cta_label": "Compare plans",
        "requires_consent": true
      },
      "social": {
        "caption": "More room for what matters. Compare available features and choose the plan that fits your needs.",
        "cta_label": "Compare plans",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Explore the next plan",
        "title": "More room for what matters",
        "description": "Compare available features and choose the plan that fits your needs.",
        "cta_label": "Compare plans"
      },
      "sms": {
        "text": "More room for what matters. Compare plans.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "More room for what matters",
        "description": "Compare available features and choose the plan that fits your needs.",
        "cta_label": "Compare plans",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  },
  {
    "schema": "agentsam.growth.campaign-starter.v1",
    "id": "custom-sales",
    "slug": "custom-sales",
    "name": "Custom sales campaign",
    "summary": "Start with the components you actually need",
    "family": "increase_sales",
    "objective_key": "increase_sales",
    "template_version": 1,
    "sort_order": 14,
    "eyebrow": "Your campaign, your way",
    "headline": "Build something worth discovering",
    "body": "Create a clear offer, select the right audience, and connect approved destinations.",
    "cta_label": "Explore the offer",
    "subtitle": "Custom sales",
    "segment_hint": "custom",
    "visual_key": "custom",
    "destination_label": "Merchant-selected destination",
    "channel_defaults": [
      "homepage_banner",
      "email",
      "social"
    ],
    "setup_groups": [
      "creative"
    ],
    "workflow_kind": "custom",
    "fields": [
      {
        "key": "media_refs",
        "label": "Campaign media",
        "type": "asset",
        "required": false,
        "help": "Use the existing CMS/Library resource IDs"
      },
      {
        "key": "headline",
        "label": "Headline",
        "type": "text",
        "required": true,
        "help": ""
      },
      {
        "key": "body",
        "label": "Supporting copy",
        "type": "textarea",
        "required": true,
        "help": ""
      },
      {
        "key": "cta_label",
        "label": "CTA label",
        "type": "text",
        "required": true,
        "help": ""
      }
    ],
    "required_checks": [
      "valid_destination",
      "approved_copy"
    ],
    "assets": {
      "website": {
        "eyebrow": "Your campaign, your way",
        "headline": "Build something worth discovering",
        "body": "Create a clear offer, select the right audience, and connect approved destinations.",
        "cta_label": "Explore the offer",
        "destination_kind": "Merchant-selected destination"
      },
      "email": {
        "subject": "Build something worth discovering",
        "preheader": "Start with the components you actually need",
        "heading": "Build something worth discovering",
        "body": "Create a clear offer, select the right audience, and connect approved destinations.",
        "cta_label": "Explore the offer",
        "requires_consent": true
      },
      "social": {
        "caption": "Build something worth discovering. Create a clear offer, select the right audience, and connect approved destinations.",
        "cta_label": "Explore the offer",
        "requires_channel_review": true
      },
      "product_card": {
        "eyebrow": "Your campaign, your way",
        "title": "Build something worth discovering",
        "description": "Create a clear offer, select the right audience, and connect approved destinations.",
        "cta_label": "Explore the offer"
      },
      "sms": {
        "text": "Build something worth discovering. Explore the offer.",
        "requires_consent": true
      },
      "paid_ad": {
        "headline": "Build something worth discovering",
        "description": "Create a clear offer, select the right audience, and connect approved destinations.",
        "cta_label": "Explore the offer",
        "requires_provider_account": true
      }
    },
    "tracking": {
      "utm_medium_by_channel": {
        "homepage_banner": "website",
        "email": "email",
        "product_pages": "website",
        "social": "social",
        "retargeting": "paid_social",
        "subscriber_offer": "email"
      },
      "required_parameters": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content"
      ],
      "landing_path_source": "authorized_site_page"
    },
    "approvals": {
      "campaign": true,
      "creative_per_channel": true,
      "provider_publish": true,
      "record_version_receipt": true
    },
    "scheduling": {
      "timezone_source": "cms_sites.settings_json or account timezone",
      "mode": "scheduled_or_immediate",
      "idempotency_required": true
    },
    "reporting": {
      "metrics": [
        "paid_orders",
        "attributed_net_revenue",
        "conversion_rate",
        "average_order_value",
        "revenue_per_channel",
        "refund_adjustments"
      ],
      "source": "verified orders and eligible tracked sessions; no synthetic sales"
    },
    "integrations": {
      "catalog": "products / product_variants / cms_collections",
      "cms": "cms_pages / cms_page_sections / cms_publications",
      "media": "cms_assets / media_assets",
      "orders": "orders",
      "workflows": "agentsam_workflows / agentsam_workflow_runs"
    },
    "preview": {
      "mode": "demo_only",
      "merchant_data": "not_embedded",
      "simulated_checkout": true
    },
    "notes": "No real customer contacts, credentials, prices or production publishing permissions are included."
  }
];
export const campaignById = id => starterCampaigns.find(t => t.id===id) || null;
