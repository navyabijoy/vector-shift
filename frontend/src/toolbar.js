// toolbar.js
// Driven entirely by NODE_CONFIGS: a node added there appears here on its own.

import { DraggableNode } from './draggableNode';
import { NODE_CONFIGS } from './nodes';
import { GenerateButton } from './generate';
import { useStore } from './store';
import './toolbar.css';

export const PipelineToolbar = () => {
    const clearPipeline = useStore((state) => state.clearPipeline);
    const nodeCount = useStore((state) => state.nodes.length);

    return (
        <div className="toolbar">
            <div className="toolbar__brand">
                <span className="toolbar__logo">◆</span>
                <span className="toolbar__title">Pipeline Builder</span>
                <GenerateButton variant="ghost" />
                {nodeCount > 0 && (
                    <button
                        type="button"
                        className="toolbar__clear"
                        onClick={() => {
                            if (window.confirm('Clear the canvas? This removes all nodes and edges.')) {
                                clearPipeline();
                            }
                        }}
                    >
                        Clear
                    </button>
                )}
            </div>
            <div className="toolbar__palette">
                {Object.values(NODE_CONFIGS).map(({ type, title, icon, category }) => (
                    <DraggableNode key={type} type={type} label={title} icon={icon} category={category} />
                ))}
            </div>
        </div>
    );
};
