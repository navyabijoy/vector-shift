// submit.js
// Sends the pipeline to the backend and reports what came back.

import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from './store';
import { ResultModal } from './ResultModal';
import './submit.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const selector = (state) => ({ nodes: state.nodes, edges: state.edges });

export const SubmitButton = () => {
    const { nodes, edges } = useStore(selector, shallow);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch(`${API_URL}/pipelines/parse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // The node's `data` carries the user's field values because the
                // node abstraction writes them through to the store as they type.
                body: JSON.stringify({
                    nodes: nodes.map(({ id, type, data }) => ({ id, type, data })),
                    edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
                        id,
                        source,
                        target,
                        sourceHandle,
                        targetHandle,
                    })),
                }),
            });

            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }

            setResult(await response.json());
        } catch (err) {
            setError(
                err instanceof TypeError
                    ? `Could not reach the server at ${API_URL}. Is the backend running?`
                    : err.message
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const dismiss = () => {
        setResult(null);
        setError(null);
    };

    return (
        <>
            <button
                type="submit"
                className="submit-button"
                onClick={handleSubmit}
                disabled={isSubmitting}
            >
                {isSubmitting ? 'Submitting…' : 'Submit Pipeline'}
            </button>

            {(result || error) && <ResultModal result={result} error={error} onClose={dismiss} />}
        </>
    );
}
