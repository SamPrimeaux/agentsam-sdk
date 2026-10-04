import type { ReactNode } from 'react';

export interface MxsMediaBase {
  /** CSS aspect-ratio, e.g. "3/4", "16/9". Each kind has a sensible default. */
  aspect?: string;
}

export interface MxsImageMedia extends MxsMediaBase {
  kind: 'image' | 'gif';
  src: string;
  alt: string;
}

export interface MxsVideoMedia extends MxsMediaBase {
  kind: 'video';
  src: string;
  label: string;
  poster?: string;
  /** Plays while in view, pauses out of view. Default true; disabled under reduced motion. */
  autoplay?: boolean;
  controls?: boolean;
}

export interface MxsModelMedia extends MxsMediaBase {
  kind: 'model';
  /** .glb / .gltf URL */
  src: string;
  alt: string;
  poster?: string;
  autoRotate?: boolean;
  /**
   * Registers the <model-viewer> element. Supplied by the host so this package
   * has no hidden dependency:  loadViewer: () => import('@google/model-viewer')
   * Keep the function reference stable (module scope).
   */
  loadViewer?: () => Promise<unknown>;
}


export interface MxsComponentMedia extends MxsMediaBase {
  kind: 'component';
  /** Real product/package UI mounted directly in the section. */
  node: ReactNode;
  title: string;
}

export interface MxsAppMedia extends MxsMediaBase {
  kind: 'app';
  /** URL of an interactive page, rendered in a sandboxed iframe after the viewer clicks launch. */
  src: string;
  title: string;
  poster?: string;
  /** Default: "allow-scripts allow-forms allow-pointer-lock allow-popups" (no same-origin). */
  sandbox?: string;
  launchLabel?: string;
  /** Load immediately instead of requiring a poster click. */
  autoLaunch?: boolean;
}

export type MxsMediaSource = MxsImageMedia | MxsVideoMedia | MxsModelMedia | MxsAppMedia | MxsComponentMedia;

export interface MxsLink {
  label: string;
  href: string;
}

export interface MxsBrand {
  label: string;
  href?: string;
  mark?: ReactNode;
}

export interface MxsFooterColumn {
  title: string;
  links: MxsLink[];
}
