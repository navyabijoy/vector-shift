// generate.js
// "Describe it, don't drag it." A prompt goes to the backend, the LLM drafts a
// pipeline, and it loads onto the canvas — still fully editable by hand. This is
// the AI-workflow-builder loop: the product helps you build the product.

import { useState } from 'react';
import { useStore } from './store';
import './generate.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const EXAMPLES = [
  'Summarize a block of text in one line',
  'Write a poem about a topic, then translate it to French',
  'Answer a question as a formal expert',
];

export const generatePipeline = async (prompt) => {
  const response = await fetch(`${API_URL}/pipelines/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    let detail = `Server responded with ${response.status}`;
    try {
      detail = (await response.json()).detail || detail;
    } catch {
      /* keep the status message */
    }
    throw new Error(detail);
  }
  return response.json();
};

// A trigger button plus its own modal. Drop it anywhere (toolbar, empty state).
export const GenerateButton = ({ variant = 'ghost', label = '✨ Build from prompt' }) => {
  const loadPipeline = useStore((state) => state.loadPipeline);
  const nodeCount = useStore((state) => state.nodes.length);

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!prompt.trim()) return;
    if (nodeCount > 0 && !window.confirm('Replace the current canvas with the generated pipeline?')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { nodes, edges } = await generatePipeline(prompt.trim());
      loadPipeline(nodes, edges);
      setOpen(false);
      setPrompt('');
    } catch (err) {
      setError(
        err instanceof TypeError
          ? `Could not reach the server at ${API_URL}. Is the backend running?`
          : err.message
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={`gen-trigger gen-trigger--${variant}`} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open && (
        <div className="gen__backdrop" onClick={() => !busy && setOpen(false)}>
          <div
            className="gen"
            role="dialog"
            aria-modal="true"
            aria-label="Build a pipeline from a prompt"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="gen__header">
              <h2 className="gen__title">Build from a prompt</h2>
              <button type="button" className="gen__x" onClick={() => !busy && setOpen(false)} aria-label="Close">
                ×
              </button>
            </header>

            <p className="gen__hint">
              Describe the pipeline you want. It'll be drafted on the canvas — then tweak it by hand.
            </p>

            <textarea
              className="gen__input"
              value={prompt}
              autoFocus
              rows={3}
              placeholder="e.g. Take a URL, fetch it, and summarize the page"
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
              }}
            />

            <div className="gen__examples">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="gen__chip"
                  onClick={() => setPrompt(example)}
                >
                  {example}
                </button>
              ))}
            </div>

            {error && <p className="gen__error">{error}</p>}

            <div className="gen__actions">
              <button type="button" className="gen__cancel" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="gen__go" onClick={submit} disabled={busy || !prompt.trim()}>
                {busy ? 'Generating…' : 'Generate ▷'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
