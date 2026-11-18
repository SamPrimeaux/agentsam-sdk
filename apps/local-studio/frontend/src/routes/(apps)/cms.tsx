import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/cms")({
  component: () => <Navigate to="/admin/store" search={(previous) => ({
    site_id: typeof previous.site_id === 'string' ? previous.site_id : undefined,
    theme_sku: typeof previous.theme_sku === 'string' ? previous.theme_sku : undefined,
    theme_version: typeof previous.theme_version === 'string' ? previous.theme_version : undefined,
    action: previous.action === 'try' ? 'try' as const : undefined,
    stock: typeof previous.stock === 'string' ? previous.stock : undefined,
  })} replace />,
});
