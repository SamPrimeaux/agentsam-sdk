import * as React from 'react';
import { createRoot } from 'react-dom/client';
import type { AbsThemeMode } from '@inneranimalmedia/agentsam-abs';
import { MxsFooter, MxsHeader, MxsSection } from '@inneranimalmedia/agentsam-sections';

import '@inneranimalmedia/agentsam-abs/theme.css';
import '@inneranimalmedia/agentsam-abs/browser.css';
import '@inneranimalmedia/agentsam-sections/mxs.css';
import './site.css';

import { LiveBrowser } from './LiveBrowser';

const media = (file: string) => `${import.meta.env.BASE_URL}${file}`;
const showcaseAppUrl = import.meta.env.VITE_SHOWCASE_APP_URL as string | undefined;

function App() {
  const [theme, setTheme] = React.useState<AbsThemeMode>('dark');

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <>
      <MxsHeader
        brand={{ label: 'AgentSam Browser', href: '#top' }}
        links={[
          { label: 'Browser', href: '#browser' },
          { label: 'Preview', href: '#preview' },
          { label: 'SDK', href: '#sdk' },
        ]}
        actions={
          <button
            type="button"
            className="mxs-btn"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        }
      />

      <main id="top">
        <section className="site-hero">
          <div className="site-hero__content">
            <div className="site-kicker">AgentSam Browser</div>
            <h1>
              Browse anything.
              <br />
              <span>Build from anything.</span>
            </h1>
            <p>
              Turn references, pages, and ideas into live, editable experiences without leaving
              your workspace.
            </p>
            <div className="site-hero__actions">
              <a className="as-button as-button--primary as-button--lg" href="#browser">Try the browser</a>
              <a className="as-button as-button--ghost-glass as-button--lg" href="#sdk"><span>Explore the SDK</span></a>
            </div>
            <div className="site-chips">
              <span className="as-chip">Explore + Build</span>
              <span className="as-chip">Sandboxed previews</span>
              <span className="as-chip">Runtime-aware</span>
              <span className="as-chip">Provider-neutral</span>
            </div>
          </div>
        </section>


        <MxsSection
          id="browser"
          kicker="The real product"
          index="01"
          title="One surface, two modes"
          media={{
            kind: 'component',
            title: 'Live AgentSam Browser package',
            node: <LiveBrowser theme={theme} onThemeChange={setTheme} />,
            aspect: '16/10',
          }}
        >
          <p>Explore real sites and Build new ones in the same window. Switch modes without losing your place, your tabs, or your history.</p>
          <p>The browser holds the state machine; your runtime decides what to generate.</p>
        </MxsSection>

        <MxsSection
          id="preview"
          index="02"
          title="Interactive previews, not screenshots"
          mediaSide="start"
          media={
            showcaseAppUrl
              ? {
                  kind: 'app',
                  src: showcaseAppUrl,
                  title: 'Live product preview',
                  poster: media('media/section-02-poster.svg'),
                  aspect: '4/5',
                  autoLaunch: true,
                }
              : {
                  kind: 'image',
                  src: media('media/section-02-poster.svg'),
                  alt: 'Product preview frame showing a reusable interactive surface',
                  aspect: '4/5',
                }
          }
        >
          <p>The media contract can mount the real React product directly, or load a real deployed app URL in a sandboxed frame.</p>
          <p>Images, GIFs, videos and GLB models are fallback media types—not substitutes when a runnable product exists.</p>
        </MxsSection>

        <MxsSection
          index="03"
          title="Built once, hosted anywhere"
          media={{ kind: 'image', src: media('media/section-03.svg'), alt: 'Abstract layered panels in indigo' }}
          cta={{ label: 'Read the SDK notes', href: '#sdk' }}
        >
          <p>Standalone web, Local Studio, desktop and mobile hosts compose the same package. Headers, footers and sections are shared components, so new pages are content, not code.</p>
        </MxsSection>

        <section id="sdk" className="site-sdk as-glass-panel">
          <div>
            <span className="site-kicker">Portable by design</span>
            <h2>Same browser.<br />Different hosts.</h2>
            <p>Install the packages, import two stylesheets, and compose.</p>
          </div>
          <pre>{`import { AgentSamAbsBrowser } from "@inneranimalmedia/agentsam-abs/react";
import { MxsSection } from "@inneranimalmedia/agentsam-sections";

import "@inneranimalmedia/agentsam-abs/theme.css";
import "@inneranimalmedia/agentsam-abs/browser.css";
import "@inneranimalmedia/agentsam-sections/mxs.css";`}</pre>
        </section>
      </main>

      <MxsFooter
        brand={{ label: 'AgentSam', blurb: 'A portable browser surface from Inner Animal Media.' }}
        columns={[
          { title: 'Product', links: [{ label: 'Browser', href: '#browser' }, { label: 'Preview', href: '#preview' }] },
          { title: 'Build', links: [{ label: 'SDK', href: '#sdk' }] },
        ]}
        legal={<>© {new Date().getFullYear()} Inner Animal Media</>}
      />
    </>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
