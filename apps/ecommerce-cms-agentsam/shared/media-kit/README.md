# @inneranimalmedia/media-kit

Provider-neutral media primitives for reusable CMS/admin applications.

## Design guarantees

- Storage/source, transforms, and delivery are separate capabilities.
- No vendor is mandatory. R2-only, Cloudflare Images-only, Drive-backed, local, or composed deployments are valid.
- Browser preview presets are presentation intent; they do **not** imply a paid transform or materialized derivative.
- Originals are identities/sources. Derivatives and delivery versions are separate concerns.
- Albums, galleries, campaigns, and product collections are organizational/presentation contracts, not storage folders.
- The package contains no customer branding, customer domains, bucket names, or customer-specific routes.

The application provides persistence, provider adapters, authorization, and rendering shells.

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).
