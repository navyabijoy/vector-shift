// nodeConfigs.js
// Every node in the pipeline, declared as data. Adding a node means adding an
// entry here — no new component, no duplicated shell, no hand-placed handles.
//
// A config supports:
//   title / icon / description  — header and body chrome
//   fields[]                    — { name, label, type, options, default, placeholder }
//                                 `default` may be a value or a fn(id) => value
//   handles[]                   — { id, type: 'source'|'target', position, label }
//                                 may also be a fn(data, id) => handles for dynamic ports
//   render()                    — escape hatch for bespoke markup
//   autoSize                    — name of a text field whose content should
//                                 drive the node's width (BaseNode reads it)

import { extractVariables } from './textVariables';

export const NODE_CONFIGS = {
  customInput: {
    type: 'customInput',
    title: 'Input',
    icon: '↘',
    category: 'io',
    fields: [
      { name: 'inputName', label: 'Name', type: 'text', default: (id) => id.replace('customInput-', 'input_') },
      { name: 'inputType', label: 'Type', type: 'select', options: ['Text', 'File'], default: 'Text' },
    ],
    handles: [{ id: 'value', type: 'source', position: 'right' }],
  },

  customOutput: {
    type: 'customOutput',
    title: 'Output',
    icon: '↗',
    category: 'io',
    fields: [
      { name: 'outputName', label: 'Name', type: 'text', default: (id) => id.replace('customOutput-', 'output_') },
      { name: 'outputType', label: 'Type', type: 'select', options: ['Text', 'Image'], default: 'Text' },
    ],
    handles: [{ id: 'value', type: 'target', position: 'left' }],
  },

  llm: {
    type: 'llm',
    title: 'LLM',
    icon: '✦',
    category: 'ai',
    description: 'Runs a prompt through a language model.',
    handles: [
      // Note: no manual `top: 200/3 %` offsets — BaseNode spaces these itself.
      { id: 'system', type: 'target', position: 'left', label: 'system' },
      { id: 'prompt', type: 'target', position: 'left', label: 'prompt' },
      { id: 'response', type: 'source', position: 'right', label: 'response' },
    ],
  },

  text: {
    type: 'text',
    title: 'Text',
    icon: '¶',
    category: 'core',
    fields: [{ name: 'text', label: 'Text', type: 'autosize-textarea', default: '{{input}}' }],
    autoSize: 'text',
    // A target handle per unique {{variable}} in the text, plus the fixed
    // output. Dynamic, same as Merge above — just driven by parsed text
    // instead of a number field.
    handles: (data) => [
      ...extractVariables(data?.text).map((name) => ({
        id: `field-${name}`,
        type: 'target',
        position: 'left',
        label: name,
      })),
      { id: 'output', type: 'source', position: 'right' },
    ],
  },

  // --- Five new nodes, demonstrating the abstraction rather than doing
  // anything elaborate. Each one exercises something the original four
  // never needed: multiple field types, a checkbox, a dynamic handle count
  // driven by a field, and the render() escape hatch.

  math: {
    type: 'math',
    title: 'Math',
    icon: '∑',
    category: 'logic',
    fields: [
      {
        name: 'operator',
        label: 'Operator',
        type: 'select',
        options: [
          { value: '+', label: 'Add' },
          { value: '-', label: 'Subtract' },
          { value: '*', label: 'Multiply' },
          { value: '/', label: 'Divide' },
        ],
        default: '+',
      },
    ],
    handles: [
      { id: 'a', type: 'target', position: 'left', label: 'a' },
      { id: 'b', type: 'target', position: 'left', label: 'b' },
      { id: 'result', type: 'source', position: 'right', label: 'result' },
    ],
  },

  filter: {
    type: 'filter',
    title: 'Filter',
    icon: '⏚',
    category: 'logic',
    fields: [
      {
        name: 'condition',
        label: 'Condition',
        type: 'select',
        options: ['contains', 'equals', 'greater than', 'less than'],
        default: 'contains',
      },
      { name: 'value', label: 'Value', type: 'text', placeholder: 'comparison value', default: '' },
    ],
    handles: [
      { id: 'input', type: 'target', position: 'left' },
      { id: 'output', type: 'source', position: 'right' },
    ],
  },

  apiRequest: {
    type: 'apiRequest',
    title: 'API Request',
    icon: '⇄',
    category: 'io',
    fields: [
      { name: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com', default: '' },
      { name: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
      { name: 'async', label: 'Async', type: 'checkbox', default: false },
    ],
    handles: [
      { id: 'trigger', type: 'target', position: 'left' },
      { id: 'response', type: 'source', position: 'right' },
    ],
  },

  merge: {
    type: 'merge',
    title: 'Merge',
    icon: '⑃',
    category: 'logic',
    description: 'Combines multiple inputs into one. Handle count follows the field below.',
    fields: [{ name: 'inputCount', label: 'Inputs', type: 'number', min: 2, max: 6, default: 2 }],
    // The one config in this file where `handles` is a function: it reads
    // the node's own data to decide how many target handles to render. This
    // is the same mechanism Part 3 uses to grow a handle per {{variable}}.
    handles: (data) => {
      const count = Math.min(6, Math.max(2, Number(data?.inputCount) || 2));
      const inputs = Array.from({ length: count }, (_, i) => ({
        id: `input-${i}`,
        type: 'target',
        position: 'left',
        label: `input ${i + 1}`,
      }));
      return [...inputs, { id: 'output', type: 'source', position: 'right' }];
    },
  },

  note: {
    type: 'note',
    title: 'Note',
    icon: '✎',
    category: 'core',
    description: 'A freeform annotation. No handles — it does not participate in the pipeline graph.',
    fields: [{ name: 'text', label: 'Note', type: 'textarea', placeholder: 'Leave a note...', default: '' }],
    handles: [],
    // render() is the escape hatch for markup that isn't a stored field —
    // here, a live character count derived from the note's own text.
    render: ({ data }) => <p className="node__hint">{(data?.text || '').length} characters</p>,
  },
};

// Seeds a new node's data with its configured defaults, so the values the user
// sees are the values that actually get submitted to the backend.
export const getNodeDefaults = (type, id) => {
  const fields = NODE_CONFIGS[type]?.fields ?? [];
  return fields.reduce((data, field) => {
    if (field.default !== undefined) {
      data[field.name] = typeof field.default === 'function' ? field.default(id) : field.default;
    }
    return data;
  }, {});
};
