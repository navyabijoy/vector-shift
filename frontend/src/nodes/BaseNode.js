// BaseNode.js
// The shared shell every node renders through. A node config supplies a title,
// icon, handles and fields; this component turns that into markup, spaces the
// handles, and writes field edits back to the store.

import { Handle, Position } from 'reactflow';
import { useStore } from '../store';
import { NodeField } from './NodeField';
import './node.css';

const POSITIONS = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

// Spread n handles evenly along one edge: 1 sits at 50%, 2 at 33%/67%, and so on.
// This is what lets a node declare handles without hand-computing offsets.
const offsetOf = (index, count) => `${(100 * (index + 1)) / (count + 1)}%`;

const groupByPosition = (handles) =>
  handles.reduce((groups, handle) => {
    const position = handle.position ?? 'left';
    (groups[position] = groups[position] ?? []).push(handle);
    return groups;
  }, {});

export const BaseNode = ({ id, data, config }) => {
  const updateNodeField = useStore((state) => state.updateNodeField);

  const { title, icon, description, fields = [], handles = [], render } = config;

  // Handles may be a function of the node's data, so a node can grow or lose
  // handles as the user edits it (the Text node's {{variables}} rely on this).
  const resolved = typeof handles === 'function' ? handles(data, id) : handles;
  const groups = groupByPosition(resolved);

  return (
    <div className="node" data-node-type={config.type}>
      <header className="node__header">
        {icon ? <span className="node__icon">{icon}</span> : null}
        <span className="node__title">{title}</span>
      </header>

      <div className="node__body">
        {description ? <p className="node__description">{description}</p> : null}

        {fields.map((field) => (
          <NodeField
            key={field.name}
            id={id}
            field={field}
            value={data?.[field.name] ?? ''}
            onChange={(value) => updateNodeField(id, field.name, value)}
          />
        ))}

        {/* Escape hatch: a node that needs bespoke markup can render it here
            without abandoning the shell, styling and handle logic above. */}
        {render ? render({ id, data, updateNodeField }) : null}
      </div>

      {Object.entries(groups).flatMap(([position, group]) =>
        group.map((handle, index) => {
          const offset = offsetOf(index, group.length);
          const along = position === 'left' || position === 'right' ? { top: offset } : { left: offset };

          return (
            <Handle
              key={handle.id}
              type={handle.type}
              position={POSITIONS[position]}
              id={`${id}-${handle.id}`}
              className="node__handle"
              style={along}
            />
          );
        })
      )}

      {/* Handle labels live outside the Handle so they can't swallow its clicks. */}
      {Object.entries(groups).flatMap(([position, group]) =>
        group
          .filter((handle) => handle.label)
          .map((handle) => {
            const index = group.indexOf(handle);
            return (
              <span
                key={`${handle.id}-label`}
                className={`node__handle-label node__handle-label--${position}`}
                style={{ top: offsetOf(index, group.length) }}
              >
                {handle.label}
              </span>
            );
          })
      )}
    </div>
  );
};
