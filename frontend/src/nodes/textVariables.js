// textVariables.js
// Parses {{ variableName }} placeholders out of the Text node's content. Each
// unique, validly-named variable becomes a target handle on the node.

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}\}/g;

export const extractVariables = (text) => {
  if (!text) return [];
  const seen = new Set();
  const variables = [];
  let match;
  VARIABLE_PATTERN.lastIndex = 0;
  while ((match = VARIABLE_PATTERN.exec(text)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      variables.push(name);
    }
  }
  return variables;
};
