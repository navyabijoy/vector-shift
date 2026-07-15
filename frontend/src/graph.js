// graph.js
// Client-side cycle detection, so the canvas can show a cycle the moment it
// forms instead of waiting for a Submit round-trip. Same idea as the backend's
// Kahn check: strip nodes with no incoming edges; whatever can't be stripped is
// knotted into a cycle. Any edge whose endpoints both survive is a cycle edge.

export const cycleEdgeIds = (nodes, edges) => {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = {};
  const successors = {};
  nodeIds.forEach((id) => {
    inDegree[id] = 0;
    successors[id] = [];
  });

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    successors[edge.source].push(edge.target);
    inDegree[edge.target] += 1;
  }

  // Peel off everything reachable in topological order.
  const queue = [...nodeIds].filter((id) => inDegree[id] === 0);
  const settled = new Set();
  while (queue.length) {
    const id = queue.shift();
    settled.add(id);
    for (const next of successors[id]) {
      inDegree[next] -= 1;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  // Nodes never settled are exactly those trapped in (or feeding) a cycle.
  const inCycle = (id) => nodeIds.has(id) && !settled.has(id);
  const cycleIds = new Set();
  for (const edge of edges) {
    if (inCycle(edge.source) && inCycle(edge.target)) cycleIds.add(edge.id);
  }
  return cycleIds;
};
