# Circuit — a node-based pipeline builder

A take-home for VectorShift: a React Flow editor where you wire up a pipeline of
nodes, and a FastAPI backend that validates it. Built past the brief in one
direction — the pipeline **actually runs**, and it can be deployed to a callable
API endpoint.

Draw a graph, click **Run ▷**, watch real data flow through it. Or describe the
workflow in English and let the app assemble the graph for you.

---

## Quick start

Two terminals.

**Backend** (Python 3.9+):

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload          # → http://localhost:8000
```

**Frontend:**

```bash
cd frontend
npm i
npm start                          # → http://localhost:3000
```

The app works with no configuration: LLM nodes fall back to a clearly-labelled
stub. For real model calls, add `backend/.env`:

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-oss-20b:free    # optional; this is the default
```

LLM calls go to [OpenRouter](https://openrouter.ai) (OpenAI-compatible, free tier
available). The frontend reads `REACT_APP_API_URL` if you want to point it at a
non-local backend; it defaults to `http://localhost:8000`.

---

## The four parts of the brief

### Part 1 — Node abstraction

**A node is data, not a component.** Every node in the app is one entry in
[`nodes/nodeConfigs.js`](frontend/src/nodes/nodeConfigs.js). There are no
per-node files. Adding a node means adding a config — no new component, no
duplicated shell, no hand-placed handles:

```js
filter: {
  type: 'filter',
  title: 'Filter',
  icon: '⏚',
  category: 'logic',
  blurb: 'Keep or drop values',
  fields: [
    { name: 'condition', label: 'Condition', type: 'select',
      options: ['contains', 'equals', 'greater than', 'less than'], default: 'contains' },
    { name: 'value', label: 'Value', type: 'text', default: '' },
  ],
  handles: [
    { id: 'input', type: 'target', position: 'left' },
    { id: 'output', type: 'source', position: 'right' },
  ],
},
```

That config alone produces a styled node on the canvas, a draggable entry in the
palette (filed under its `category`), correctly-spaced handles, and field edits
written through to the store. Three pieces make it work:

| File | Role |
| --- | --- |
| [`BaseNode.js`](frontend/src/nodes/BaseNode.js) | The shell every node renders through: header, body, handle placement, store writes |
| [`NodeField.js`](frontend/src/nodes/NodeField.js) | A field registry — `text`, `select`, `number`, `checkbox`, `textarea`, `autosize-textarea`. Add a type here and every node can use it |
| [`nodes/index.js`](frontend/src/nodes/index.js) | Turns the configs into React Flow's `nodeTypes` map |

Three details worth calling out:

- **Handles can be a function of the node's data**, not just a static list. That
  single decision is what makes Part 3 fall out for free (see below).
- **`BaseNode` spaces handles itself** — `n` handles on an edge land at
  `100·(i+1)/(n+1)`%. Configs never compute pixel offsets.
- **`render()` is an escape hatch.** A node needing bespoke markup gets it
  without abandoning the shell, styling, or handle logic. The `note` node uses it
  for a live character count.

**The five new nodes** (`math`, `filter`, `apiRequest`, `merge`, `note`) were
chosen to stress the abstraction rather than to do anything elaborate — between
them they exercise every field type, the `render()` hatch, a node with *no*
handles, and a dynamic handle count driven by a field (`merge`).

### Part 2 — Styling

Design tokens live at the top of [`index.css`](frontend/src/index.css) — surfaces,
text, accents, spacing, radii, shadows. Nothing downstream hardcodes a color.

The organizing idea: **cool slate neutrals carry the whole interface, so color
only ever means something.** A hue on screen is either an action or a node's
category (`io` sky, `ai` indigo, `logic` amber, `core` slate). Same reasoning for
motion — edges are static by default, so the animation on a cycle edge reads as
an alarm instead of ambient noise.

Edge appearance is decided in [`ui.js`](frontend/src/ui.js) at render time and
nowhere else. Edges have three authors (hand-drawn, from a template, from the
generator) and they only decide *topology* — so a generated edge and a
hand-drawn one can't drift apart visually.

### Part 3 — Text node logic

Both requirements, driven by the same config:

```js
text: {
  fields: [{ name: 'text', label: 'Text', type: 'autosize-textarea', default: '{{input}}' }],
  autoSize: 'text',
  handles: (data) => [
    ...extractVariables(data?.text).map((name) => ({
      id: `field-${name}`, type: 'target', position: 'left', label: name,
    })),
    { id: 'output', type: 'source', position: 'right' },
  ],
},
```

- **Resizing.** `autoSize` names a field whose content drives the node's width
  (clamped 240–480px); the `autosize-textarea` control grows its own height, and
  since the node card has no fixed height, the node grows with it.
- **Variables.** [`textVariables.js`](frontend/src/nodes/textVariables.js) parses
  `{{ name }}` placeholders — valid JS identifiers only, deduped, order
  preserved — and each becomes a target handle.

This is the payoff from Part 1's dynamic handles: the mechanism was built for
`merge`'s input count, then **reused verbatim** here. Same machinery, different
data source.

One consequence worth handling: a handle can *disappear* when you delete a
`{{variable}}`, leaving an edge wired to a handle that no longer renders.
`BaseNode` reports its live handle set and the store's `pruneEdgesForNode` drops
any edge left dangling.

### Part 4 — Backend integration

`POST /pipelines/parse` returns `{num_nodes, num_edges, is_dag}`.

The DAG check is **Kahn's algorithm** ([`main.py`](backend/main.py)): strip nodes
with no incoming edges; whatever won't strip is knotted into a cycle. Edge cases
handled deliberately — a self-loop gives a node an in-degree it can never shed so
it falls out naturally; an empty pipeline is vacuously acyclic; an edge with an
endpoint that isn't on the canvas counts toward `num_edges` but can't form a
cycle, so it's skipped when walking.

The result surfaces in a small modal rather than `alert()` — same information,
readable, and it doesn't block the page.

---

## Beyond the brief

The brief asks whether a graph is *valid*. A product asks what it **produces**.
That gap is where the rest of this went.

### The pipeline actually runs

[`engine.py`](backend/engine.py) walks the graph in topological order (reusing
the same Kahn sort) and executes each node for real: Input emits its value, Text
substitutes its `{{variables}}` from upstream, LLM makes a live OpenRouter call,
Math/Filter/Merge/API do real work, Output collects the result. You get back the
final outputs **plus a per-node execution trace**.

**It cannot break on you.** Every node runs behind a guard — a node that raises
records the error on itself and yields empty rather than sinking the run. The LLM
node degrades to a labelled stub when there's no API key or the call fails. A
"Run" click never hits a dead end, because an honest fallback beats a crash.

### A pipeline becomes a callable API

`POST /pipelines` saves a graph and hands back `{ id, endpoint }`;
`POST /pipelines/{id}/run` triggers it from outside the editor. The Run panel
wraps this in a **Create API endpoint** button that copies a ready-to-run `curl`:

```bash
curl -X POST http://localhost:8000/pipelines/a1b2c3d4/run \
  -H 'Content-Type: application/json' \
  -d '{"inputs": {"text": "..."}}'
```

The graph you drew is now an API you can call from your own code.

### Build a pipeline from a prompt

`POST /pipelines/generate` — describe the workflow in English, get a runnable
graph back, fully editable on the canvas.

The interesting part is the division of labor. The model returns a **compact
spec** (nodes with plain fields, edges as `{from, to, into}`); it never sees a
handle id. [`generate.py`](backend/generate.py) expands that into real nodes and
edges — computing the fiddly `text-1-field-topic` handle ids, re-iding nodes to
the app's `type-n` convention, laying out left-to-right by longest-path depth,
filling defaults, and repairing the two things models reliably get wrong
(a `{{variable}}` referenced by an edge but missing from the text; a dangling
Output node with nothing wired into it). **Ask the model for judgment, not
bookkeeping.** A malformed spec raises a clean 400 and never corrupts the canvas.

### Editor behavior

- **Cycle highlighting** — [`graph.js`](frontend/src/graph.js) runs the same Kahn
  peel client-side, so offending edges turn red the instant a cycle forms rather
  than after a Submit round-trip. Seeing it beats reading it.
- **Connection validation** — `isValidConnection` blocks self-loops, duplicate
  wires, and a File-typed Input feeding a text-consuming node, so whole classes of
  invalid pipeline never reach the canvas.
- **Persistence** — zustand's `persist` middleware; a refresh doesn't nuke your work.
- **Templates** — three real, runnable pipelines on the empty canvas. First load
  is never blank.

---

## Bugs found in the starter

Worth flagging, since each would have broken the feature it sat behind:

| Bug | Consequence |
| --- | --- |
| Nodes kept field values in local `useState`, never writing to the store | The submitted payload would have carried **no user data at all** |
| `updateNodeField` mutated `node.data` in place and returned the same object | React Flow memoizes on node identity → stale canvas renders |
| `/pipelines/parse` declared `@app.get` while taking `Form(...)` — and there was no `requirements.txt`, so `python-multipart` was never installed | The endpoint **could not import**, let alone serve |
| `width: '100wv'` in `ui.js` | Not a CSS unit (`vw` transposed); silently ignored |

---

## Architecture at a glance

```
frontend/src/
  nodes/          BaseNode + NodeField + nodeConfigs   ← the abstraction (Part 1)
  store.js        zustand: nodes, edges, persistence
  ui.js           canvas, edge styling, cycle + connection validation
  sidebar.js      palette — derived from NODE_CONFIGS, no separate list
  header.js       app bar: Generate / Clear / Submit / Run
  run.js          run panel: inputs → execution → trace → deploy
  generate.js     "build from a prompt" modal
  templates.js    three prebuilt runnable pipelines
  graph.js        client-side cycle detection

backend/
  main.py         endpoints + the DAG check
  engine.py       topological execution
  generate.py     prompt → compact spec → expanded graph
```

**Endpoints**

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/pipelines/parse` | `{num_nodes, num_edges, is_dag}` — the brief |
| `POST` | `/pipelines/run` | Execute a graph, get outputs + per-node trace |
| `POST` | `/pipelines/generate` | Natural-language prompt → runnable graph |
| `POST` | `/pipelines` | Save a graph → `{id, endpoint}` |
| `POST` | `/pipelines/{id}/run` | Trigger a saved pipeline from anywhere |

**One structural choice worth naming:** the Pydantic models accept extra fields
(`ConfigDict(extra='allow')`) and pin only what the parse depends on — `id` on a
node, `source`/`target` on an edge. React Flow nodes carry a lot the backend
doesn't care about (position, width, `selected`, `dragging`), and that shape
changes as the frontend evolves. Modeling only the contract means a new frontend
field can't break the backend.

---

## Limitations (deliberate, not overlooked)

- **Saved pipelines live in an in-process dict.** Fine for a demo where you save
  and immediately call it; they vanish on restart and won't survive more than one
  server process. Swapping that dict for Postgres or Redis is the only change
  needed — nothing else assumes it's in memory.
- **CORS is pinned to `localhost:3000`.** Deploying the frontend elsewhere means
  adding that origin in `main.py`.
- **No auth or rate limiting** on the deployed-pipeline endpoints. An `id` is an
  unguessable 8 hex chars, which is obscurity, not security.
- **The `apiRequest` node makes unsandboxed outbound HTTP** from the server. Real
  deployment needs an allowlist.
- **No test suite.** The two things most worth testing are the pure functions —
  `extractVariables` and the DAG check.
