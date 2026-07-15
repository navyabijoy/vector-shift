"""Build a pipeline from a natural-language prompt.

The user describes what they want ("summarize a URL and translate it to French");
the LLM returns a *compact* spec, and this module expands that into real nodes
and edges the canvas can render and the engine can run.

Why a compact spec instead of raw React Flow JSON? The fiddly part of a graph is
the handle wiring — ids like `text-1-field-topic`. Asking a model to get those
exactly right is fragile. Instead the model emits nodes with plain fields and
edges as `{from, to, into}`, and we compute the handle ids, positions, and
defaults here — the part code does reliably. A malformed spec raises; it never
corrupts the canvas.
"""

import json
import re
from collections import defaultdict, deque

import engine

# What each node type contributes to generation: a one-line description for the
# model, its single output handle, and its input handles ('dynamic' = derived).
NODE_SPEC = {
    'customInput': {'desc': 'A pipeline input the caller supplies at run time. Field: inputName.',
                    'output': 'value', 'inputs': []},
    'text': {'desc': 'A text template. Put {{variable}} placeholders in its text; each variable becomes an input. Field: text.',
             'output': 'output', 'inputs': 'dynamic'},
    'llm': {'desc': 'Runs a prompt through an LLM. Inputs: prompt (required), system (optional).',
            'output': 'response', 'inputs': ['system', 'prompt']},
    'customOutput': {'desc': 'A final result of the pipeline. Field: outputName.',
                     'output': 'value', 'inputs': ['value']},
    'math': {'desc': 'Arithmetic on two numbers. Inputs: a, b. Field: operator (+, -, *, /).',
             'output': 'result', 'inputs': ['a', 'b']},
    'filter': {'desc': 'Passes its input through only if a condition holds. Input: input.',
               'output': 'output', 'inputs': ['input']},
    'merge': {'desc': 'Combines several inputs into one.',
              'output': 'output', 'inputs': 'dynamic'},
    'apiRequest': {'desc': 'Makes an HTTP request. Field: url. Input: trigger.',
                   'output': 'response', 'inputs': ['trigger']},
}

# Field defaults per type, so a node the model under-specifies still has valid data.
_DEFAULTS = {
    'customInput': {'inputName': 'input', 'inputType': 'Text'},
    'customOutput': {'outputName': 'output', 'outputType': 'Text'},
    'text': {'text': ''},
    'llm': {},
    'math': {'operator': '+'},
    'filter': {'condition': 'contains', 'value': ''},
    'merge': {'inputCount': 2},
    'apiRequest': {'url': '', 'method': 'GET', 'async': False},
}

_VARIABLE = re.compile(r'{{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*}}')


def _catalog() -> str:
    return '\n'.join(f'- {name}: {spec["desc"]}' for name, spec in NODE_SPEC.items())


_SYSTEM_PROMPT = f"""You design node-based data pipelines. Given a request, return \
ONLY a JSON object (no prose, no markdown fences) describing the pipeline.

Available node types:
{_catalog()}

JSON shape:
{{
  "nodes": [
    {{"id": "a", "type": "customInput", "inputName": "topic"}},
    {{"id": "b", "type": "text", "text": "Write a haiku about {{{{topic}}}}"}},
    {{"id": "c", "type": "llm"}},
    {{"id": "d", "type": "customOutput", "outputName": "haiku"}}
  ],
  "edges": [
    {{"from": "a", "to": "b", "into": "topic"}},
    {{"from": "b", "to": "c", "into": "prompt"}},
    {{"from": "c", "to": "d"}}
  ]
}}

Rules:
- Use short unique ids. "type" must be one of the types above.
- "into" names the target port: for a text node it is the variable name; for an
  llm node it is "prompt" or "system"; for a math node "a" or "b". Omit "into"
  for nodes with a single input.
- Every variable referenced by an edge into a text node MUST appear as
  {{{{variable}}}} inside that node's text.
- Prefer this pattern: Input -> Text (prompt) -> LLM -> Output.
- For a MULTI-STEP task (e.g. "summarize AND translate"), use one LLM node per
  step and chain them: each step's LLM response feeds the next step's Text
  prompt via a {{{{variable}}}}. Example — write then translate:
  {{
    "nodes": [
      {{"id": "in", "type": "customInput", "inputName": "topic"}},
      {{"id": "t1", "type": "text", "text": "Write a poem about {{{{topic}}}}"}},
      {{"id": "m1", "type": "llm"}},
      {{"id": "t2", "type": "text", "text": "Translate to Spanish:\\n{{{{poem}}}}"}},
      {{"id": "m2", "type": "llm"}},
      {{"id": "out", "type": "customOutput", "outputName": "translated"}}
    ],
    "edges": [
      {{"from": "in", "to": "t1", "into": "topic"}},
      {{"from": "t1", "to": "m1", "into": "prompt"}},
      {{"from": "m1", "to": "t2", "into": "poem"}},
      {{"from": "t2", "to": "m2", "into": "prompt"}},
      {{"from": "m2", "to": "out"}}
    ]
  }}
- Output ONLY the JSON object."""


def _extract_json(text: str) -> dict:
    """Pull the JSON object out of a model response, tolerating code fences,
    surrounding prose, and the usual LLM JSON glitches (trailing commas, `//`
    comments, smart quotes).
    """
    text = text.strip()
    if text.startswith('```'):
        text = re.sub(r'^```[a-zA-Z]*\n?', '', text)
        text = re.sub(r'\n?```$', '', text).strip()
    start, end = text.find('{'), text.rfind('}')
    if start == -1 or end == -1 or end < start:
        raise ValueError('Model did not return JSON.')
    candidate = text[start:end + 1]

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Best-effort repair, then one more try.
        repaired = candidate.replace('“', '"').replace('”', '"')
        repaired = re.sub(r'//[^\n]*', '', repaired)        # line comments
        repaired = re.sub(r',(\s*[}\]])', r'\1', repaired)  # trailing commas
        return json.loads(repaired)


def _depths(node_ids, edges):
    """Longest-path depth per node — drives left-to-right auto-layout."""
    successors = defaultdict(list)
    in_degree = {nid: 0 for nid in node_ids}
    for edge in edges:
        if edge['source'] in node_ids and edge['target'] in node_ids:
            successors[edge['source']].append(edge['target'])
            in_degree[edge['target']] += 1

    depth = {nid: 0 for nid in node_ids}
    remaining = dict(in_degree)
    queue = deque(nid for nid in node_ids if remaining[nid] == 0)
    while queue:
        nid = queue.popleft()
        for nxt in successors[nid]:
            depth[nxt] = max(depth[nxt], depth[nid] + 1)
            remaining[nxt] -= 1
            if remaining[nxt] == 0:
                queue.append(nxt)
    return depth


def _expand(spec: dict) -> dict:
    """Turn the compact spec into full React Flow nodes and edges."""
    raw_nodes = spec.get('nodes') or []
    raw_edges = spec.get('edges') or []

    # Re-id every node to the app's `type-n` convention and remember the mapping,
    # so the model's arbitrary ids ("a", "input1") become canonical ids that the
    # store's ID counters and the run engine agree on.
    counters = defaultdict(int)
    id_map = {}
    nodes = {}
    for raw in raw_nodes:
        node_type = raw.get('type')
        if node_type not in NODE_SPEC:
            continue  # drop unknown types rather than fail the whole build
        counters[node_type] += 1
        new_id = f'{node_type}-{counters[node_type]}'
        id_map[raw.get('id')] = new_id

        data = dict(_DEFAULTS.get(node_type, {}))
        for field in list(data.keys()) + ['inputName', 'outputName', 'text', 'operator', 'url']:
            if field in raw:
                data[field] = raw[field]
        data['id'] = new_id
        data['nodeType'] = node_type
        nodes[new_id] = {'id': new_id, 'type': node_type, 'data': data}

    # Build edges, computing the handle ids the model didn't have to.
    merge_slots = defaultdict(int)      # target id -> next input-<k>
    math_slots = defaultdict(int)       # target id -> next of a/b
    text_needs_vars = defaultdict(set)  # text node id -> variable names it must expose
    edges = []
    for raw in raw_edges:
        src = id_map.get(raw.get('from'))
        tgt = id_map.get(raw.get('to'))
        if not src or not tgt:
            continue
        src_type = nodes[src]['type']
        tgt_type = nodes[tgt]['type']
        into = (raw.get('into') or '').strip()

        src_handle = NODE_SPEC[src_type]['output']

        if tgt_type == 'text':
            var = into or (list(_VARIABLE.findall(nodes[tgt]['data'].get('text', ''))) or ['input'])[0]
            text_needs_vars[tgt].add(var)
            tgt_handle = f'field-{var}'
        elif tgt_type == 'llm':
            tgt_handle = into if into in ('system', 'prompt') else 'prompt'
        elif tgt_type == 'math':
            tgt_handle = into if into in ('a', 'b') else ['a', 'b'][min(math_slots[tgt], 1)]
            math_slots[tgt] += 1
        elif tgt_type == 'merge':
            tgt_handle = f'input-{merge_slots[tgt]}'
            merge_slots[tgt] += 1
        else:
            tgt_handle = (NODE_SPEC[tgt_type]['inputs'] or ['value'])[0]

        edges.append({
            'id': f'{src}.{src_handle}->{tgt}.{tgt_handle}',
            'source': src,
            'target': tgt,
            'sourceHandle': f'{src}-{src_handle}',
            'targetHandle': f'{tgt}-{tgt_handle}',
            'type': 'smoothstep',
            'animated': True,
            'markerEnd': {'type': 'arrow', 'height': '20px', 'width': '20px'},
        })

    # Repair: a text node must actually contain every {{variable}} an edge feeds,
    # or that target handle never renders and the wire dangles.
    for text_id, needed in text_needs_vars.items():
        text = nodes[text_id]['data'].get('text', '')
        present = set(_VARIABLE.findall(text))
        missing = [v for v in needed if v not in present]
        if missing:
            text = (text + ' ' + ' '.join(f'{{{{{v}}}}}' for v in missing)).strip()
            nodes[text_id]['data']['text'] = text

    # Repair: models often forget the final wire into the Output node. If an
    # Output has nothing feeding it, connect the deepest dead-end producer (a
    # node whose result isn't consumed anywhere) so "…and return X" just works.
    used_sources = {edge['source'] for edge in edges}
    fed_targets = {edge['target'] for edge in edges}
    dangling_outputs = [nid for nid, n in nodes.items()
                        if n['type'] == 'customOutput' and nid not in fed_targets]
    producers = sorted(
        (nid for nid, n in nodes.items() if n['type'] != 'customOutput' and nid not in used_sources),
        key=lambda nid: sum(1 for e in edges if e['target'] == nid),
        reverse=True,
    )
    for out_id in dangling_outputs:
        if not producers:
            break
        src = producers.pop(0)
        src_handle = NODE_SPEC[nodes[src]['type']]['output']
        edges.append({
            'id': f'{src}.{src_handle}->{out_id}.value',
            'source': src,
            'target': out_id,
            'sourceHandle': f'{src}-{src_handle}',
            'targetHandle': f'{out_id}-value',
            'type': 'smoothstep',
            'animated': True,
            'markerEnd': {'type': 'arrow', 'height': '20px', 'width': '20px'},
        })

    # A merge node's handle count follows its wired inputs.
    for merge_id, count in merge_slots.items():
        nodes[merge_id]['data']['inputCount'] = max(2, min(6, count))

    # Auto-layout: layer by longest-path depth, stack nodes within a layer.
    depth = _depths(set(nodes), edges)
    per_layer = defaultdict(int)
    for node_id in nodes:
        d = depth.get(node_id, 0)
        nodes[node_id]['position'] = {'x': 40 + d * 300, 'y': 60 + per_layer[d] * 170}
        per_layer[d] += 1

    return {'nodes': list(nodes.values()), 'edges': edges}


def generate_pipeline(prompt: str) -> dict:
    prompt = (prompt or '').strip()
    if not prompt:
        raise ValueError('Describe the pipeline you want to build.')

    messages = [
        {'role': 'system', 'content': _SYSTEM_PROMPT},
        {'role': 'user', 'content': prompt},
    ]

    # Models are stochastic and sometimes emit invalid JSON; a low temperature
    # plus one retry makes generation reliable enough to demo.
    last_error = None
    for _ in range(2):
        try:
            content = engine.chat_completion(messages, max_tokens=2000, timeout=60, temperature=0.2)
            spec = _extract_json(content)
            result = _expand(spec)
            if result['nodes']:
                return result
            last_error = ValueError('empty pipeline')
        except (ValueError, json.JSONDecodeError) as err:
            last_error = err

    raise ValueError(f'Could not build a valid pipeline from that. Try rephrasing. ({last_error})')
