// run.js
// The product move: don't just validate the graph — run it. This opens a panel
// that collects a value for each Input node, executes the pipeline on the
// backend, and shows what every node produced. It then lets you "deploy" the
// pipeline to a callable URL and copies a ready-to-run curl snippet, so the
// graph you drew becomes an API you can trigger from anywhere.

import { useMemo, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from './store';
import './run.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const selector = (state) => ({ nodes: state.nodes, edges: state.edges });

// The graph payload the backend understands — the node's `data` already carries
// every field value because the node abstraction writes it through to the store.
const toPayload = (nodes, edges) => ({
  nodes: nodes.map(({ id, type, data }) => ({ id, type, data })),
  edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
  })),
});

export const RunPanel = () => {
  const { nodes, edges } = useStore(selector, shallow);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [copied, setCopied] = useState(false);

  // Input nodes are the pipeline's parameters — one field each, keyed by name.
  const inputNames = useMemo(
    () =>
      nodes
        .filter((node) => node.type === 'customInput')
        .map((node) => node.data?.inputName || node.id),
    [nodes]
  );

  const setValue = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`${API_URL}/pipelines/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...toPayload(nodes, edges), inputs: values }),
      });
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      setResult(await response.json());
    } catch (err) {
      setError(
        err instanceof TypeError
          ? `Could not reach the server at ${API_URL}. Is the backend running?`
          : err.message
      );
    } finally {
      setRunning(false);
    }
  };

  // Deploy: persist the pipeline so it gets a stable, callable endpoint.
  const deploy = async () => {
    setError(null);
    try {
      const response = await fetch(`${API_URL}/pipelines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(nodes, edges)),
      });
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      setSaved(await response.json());
      setCopied(false);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? `Could not reach the server at ${API_URL}. Is the backend running?`
          : err.message
      );
    }
  };

  const snippet = saved
    ? `curl -X POST ${API_URL}${saved.endpoint} \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify({ inputs: values })}'`
    : '';

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const dismiss = () => {
    setOpen(false);
    setResult(null);
    setError(null);
    setSaved(null);
  };

  return (
    <>
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
        Run ▷
      </button>

      {open && (
        <div className="run__backdrop" onClick={dismiss}>
          <div
            className="run"
            role="dialog"
            aria-modal="true"
            aria-label="Run pipeline"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="run__header">
              <h2 className="run__title">Run pipeline</h2>
              <button type="button" className="run__x" onClick={dismiss} aria-label="Close">
                ×
              </button>
            </header>

            <div className="run__body">
              <section className="run__section">
                <h3 className="run__label">Inputs</h3>
                {inputNames.length === 0 ? (
                  <p className="run__hint">No Input nodes — this pipeline runs with no arguments.</p>
                ) : (
                  inputNames.map((name) => (
                    <label key={name} className="run__field">
                      <span className="run__field-name">{name}</span>
                      <input
                        type="text"
                        value={values[name] ?? ''}
                        placeholder={`value for ${name}`}
                        onChange={(event) => setValue(name, event.target.value)}
                      />
                    </label>
                  ))
                )}
                <button type="button" className="btn btn--primary run__go" onClick={run} disabled={running}>
                  {running ? 'Running…' : 'Run pipeline ▷'}
                </button>
              </section>

              {error && <p className="run__error">{error}</p>}

              {result && !result.is_dag && (
                <p className="run__error">{result.error || 'Pipeline is not a DAG.'}</p>
              )}

              {result?.is_dag && (
                <>
                  <section className="run__section">
                    <h3 className="run__label">Output</h3>
                    {Object.keys(result.outputs).length === 0 ? (
                      <p className="run__hint">No Output nodes — add one to capture a result.</p>
                    ) : (
                      Object.entries(result.outputs).map(([name, value]) => (
                        <div key={name} className="run__output">
                          <span className="run__output-name">{name}</span>
                          <pre className="run__output-value">{String(value)}</pre>
                        </div>
                      ))
                    )}
                  </section>

                  <section className="run__section">
                    <h3 className="run__label">Execution trace</h3>
                    <ol className="run__trace">
                      {result.order.map((nodeId) => {
                        const node = result.node_outputs[nodeId] || {};
                        const produced = Object.values(node.outputs || {});
                        return (
                          <li key={nodeId} className="run__trace-item">
                            <span className="run__trace-node">{nodeId}</span>
                            <span className="run__trace-arrow">→</span>
                            <span className="run__trace-value">
                              {node.error
                                ? `⚠ ${node.error}`
                                : produced.length
                                ? String(produced[0])
                                : '—'}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </section>

                  <section className="run__section run__deploy">
                    <h3 className="run__label">Use this pipeline elsewhere</h3>
                    {saved ? (
                      <>
                        <p className="run__hint">
                          Deployed. Call it from your own code, a script, or a cron:
                        </p>
                        <pre className="run__snippet">{snippet}</pre>
                        <button type="button" className="btn btn--secondary" onClick={copySnippet}>
                          {copied ? 'Copied ✓' : 'Copy curl'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="run__hint">
                          Turn this graph into a callable API endpoint.
                        </p>
                        <button type="button" className="btn btn--secondary" onClick={deploy}>
                          Create API endpoint
                        </button>
                      </>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
