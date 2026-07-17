// header.js
// The app bar: identity on the left, actions on the right. Run is the primary
// action because running the pipeline is the point of the product; Submit
// (graph validation) sits beside it as a secondary.

import { useStore } from './store';
import { GenerateButton } from './generate';
import { RunPanel } from './run';
import { SubmitButton } from './submit';
import './header.css';

export const AppHeader = () => {
  const clearPipeline = useStore((state) => state.clearPipeline);
  const nodeCount = useStore((state) => state.nodes.length);
  const edgeCount = useStore((state) => state.edges.length);

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo" aria-hidden="true">◆</span>
        <span className="header__title">Circuit</span>
      </div>

      {nodeCount > 0 && (
        <div className="header__meta" aria-live="polite">
          <span className="header__count">
            {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
          </span>
          <span className="header__dot" aria-hidden="true">·</span>
          <span className="header__count">
            {edgeCount} {edgeCount === 1 ? 'connection' : 'connections'}
          </span>
        </div>
      )}

      <div className="header__actions">
        <GenerateButton variant="ghost" />
        {nodeCount > 0 && (
          <button
            type="button"
            className="btn btn--ghost-danger"
            onClick={() => {
              if (window.confirm('Clear the canvas? This removes all nodes and edges.')) {
                clearPipeline();
              }
            }}
          >
            Clear
          </button>
        )}
        <span className="header__divider" aria-hidden="true" />
        <SubmitButton />
        <RunPanel />
      </div>
    </header>
  );
};
