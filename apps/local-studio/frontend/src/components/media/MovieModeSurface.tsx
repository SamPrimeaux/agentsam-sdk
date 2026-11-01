import { lazy, Suspense } from "react";
import type { MovieModeScreen } from "../../../../../agentsam-copro-studio/src/MovieModeApp";
import "./moviemode-surface.css";

const MovieModeApp = lazy(() =>
  import("../../../../../agentsam-copro-studio/src/MovieModeApp").then((module) => ({
    default: module.MovieModeApp,
  })),
);

/** CoPro MovieMode host. Canonical routes are /admin/moviemode[/edit] only. */
export function MovieModeSurface({ screen, workPane = false, compactNav = false }: { screen?: MovieModeScreen; workPane?: boolean; compactNav?: boolean }) {
  return <div className={"agentsam-moviemode" + (workPane || compactNav ? " is-work-pane" : "")}>
    <Suspense fallback={<div className="agentsam-moviemode-loading" role="status">Opening MovieMode…</div>}>
      <MovieModeApp
        initialScreen={screen ?? "projects"}
        screen={workPane ? undefined : screen}
        onScreenChange={workPane ? undefined : (next) => {
          window.dispatchEvent(new CustomEvent("agentsam:navigate", {
            detail: {
              to: next === "editor" ? "/admin/moviemode/edit" : "/admin/moviemode",
            },
          }));
        }}
      />
    </Suspense>
  </div>;
}
