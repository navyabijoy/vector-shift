// BaseNode.js
// The shared shell every node renders through. A node config supplies a title,
// icon, handles and fields; this component turns that into markup, spaces the
// handles, and writes field edits back to the store.

import { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { useStore } from '../store';
import { NodeField } from './NodeField';
import './node.css';

const POSITIONS = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

const MIN_NODE_WIDTH = 240;
const MAX_NODE_WIDTH = 480;
const CHAR_WIDTH_PX = 7;
const WIDTH_CHROME_PX = 48; // border + body/input padding

// Widens a node to fit its longest line, clamped to a sane range.
const autoWidthFor = (text) => {
  const longestLine = (text || '').split('\n').reduce((max, line) => Math.max(max, line.length), 0);
  return Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, WIDTH_CHROME_PX + longestLine * CHAR_WIDTH_PX));
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
  const pruneEdgesForNode = useStore((state) => state.pruneEdgesForNode);
  const updateNodeInternals = useUpdateNodeInternals();

  const { title, icon, description, fields = [], handles = [], render, autoSize } = config;

  // Handles may be a function of the node's data, so a node can grow or lose
  // handles as the user edits it (the Text node's {{variables}} rely on this).
  const resolved = typeof handles === 'function' ? handles(data, id) : handles;
  const groups = groupByPosition(resolved);
  const handleKey = resolved.map((handle) => handle.id).join('|');

  // A handle that disappears (e.g. a {{variable}} gets deleted) can leave an
  // edge wired to a handle id that no longer renders. Prune those whenever
  // this node's resolved handle set changes.
  useEffect(() => {
    const validHandleIds = handleKey === '' ? [] : handleKey.split('|').map((handleId) => `${id}-${handleId}`);
    pruneEdgesForNode(id, validHandleIds);
    // React Flow caches each handle's measured position; re-measure so edges
    // follow the handles when the set changes rather than anchoring to stale spots.
    updateNodeInternals(id);
  }, [id, handleKey, pruneEdgesForNode, updateNodeInternals]);

  const autoWidth = autoSize ? autoWidthFor(data?.[autoSize]) : undefined;

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, autoWidth, updateNodeInternals]);

  return (
    <div
      className="node"
      data-node-type={config.type}
      data-category={config.category ?? 'core'}
      style={autoWidth ? { width: autoWidth } : undefined}
    >
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
              className={`node__handle node__handle--${handle.type}`}
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
