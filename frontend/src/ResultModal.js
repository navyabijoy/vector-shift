// ResultModal.js
// Reports the backend's verdict on the pipeline. The brief asked for an
// "alert"; a native alert() would clash with the rest of the UI, so this is
// the same information in a form that matches it.

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
        {isError ? (
          <>
            <div className="modal__icon modal__icon--error">!</div>
            <h2 className="modal__title" id="modal-title">
              Submission failed
            </h2>
            <p className="modal__message">{error}</p>
          </>
        ) : (
          <>
            <div className={`modal__icon ${isDag ? 'modal__icon--ok' : 'modal__icon--warn'}`}>
              {isDag ? '✓' : '↻'}
            </div>
            <h2 className="modal__title" id="modal-title">
              Pipeline submitted
            </h2>

            <div className="modal__stats">
              <div className="modal__stat">
                <span className="modal__stat-value">{result.num_nodes}</span>
                <span className="modal__stat-label">{result.num_nodes === 1 ? 'Node' : 'Nodes'}</span>
              </div>
              <div className="modal__stat">
                <span className="modal__stat-value">{result.num_edges}</span>
                <span className="modal__stat-label">{result.num_edges === 1 ? 'Edge' : 'Edges'}</span>
              </div>
            </div>

            <p className={`modal__verdict ${isDag ? 'modal__verdict--ok' : 'modal__verdict--warn'}`}>
              {isDag
                ? 'This pipeline is a valid DAG — no cycles.'
                : 'This pipeline is not a DAG — it contains a cycle.'}
            </p>
          </>
        )}

        <button type="button" className="modal__close" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
};
