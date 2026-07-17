// sidebar.js
// The node palette. Driven entirely by NODE_CONFIGS: a node added there appears
// here on its own, filed under whatever `category` it declares.

import { useMemo } from 'react';
import { DraggableNode } from './draggableNode';
import { NODE_CONFIGS } from './nodes';
import './sidebar.css';

// Display order and labels for the categories nodeConfigs already declares.
// A node with an unrecognised category still shows up, under "Other".
const CATEGORIES = [
  { key: 'io', label: 'Input / Output' },
  { key: 'ai', label: 'AI' },
  { key: 'logic', label: 'Logic' },
  { key: 'core', label: 'Core' },
];

export const PipelineSidebar = () => {
  const groups = useMemo(() => {
    const configs = Object.values(NODE_CONFIGS);
    const known = new Set(CATEGORIES.map((category) => category.key));
    const listed = CATEGORIES.map(({ key, label }) => ({
      label,
      nodes: configs.filter((config) => config.category === key),
    }));
    const other = configs.filter((config) => !known.has(config.category));
    return [...listed, { label: 'Other', nodes: other }].filter((group) => group.nodes.length > 0);
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar__intro">
        <h2 className="sidebar__heading">Nodes</h2>
        <p className="sidebar__hint">Drag onto the canvas to add.</p>
      </div>

      {groups.map((group) => (
        <section key={group.label} className="sidebar__group">
          <h3 className="sidebar__group-label">{group.label}</h3>
          <div className="sidebar__items">
            {group.nodes.map(({ type, title, icon, category, blurb }) => (
              <DraggableNode
                key={type}
                type={type}
                label={title}
                icon={icon}
                category={category}
                blurb={blurb}
              />
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
};
