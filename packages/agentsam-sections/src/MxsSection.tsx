import { useId, useRef, type ReactNode } from 'react';
import { MxsMedia } from './MxsMedia.js';
import type { MxsLink, MxsMediaSource } from './types.js';
import { useMxsScroll } from './useMxsScroll.js';

export interface MxsSectionProps {
  id?: string;
  /** Big muted ordinal, e.g. "01" */
  index?: string;
  /** Small label above the grid, shown on the first section of a run */
  kicker?: string;
  title: string;
  children: ReactNode;
  media: MxsMediaSource;
  mediaSide?: 'start' | 'end';
  cta?: MxsLink;
  secondaryCta?: MxsLink;
  headingLevel?: 'h1' | 'h2';
  ctaClassName?: string;
}

/** Two-column split section; text and media enter/exit with scroll position. */
export function MxsSection({
  id,
  index,
  kicker,
  title,
  children,
  media,
  mediaSide = 'end',
  cta,
  secondaryCta,
  headingLevel: Heading = 'h2',
  ctaClassName = 'mxs-btn',
}: MxsSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const headingId = useId();
  useMxsScroll(ref);

  return (
    <section
      ref={ref}
      id={id}
      className="mxs-section"
      data-mxs-side={mediaSide}
      aria-labelledby={headingId}
    >
      <div className="mxs-wrap">
        {kicker ? <div className="mxs-kicker">{kicker}</div> : null}
        <div className="mxs-grid">
          <div className="mxs-col">
            {index ? <div className="mxs-num" aria-hidden="true">{index}</div> : null}
            <Heading className="mxs-title" id={headingId}>{title}</Heading>
            <div className="mxs-copy">{children}</div>
            {cta ? (
              <a className={`mxs-cta ${ctaClassName}`} href={cta.href}>
                <span>{cta.label}</span>
              </a>
            ) : null}
            {secondaryCta && <a className="mxs-cta mxs-secondary-cta" href={secondaryCta.href}>{secondaryCta.label}</a>}
          </div>
          <MxsMedia media={media} />
        </div>
      </div>
    </section>
  );
}
