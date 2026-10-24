import { createFileRoute } from "@tanstack/react-router";
import { CadStudioPage } from "../cad";

/** Same editor, host and CAD model bridge as the historical /cad route. */
export const Route = createFileRoute("/(apps)/admin/cad")({ component: CadStudioPage });
