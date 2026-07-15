// ui.js
// Displays the drag-and-drop UI
// --------------------------------------------------

import { useState, useRef, useCallback, useMemo } from 'react';
import ReactFlow, { Controls, Background, MiniMap } from 'reactflow';
import { useStore } from './store';
import { shallow } from 'zustand/shallow';
import { nodeTypes, getNodeDefaults } from './nodes';
import { TEMPLATES } from './templates';
import { GenerateButton } from './generate';
import { cycleEdgeIds } from './graph';

import 'reactflow/dist/style.css';
import './ui.css';

const gridSize = 20;
const proOptions = { hideAttribution: true };

const selector = (state) => ({
  nodes: state.nodes,
  edges: state.edges,
  getNodeID: state.getNodeID,
  addNode: state.addNode,
  loadPipeline: state.loadPipeline,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  onConnect: state.onConnect,
});

// An empty canvas offers three ways in: describe it, start from a template, or
// drag nodes by hand.
const EmptyState = ({ onPick }) => (
  <div className="empty">
    <h2 className="empty__title">Build a pipeline</h2>
    <p className="empty__subtitle">Describe what you want, start from a template, or drag nodes from the left.</p>
    <div className="empty__generate">
      <GenerateButton variant="primary" label="✨ Build from a prompt" />
    </div>
    <div className="empty__or">or pick a template</div>
    <div className="empty__cards">
      {TEMPLATES.map((template) => (
        <button
          key={template.key}
          type="button"
          className="empty__card"
          onClick={() => onPick(template)}
        >
          <span className="empty__card-title">{template.title}</span>
          <span className="empty__card-desc">{template.description}</span>
        </button>
      ))}
    </div>
  </div>
);

export const PipelineUI = () => {
    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);
    const {
      nodes,
      edges,
      getNodeID,
      addNode,
      loadPipeline,
      onNodesChange,
      onEdgesChange,
      onConnect
    } = useStore(selector, shallow);

    // Seed the node with its configured field defaults so that a node the user
    // never touches still submits the values they can see on screen.
    const getInitNodeData = (nodeID, type) => ({
      id: nodeID,
      nodeType: `${type}`,
      ...getNodeDefaults(type, nodeID),
    });

    const onDrop = useCallback(
        (event) => {
          event.preventDefault();

          const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
          if (event?.dataTransfer?.getData('application/reactflow')) {
            const appData = JSON.parse(event.dataTransfer.getData('application/reactflow'));
            const type = appData?.nodeType;

            // check if the dropped element is valid
            if (typeof type === 'undefined' || !type) {
              return;
            }

            const position = reactFlowInstance.project({
              x: event.clientX - reactFlowBounds.left,
              y: event.clientY - reactFlowBounds.top,
            });

            const nodeID = getNodeID(type);
            const newNode = {
              id: nodeID,
              type,
              position,
              data: getInitNodeData(nodeID, type),
            };

            addNode(newNode);
          }
        },
        [reactFlowInstance, getNodeID, addNode]
    );

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    // Connection validation (draw-time): reject connections that can never be a
    // valid pipeline, so whole classes of mistakes never make it onto the canvas.
    const isValidConnection = useCallback(
      (connection) => {
        // A node can't feed itself.
        if (connection.source === connection.target) return false;
        // No duplicate wire between the same two handles.
        const duplicate = edges.some(
          (edge) =>
            edge.source === connection.source &&
            edge.target === connection.target &&
            edge.sourceHandle === connection.sourceHandle &&
            edge.targetHandle === connection.targetHandle
        );
        if (duplicate) return false;
        // Type-aware: a File input can't feed a text-consuming node.
        const source = nodes.find((node) => node.id === connection.source);
        const target = nodes.find((node) => node.id === connection.target);
        if (
          source?.type === 'customInput' &&
          source.data?.inputType === 'File' &&
          (target?.type === 'text' || target?.type === 'llm')
        ) {
          return false;
        }
        return true;
      },
      [nodes, edges]
    );

    // Cycle highlighting: paint the offending edges red the instant a cycle
    // forms. The run engine also refuses a cyclic graph, but seeing it beats
    // reading it.
    const cycleIds = useMemo(() => cycleEdgeIds(nodes, edges), [nodes, edges]);
    const hasCycle = cycleIds.size > 0;
    const displayEdges = useMemo(
      () =>
        edges.map((edge) =>
          cycleIds.has(edge.id)
            ? {
                ...edge,
                animated: true,
                style: { stroke: 'var(--color-danger)', strokeWidth: 2.5 },
              }
            : edge
        ),
      [edges, cycleIds]
    );

    return (
        <div ref={reactFlowWrapper} className="canvas">
            {hasCycle && (
              <div className="canvas__banner" role="status">
                This pipeline has a cycle — remove the red edge(s) before running.
              </div>
            )}
            <ReactFlow
                nodes={nodes}
                edges={displayEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onInit={setReactFlowInstance}
                nodeTypes={nodeTypes}
                proOptions={proOptions}
                snapGrid={[gridSize, gridSize]}
                connectionLineType='smoothstep'
                defaultEdgeOptions={{ style: { stroke: 'var(--color-primary)', strokeWidth: 2 } }}
            >
                <Background color="#c7cbd4" gap={gridSize} />
                <Controls />
                <MiniMap
                    nodeColor="#c7d2fe"
                    maskColor="rgba(244, 245, 248, 0.7)"
                    style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                />
            </ReactFlow>
            {nodes.length === 0 && (
              <EmptyState onPick={(template) => { const { nodes: n, edges: e } = template.build(); loadPipeline(n, e); }} />
            )}
        </div>
    )
}
