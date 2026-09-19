import { useEffect, useState } from "react";

export type CompanyBranding = {
  name: string | null;
  logoUrl: string | null;
};

/**
 * Fetches the public company branding record (name, logo) served by the
 * identity Worker at /api/company. Fails soft — callers should fall back
 * to a static mark/name when this returns null.
 */
export function useCompanyBranding(): CompanyBranding | null {
  const [branding, setBranding] = useState<CompanyBranding | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/company")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.ok || !data.company) return;
        setBranding({
          name: data.company.name ?? null,
          logoUrl: data.company.logoUrl ?? data.company.logo_url ?? null,
        });
      })
      .catch(() => {
        /* soft fail — static fallback stays in place */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return branding;
}
