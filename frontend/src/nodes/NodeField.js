// NodeField.js
// Renders one field of a node from its config descriptor. Adding a new input
// type means adding a case here; every node then gets it for free.

import { useEffect, useRef } from 'react';

const stopPropagation = (e) => e.stopPropagation();

// Grows to fit its content instead of scrolling. The node card has no fixed
// height, so a taller textarea is enough to grow the whole node vertically.
const AutosizeTextarea = ({ className, placeholder, ...rest }) => {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [rest.value]);

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={1}
      placeholder={placeholder}
      className={`${className} node__input--autosize`}
    />
  );
};

export const NodeField = ({ id, field, value, onChange }) => {
  const { name, label, type = 'text', options = [], placeholder, min, max } = field;
  const fieldId = `${id}-${name}`;

  // React Flow drags the node when you click it. Inputs need the click for
  // cursor placement / text selection, so keep it from bubbling up.
  const shared = {
    id: fieldId,
    className: 'node__input',
    value,
    onChange: (e) => onChange(e.target.value),
    onMouseDown: stopPropagation,
    onClick: stopPropagation,
  };

  let control;
  switch (type) {
    case 'select':
      control = (
        <select {...shared}>
          {options.map((option) => {
            const { value: optionValue, label: optionLabel } =
              typeof option === 'string' ? { value: option, label: option } : option;
            return (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            );
          })}
        </select>
      );
      break;

    case 'textarea':
      control = <textarea {...shared} rows={3} placeholder={placeholder} />;
      break;

    case 'autosize-textarea':
      control = <AutosizeTextarea {...shared} placeholder={placeholder} />;
      break;

    case 'number':
      control = <input {...shared} type="number" min={min} max={max} placeholder={placeholder} />;
      break;

    case 'checkbox':
      control = (
        <input
          {...shared}
          type="checkbox"
          className="node__checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
      break;

    default:
      control = <input {...shared} type="text" placeholder={placeholder} />;
  }

  return (
    <div className="node__field">
      <label className="node__label" htmlFor={fieldId}>
        {label}
      </label>
      {control}
    </div>
  );
};
