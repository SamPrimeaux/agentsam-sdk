import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioHome } from "../../index";

/**
 * Canonical platform home. The Ecommerce CMS product keeps its own home.html
 * inside the installed application's admin workspace.
 */
export const Route = createFileRoute("/(apps)/admin/home")({
  component: LocalStudioHome,
});
