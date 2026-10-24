import { createFileRoute } from "@tanstack/react-router";
import { MediaRoute } from "../media";

/** MovieMode is the installed CoPro creative editor; content assets remain under Content. */
export const Route = createFileRoute("/(apps)/admin/moviemode")({ component: MediaRoute });
