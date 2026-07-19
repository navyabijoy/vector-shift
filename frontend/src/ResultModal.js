// ResultModal.js
// Reports the backend's verdict on the pipeline. The brief asked for an
// "alert"; a native alert() would clash with the rest of the UI, so this is the
// same information in a small panel that matches the Run panel's header/footer.

import { useEffect } from 'react';
import './ResultModal.css';

export const ResultModal = ({ result, error, onClose }) => {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const isError = Boolean(error);
  const isDag = result?.is_dag;
  const status = isError ? 'error' : isDag ? 'ok' : 'warn';

  return (
    <div className="modal__backdrop" onClick={onClose}>
      {/* Clicks inside the dialog shouldn't dismiss it. */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__head">
          <h2 className="modal__title" id="modal-title">
            {isError ? 'Could not submit' : 'Pipeline submitted'}
          </h2>
          <button type="button" className="modal__x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {isError ? (
          <p className="modal__message">{error}</p>
        ) : (
          <div className="modal__body">
            <div className="modal__metrics">
              <span className="modal__metric">
                <b>{result.num_nodes}</b> {result.num_nodes === 1 ? 'node' : 'nodes'}
              </span>
              <span className="modal__metric">
                <b>{result.num_edges}</b> {result.num_edges === 1 ? 'edge' : 'edges'}
              </span>
            </div>

            <p className={`modal__status modal__status--${status}`}>
              <span className="modal__dot" aria-hidden="true" />
              {isDag
                ? 'No cycles found. This is a valid DAG, ready to run.'
                : 'This graph has a cycle. A pipeline has to be acyclic to run.'}
            </p>
          </div>
        )}

        <footer className="modal__foot">
          <button type="button" className="btn btn--secondary" onClick={onClose} autoFocus>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};
