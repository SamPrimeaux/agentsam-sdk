import { useState, type FormEvent } from 'react';

export interface AbsBuildHomeProps {
  onCreatePage: (prompt: string) => void;
  title?: string;
  subtitle?: string;
}

const STARTERS = [
  'Product dashboard',
  'Editorial landing page',
  'Storefront',
  'Admin workspace',
];

export function AbsBuildHome({
  onCreatePage,
  title = 'AgentSam Build',
  subtitle = 'Imagine any website, generated in real-time by AgentSam',
}: AbsBuildHomeProps) {
  const [prompt, setPrompt] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value) return;
    onCreatePage(value);
  }

  return (
    <div className="abs-build-home">
      <div className="abs-build-home-inner">
        <div className="abs-build-kicker">AgentSam Auto Browser</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>

        <form onSubmit={submit} className="abs-build-prompt">
          <input
            autoFocus
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Imagine any website..."
            aria-label="Describe a website to build"
          />
          <button type="submit">Build</button>
        </form>

        <div className="abs-build-starters" aria-label="Starter prompts">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => onCreatePage(starter)}
            >
              {starter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
