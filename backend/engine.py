"""Pipeline execution.

The parse endpoint answers "is this graph valid?". This module answers the
question a *product* asks: "what does this graph actually produce?". It walks
the nodes in topological order and runs each one for real — Input nodes emit a
value, Text nodes substitute their {{variables}} from upstream, the LLM node
makes a real Claude call, Output nodes collect the result.

Every node runs behind a guard: a node that raises records an error on itself
and yields an empty output rather than taking the whole run down. The LLM node
degrades to a clear stub when no API key is configured or the call fails, so a
"Run" click can never hit a dead end — an honest fallback beats a crash.
"""

import json
import os
import re
import urllib.request
from collections import defaultdict, deque

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
except ImportError:
    pass

# The LLM node talks to OpenRouter (OpenAI-compatible). Model and endpoint are
# read from the environment so you can swap models without touching code.
OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
DEFAULT_MODEL = 'openai/gpt-oss-20b:free'

_VARIABLE = re.compile(r'{{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*}}')


def _local_handle(node_id: str, handle_id) -> str:
    """React Flow prefixes every handle id with its node id (`${nodeId}-${id}`).
    Strip that back to the id the node config declared ('value', 'response', …).
    """
    if handle_id and handle_id.startswith(f'{node_id}-'):
        return handle_id[len(node_id) + 1:]
    return handle_id or ''


def _topological_order(node_ids, edges):
    """Kahn's algorithm — the same check the parse endpoint runs, reused here to
    produce the execution order. Returns (order, ok); ok is False on a cycle.
    """
    successors = defaultdict(list)
    in_degree = {nid: 0 for nid in node_ids}
    for edge in edges:
        s, t = edge.get('source'), edge.get('target')
        if s not in node_ids or t not in node_ids:
            continue
        successors[s].append(t)
        in_degree[t] += 1

    queue = deque(nid for nid, deg in in_degree.items() if deg == 0)
    order = []
    while queue:
        nid = queue.popleft()
        order.append(nid)
        for succ in successors[nid]:
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                queue.append(succ)

    return order, len(order) == len(node_ids)


def _as_number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def chat_completion(messages, max_tokens=1024, timeout=30, temperature=None) -> str:
    """Low-level OpenRouter call. Raises on failure — callers decide how to
    degrade. Shared by the LLM node (below) and the pipeline generator.
    """
    api_key = os.environ.get('OPENROUTER_API_KEY')
    if not api_key:
        raise RuntimeError('OPENROUTER_API_KEY is not set')

    model = os.environ.get('OPENROUTER_MODEL', DEFAULT_MODEL)
    payload = {'model': model, 'messages': messages, 'max_tokens': max_tokens}
    if temperature is not None:
        payload['temperature'] = temperature
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        OPENROUTER_URL,
        data=body,
        method='POST',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'VectorShift Pipeline',
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    if isinstance(data.get('error'), dict):
        raise RuntimeError(data['error'].get('message', 'OpenRouter error'))
    choices = data.get('choices') or []
    if not choices:
        raise RuntimeError('OpenRouter returned no choices')
    message = choices[0].get('message') or {}
    # Some models leave `content` null and put text in `reasoning`; tolerate both.
    return message.get('content') or message.get('reasoning') or ''


def _call_llm(system: str, prompt: str) -> str:
    """One real OpenRouter call, with a safe fallback.

    If the API key is missing or the call fails, we return a clearly-labelled
    stub instead of raising. The pipeline still runs end to end and you still see
    data flow through the LLM node — an honest fallback beats a crash.
    """
    prompt = (prompt or '').strip()
    if not prompt:
        return '(LLM node: no prompt connected)'

    if not os.environ.get('OPENROUTER_API_KEY'):
        return _stub_llm(prompt)

    messages = []
    if (system or '').strip():
        messages.append({'role': 'system', 'content': system.strip()})
    messages.append({'role': 'user', 'content': prompt})

    try:
        return chat_completion(messages).strip()
    except Exception as err:  # noqa: BLE001 — a live run must never crash on the model
        return f'{_stub_llm(prompt)}\n\n(live call unavailable: {err})'


def _stub_llm(prompt: str) -> str:
    preview = prompt if len(prompt) <= 240 else prompt[:240] + '…'
    return f'[stubbed LLM response — set OPENROUTER_API_KEY for a live call]\nPrompt was: {preview}'


def _run_api_request(data):
    url = (data.get('url') or '').strip()
    if not url:
        return '(API Request node: no URL configured)'
    try:
        import urllib.request

        method = (data.get('method') or 'GET').upper()
        req = urllib.request.Request(url, method=method)
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read(4096).decode('utf-8', errors='replace')
        return body
    except Exception as err:  # noqa: BLE001 — surface the error as data, don't crash the run
        return f'(API Request failed: {err})'


def _run_node(node, incoming):
    """Execute one node. `incoming` maps this node's local target-handle ids to
    the upstream values wired into them. Returns a dict of local source-handle
    ids to the values this node produces.
    """
    node_type = node.get('type')
    data = node.get('data') or {}

    if node_type == 'customInput':
        # The value is injected by the caller (see run_pipeline's `inputs`).
        return {'value': incoming.get('__input__', '')}

    if node_type == 'customOutput':
        return {'value': incoming.get('value', '')}

    if node_type == 'text':
        text = data.get('text', '')
        resolved = _VARIABLE.sub(
            lambda m: str(incoming.get(f'field-{m.group(1)}', m.group(0))),
            text,
        )
        return {'output': resolved}

    if node_type == 'llm':
        return {'response': _call_llm(incoming.get('system', ''), incoming.get('prompt', ''))}

    if node_type == 'math':
        a, b = _as_number(incoming.get('a')), _as_number(incoming.get('b'))
        op = data.get('operator', '+')
        if op == '+':
            result = a + b
        elif op == '-':
            result = a - b
        elif op == '*':
            result = a * b
        elif op == '/':
            result = a / b if b else float('inf')
        else:
            result = a
        # Present whole numbers as ints so "2 + 3" reads as 5, not 5.0.
        return {'result': int(result) if result == int(result) else result}

    if node_type == 'filter':
        value = str(incoming.get('input', ''))
        target = str(data.get('value', ''))
        condition = data.get('condition', 'contains')
        passes = {
            'contains': target in value,
            'equals': value == target,
            'greater than': _as_number(value) > _as_number(target),
            'less than': _as_number(value) < _as_number(target),
        }.get(condition, False)
        return {'output': value if passes else ''}

    if node_type == 'merge':
        count = min(6, max(2, int(_as_number(data.get('inputCount', 2)))))
        parts = [str(incoming.get(f'input-{i}', '')) for i in range(count)]
        return {'output': '\n'.join(p for p in parts if p)}

    if node_type == 'apiRequest':
        return {'response': _run_api_request(data)}

    if node_type == 'note':
        return {}

    # Unknown node types pass their inputs through untouched rather than failing.
    return dict(incoming)


def run_pipeline(nodes, edges, inputs=None):
    """Run a pipeline and report what every node produced.

    Returns a dict with:
      is_dag       — False (with the reason) if the graph has a cycle
      order        — the topological execution order
      node_outputs — per node: its produced handle values, plus any error
      outputs      — the final Output-node values, keyed by output name
    """
    inputs = inputs or {}
    node_by_id = {n['id']: n for n in nodes}

    order, is_dag = _topological_order(set(node_by_id), edges)
    if not is_dag:
        return {
            'is_dag': False,
            'error': 'Pipeline has a cycle; it must be a DAG to run.',
            'order': [],
            'node_outputs': {},
            'outputs': {},
        }

    # Group edges by the node they feed, so gathering a node's inputs is a lookup.
    incoming_edges = defaultdict(list)
    for edge in edges:
        if edge.get('source') in node_by_id and edge.get('target') in node_by_id:
            incoming_edges[edge['target']].append(edge)

    produced = {}       # node_id -> {local_source_handle: value}
    node_outputs = {}   # node_id -> {outputs, error}
    outputs = {}        # output name -> value

    for node_id in order:
        node = node_by_id[node_id]
        data = node.get('data') or {}

        incoming = {}
        for edge in incoming_edges.get(node_id, []):
            src_handle = _local_handle(edge['source'], edge.get('sourceHandle'))
            tgt_handle = _local_handle(node_id, edge.get('targetHandle'))
            incoming[tgt_handle] = produced.get(edge['source'], {}).get(src_handle, '')

        # Input nodes take their value from the run request, keyed by their name.
        if node.get('type') == 'customInput':
            incoming['__input__'] = inputs.get(data.get('inputName', node_id), '')

        try:
            result = _run_node(node, incoming)
            produced[node_id] = result
            node_outputs[node_id] = {'outputs': result}
            if node.get('type') == 'customOutput':
                outputs[data.get('outputName', node_id)] = result.get('value', '')
        except Exception as err:  # noqa: BLE001 — one bad node shouldn't sink the run
            produced[node_id] = {}
            node_outputs[node_id] = {'outputs': {}, 'error': str(err)}

    return {
        'is_dag': True,
        'order': order,
        'node_outputs': node_outputs,
        'outputs': outputs,
    }
