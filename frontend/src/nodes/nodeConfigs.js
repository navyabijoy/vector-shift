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
    fields: [{ name: 'text', label: 'Text', type: 'textarea', default: '{{input}}' }],
    handles: [{ id: 'output', type: 'source', position: 'right' }],
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
