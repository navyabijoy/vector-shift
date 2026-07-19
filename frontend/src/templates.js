// templates.js
// Prebuilt pipelines so the first thing a user sees is a working example, not a
// blank canvas. Each template is real nodes + edges the run engine executes —
// pick one, hit Run, watch data flow through it.

// Match the node shape the canvas builds on drop: data carries `id`, `nodeType`,
// and the field values the backend reads.
const node = (id, type, position, fields = {}) => ({
  id,
  type,
  position,
  data: { id, nodeType: type, ...fields },
});

// Match the edge shape store.onConnect produces. Handle ids are prefixed with
// their node id, exactly as React Flow renders them. Topology only — ui.js
// styles every edge on render, whatever made it.
const edge = (source, sourceHandle, target, targetHandle) => ({
  id: `${source}.${sourceHandle}->${target}.${targetHandle}`,
  source,
  target,
  sourceHandle: `${source}-${sourceHandle}`,
  targetHandle: `${target}-${targetHandle}`,
});

// Input → Text → LLM → Output, the canonical prompt chain.
const summarize = () => ({
  nodes: [
    node('customInput-1', 'customInput', { x: 40, y: 200 }, { inputName: 'text', inputType: 'Text' }),
    node('text-1', 'text', { x: 320, y: 180 }, { text: 'Summarize the following in one sentence. Output only the summary, with no preamble or restating of the input:\n\n{{text}}' }),
    node('llm-1', 'llm', { x: 700, y: 190 }),
    node('customOutput-1', 'customOutput', { x: 980, y: 200 }, { outputName: 'summary', outputType: 'Text' }),
  ],
  edges: [
    edge('customInput-1', 'value', 'text-1', 'field-text'),
    edge('text-1', 'output', 'llm-1', 'prompt'),
    edge('llm-1', 'response', 'customOutput-1', 'value'),
  ],
});

// Two inputs feeding one Text node — shows the dynamic {{variable}} handles.
const translate = () => ({
  nodes: [
    node('customInput-1', 'customInput', { x: 40, y: 120 }, { inputName: 'text', inputType: 'Text' }),
    node('customInput-2', 'customInput', { x: 40, y: 300 }, { inputName: 'language', inputType: 'Text' }),
    node('text-1', 'text', { x: 340, y: 190 }, { text: 'Translate the following into {{language}}. Output only the translation, nothing else:\n\n{{text}}' }),
    node('llm-1', 'llm', { x: 720, y: 200 }),
    node('customOutput-1', 'customOutput', { x: 1000, y: 210 }, { outputName: 'translation', outputType: 'Text' }),
  ],
  edges: [
    edge('customInput-1', 'value', 'text-1', 'field-text'),
    edge('customInput-2', 'value', 'text-1', 'field-language'),
    edge('text-1', 'output', 'llm-1', 'prompt'),
    edge('llm-1', 'response', 'customOutput-1', 'value'),
  ],
});

// A system prompt shaping the model's role, plus the user's question.
const qa = () => ({
  nodes: [
    node('text-1', 'text', { x: 40, y: 80 }, { text: 'You are a concise expert. Answer in 2-3 sentences.' }),
    node('customInput-1', 'customInput', { x: 40, y: 300 }, { inputName: 'question', inputType: 'Text' }),
    node('llm-1', 'llm', { x: 420, y: 180 }),
    node('customOutput-1', 'customOutput', { x: 760, y: 190 }, { outputName: 'answer', outputType: 'Text' }),
  ],
  edges: [
    edge('text-1', 'output', 'llm-1', 'system'),
    edge('customInput-1', 'value', 'llm-1', 'prompt'),
    edge('llm-1', 'response', 'customOutput-1', 'value'),
  ],
});

export const TEMPLATES = [
  {
    key: 'summarize',
    title: 'Summarize',
    description: 'Feed text in, get a one-sentence summary out.',
    build: summarize,
  },
  {
    key: 'translate',
    title: 'Translate',
    description: 'Two inputs (text + language) into one prompt.',
    build: translate,
  },
  {
    key: 'qa',
    title: 'Q&A with a system prompt',
    description: 'A system role plus a question, answered by the model.',
    build: qa,
  },
];
