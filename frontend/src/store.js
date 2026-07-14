// store.js

import { create } from "zustand";
import {
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    MarkerType,
  } from 'reactflow';

export const useStore = create((set, get) => ({
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
    onConnect: (connection) => {
      set({
        edges: addEdge({...connection, type: 'smoothstep', animated: true, markerEnd: {type: MarkerType.Arrow, height: '20px', width: '20px'}}, get().edges),
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
  }));
