// nodes/index.js
// Turns the declarative configs into the `nodeTypes` map React Flow wants.
// ui.js and sidebar.js both read from here, so a node added to nodeConfigs.js
// shows up on the canvas and in the palette with no further wiring.

import { BaseNode } from './BaseNode';
import { NODE_CONFIGS, getNodeDefaults } from './nodeConfigs';

const createNode = (config) => {
  const NodeComponent = ({ id, data }) => <BaseNode id={id} data={data} config={config} />;
  NodeComponent.displayName = `${config.title}Node`;
  return NodeComponent;
};

export const nodeTypes = Object.fromEntries(
  Object.entries(NODE_CONFIGS).map(([type, config]) => [type, createNode(config)])
);

export { NODE_CONFIGS, getNodeDefaults };
