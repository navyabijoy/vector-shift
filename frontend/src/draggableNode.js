// draggableNode.js

export const DraggableNode = ({ type, label, icon, category, blurb }) => {
    const onDragStart = (event, nodeType) => {
      const appData = { nodeType }
      event.target.style.cursor = 'grabbing';
      event.dataTransfer.setData('application/reactflow', JSON.stringify(appData));
      event.dataTransfer.effectAllowed = 'move';
    };

    return (
      <div
        className="draggable-node"
        data-category={category ?? 'core'}
        onDragStart={(event) => onDragStart(event, type)}
        onDragEnd={(event) => (event.target.style.cursor = 'grab')}
        draggable
      >
        {icon ? <span className="draggable-node__icon">{icon}</span> : null}
        <span className="draggable-node__text">
          <span className="draggable-node__label">{label}</span>
          {blurb ? <span className="draggable-node__blurb">{blurb}</span> : null}
        </span>
      </div>
    );
  };
