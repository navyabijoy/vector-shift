// toolbar.js
// Driven entirely by NODE_CONFIGS: a node added there appears here on its own.

import { DraggableNode } from './draggableNode';
import { NODE_CONFIGS } from './nodes';
import './toolbar.css';

export const PipelineToolbar = () => {
    return (
        <div className="toolbar">
            <div className="toolbar__brand">
                <span className="toolbar__logo">◆</span>
                <span className="toolbar__title">Pipeline Builder</span>
            </div>
            <div className="toolbar__palette">
                {Object.values(NODE_CONFIGS).map(({ type, title, icon, category }) => (
                    <DraggableNode key={type} type={type} label={title} icon={icon} category={category} />
                ))}
            </div>
        </div>
    );
};
