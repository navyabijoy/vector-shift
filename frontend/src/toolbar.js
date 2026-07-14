// toolbar.js
// Driven entirely by NODE_CONFIGS: a node added there appears here on its own.

import { DraggableNode } from './draggableNode';
import { NODE_CONFIGS } from './nodes';

export const PipelineToolbar = () => {
    return (
        <div style={{ padding: '10px' }}>
            <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {Object.values(NODE_CONFIGS).map(({ type, title, icon }) => (
                    <DraggableNode key={type} type={type} label={title} icon={icon} />
                ))}
            </div>
        </div>
    );
};
