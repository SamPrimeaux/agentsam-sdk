import { createElement, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MxsAppMedia, MxsMediaSource, MxsModelMedia, MxsVideoMedia } from './types.js';

const DEFAULT_ASPECT: Record<MxsMediaSource['kind'], string> = {
  image: '3/4',
  gif: '3/4',
  video: '16/9',
  model: '1/1',
  app: '4/3',
  component: '16/10',
};

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface MxsMediaProps {
  media: MxsMediaSource;
  className?: string;
}

export function MxsMedia({ media, className }: MxsMediaProps) {
  const style: CSSProperties = { aspectRatio: media.aspect ?? DEFAULT_ASPECT[media.kind] };
  return (
    <figure
      className={className ? `mxs-media ${className}` : 'mxs-media'}
      data-mxs-kind={media.kind}
      style={style}
    >
      <MediaBody media={media} />
    </figure>
  );
}

function MediaBody({ media }: { media: MxsMediaSource }) {
  switch (media.kind) {
    case 'image':
    case 'gif':
      return <img src={media.src} alt={media.alt} loading="lazy" decoding="async" />;
    case 'video':
      return <VideoMedia media={media} />;
    case 'model':
      return <ModelMedia media={media} />;
    case 'app':
      return <AppMedia media={media} />;
    case 'component':
      return <div className="mxs-component-preview" aria-label={media.title}>{media.node}</div>;
  }
}

function VideoMedia({ media }: { media: MxsVideoMedia }) {
  const ref = useRef<HTMLVideoElement>(null);
  const auto = (media.autoplay ?? true) && !reducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video || !auto) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [auto]);

  return (
    <video
      ref={ref}
      src={media.src}
      poster={media.poster}
      aria-label={media.label}
      muted
      loop
      playsInline
      preload="metadata"
      controls={!auto || Boolean(media.controls)}
    />
  );
}

function ModelMedia({ media }: { media: MxsModelMedia }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'ready' | 'unavailable'>(
    media.loadViewer ? 'idle' : 'unavailable',
  );
  const { loadViewer } = media;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !loadViewer) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        loadViewer()
          .then(() => !cancelled && setState('ready'))
          .catch(() => !cancelled && setState('unavailable'));
      },
      { rootMargin: '200px' },
    );
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [loadViewer]);

  return (
    <div className="mxs-model" ref={hostRef}>
      {state === 'ready' ? (
        createElement('model-viewer', {
          src: media.src,
          alt: media.alt,
          poster: media.poster,
          'camera-controls': true,
          'shadow-intensity': '1',
          'interaction-prompt': 'auto',
          ...(media.autoRotate ? { 'auto-rotate': true } : {}),
          style: { width: '100%', height: '100%' },
        })
      ) : (
        <>
          {media.poster ? <img src={media.poster} alt={media.alt} loading="lazy" decoding="async" /> : null}
          <span className="mxs-media-note">
            {state === 'idle' ? 'Loading 3D preview' : '3D preview unavailable'}
          </span>
        </>
      )}
    </div>
  );
}

function AppMedia({ media }: { media: MxsAppMedia }) {
  const [live, setLive] = useState(Boolean(media.autoLaunch));

  if (!live) {
    return (
      <div className="mxs-app-poster">
        {media.poster ? <img src={media.poster} alt="" loading="lazy" decoding="async" /> : null}
        <button type="button" className="mxs-btn" onClick={() => setLive(true)}>
          <span>{media.launchLabel ?? 'Launch interactive preview'}</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <iframe
        src={media.src}
        title={media.title}
        sandbox={media.sandbox ?? 'allow-scripts allow-forms allow-pointer-lock allow-popups'}
        loading="lazy"
        allow="fullscreen"
        referrerPolicy="no-referrer"
      />
      <div className="mxs-app-bar">
        <a href={media.src} target="_blank" rel="noopener noreferrer">Open in new tab</a>
        <button type="button" onClick={() => setLive(false)}>Close</button>
      </div>
    </>
  );
}
