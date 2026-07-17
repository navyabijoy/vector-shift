// store.js

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
  } from 'reactflow';

export const useStore = create(persist(
  (set, get) => ({
    nodes: [],
    edges: [],
    nodeIDs: {},
    getNodeID: (type) => {
        const newIDs = {...get().nodeIDs};
        if (newIDs[type] === undefined) {
            newIDs[type] = 0;
        }
        newIDs[type] += 1;
        set({nodeIDs: newIDs});
        return `${type}-${newIDs[type]}`;
    },
    addNode: (node) => {
        set({
            nodes: [...get().nodes, node]
        });
    },
    // Replace the whole canvas with a prebuilt pipeline (a template). The ID
    // counters are seeded from the template's node ids so newly added nodes
    // can't collide with the ones the template brought in.
    loadPipeline: (nodes, edges) => {
        const nodeIDs = {};
        nodes.forEach((node) => {
            const match = /^(.*)-(\d+)$/.exec(node.id);
            if (match) {
                const [, type, num] = match;
                nodeIDs[type] = Math.max(nodeIDs[type] || 0, Number(num));
            }
        });
        set({ nodes, edges, nodeIDs });
    },
    clearPipeline: () => set({ nodes: [], edges: [], nodeIDs: {} }),
    onNodesChange: (changes) => {
      set({
        nodes: applyNodeChanges(changes, get().nodes),
      });
    },
    onEdgesChange: (changes) => {
      set({
        edges: applyEdgeChanges(changes, get().edges),
      });
    },
    // Topology only — ui.js styles every edge on render, whatever made it.
    onConnect: (connection) => {
      set({
        edges: addEdge(connection, get().edges),
      });
    },
    updateNodeField: (nodeId, fieldName, fieldValue) => {
      set({
        // Return a new node object rather than mutating node.data in place.
        // React Flow memoizes on node identity, so an in-place edit can leave
        // the canvas showing a stale value.
        nodes: get().nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, [fieldName]: fieldValue } }
            : node
        ),
      });
    },
    // Nodes whose handles depend on their own data (Text's {{variables}},
    // Merge's input count) can lose a handle when the user edits them. Any
    // edge still wired to that handle would otherwise dangle. `validHandleIds`
    // is the full set of handle ids (`${nodeId}-${handleId}`) the node
    // currently renders.
    pruneEdgesForNode: (nodeId, validHandleIds) => {
      const current = get().edges;
      const next = current.filter((edge) => {
        if (edge.source === nodeId && !validHandleIds.includes(edge.sourceHandle)) return false;
        if (edge.target === nodeId && !validHandleIds.includes(edge.targetHandle)) return false;
        return true;
      });
      if (next.length !== current.length) {
        set({ edges: next });
      }
    },
  }),
  {
    // Persist the graph so a refresh doesn't nuke the user's work. Only the
    // data is stored — the action functions are rebuilt on load.
    name: 'vectorshift-pipeline',
    partialize: (state) => ({
      nodes: state.nodes,
      edges: state.edges,
      nodeIDs: state.nodeIDs,
    }),
  }
));
