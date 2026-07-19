import os
import uuid
from collections import deque
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

import engine
import generate

app = FastAPI(title='VectorShift Pipeline API')

BASE_URL = os.getenv('BASE_URL', 'http://localhost:8000')

_dev_origins = ['http://localhost:3000', 'http://127.0.0.1:3000']
_extra_origins = [origin.strip() for origin in os.getenv('FRONTEND_URL', '').split(',') if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_dev_origins + _extra_origins,
    allow_methods=['*'],
    allow_headers=['*'],
)


# React Flow nodes and edges carry far more than we need (position, width,
# selected, dragging, ...). We model only the fields the parse depends on and
# tolerate the rest, so adding a field on the frontend can't break this contract.
class Node(BaseModel):
    model_config = ConfigDict(extra='allow')

    id: str


class Edge(BaseModel):
    model_config = ConfigDict(extra='allow')

    source: str
    target: str


class Pipeline(BaseModel):
    nodes: list[Node] = []
    edges: list[Edge] = []


class ParseResult(BaseModel):
    num_nodes: int
    num_edges: int
    is_dag: bool


def is_dag(nodes: list[Node], edges: list[Edge]) -> bool:
    """True if the pipeline is a directed acyclic graph.

    Kahn's algorithm: strip nodes with no incoming edges, and if anything is
    left over, whatever remains is knotted into a cycle. A self-loop gives its
    node an in-degree it can never shed, so it falls out of this naturally.

    An empty pipeline is vacuously acyclic.
    """
    node_ids = {node.id for node in nodes}

    successors: dict[str, list[str]] = {node_id: [] for node_id in node_ids}
    in_degree: dict[str, int] = {node_id: 0 for node_id in node_ids}

    for edge in edges:
        if edge.source not in node_ids or edge.target not in node_ids:
            continue
        successors[edge.source].append(edge.target)
        in_degree[edge.target] += 1

    queue = deque(node_id for node_id, degree in in_degree.items() if degree == 0)

    visited = 0
    while queue:
        node_id = queue.popleft()
        visited += 1
        for successor in successors[node_id]:
            in_degree[successor] -= 1
            if in_degree[successor] == 0:
                queue.append(successor)

    return visited == len(node_ids)


@app.get('/')
def read_root():
    return {'Ping': 'Pong'}


@app.post('/pipelines/parse', response_model=ParseResult)
def parse_pipeline(pipeline: Pipeline) -> ParseResult:
    return ParseResult(
        num_nodes=len(pipeline.nodes),
        num_edges=len(pipeline.edges),
        is_dag=is_dag(pipeline.nodes, pipeline.edges),
    )


# --- Execution ---------------------------------------------------------------
# Parsing tells you the graph is valid; running tells you what it produces.


class RunRequest(BaseModel):
    """A pipeline plus the values to feed its Input nodes, keyed by input name."""

    nodes: list[Node] = []
    edges: list[Edge] = []
    inputs: dict[str, str] = {}


def _run(nodes: list[Node], edges: list[Edge], inputs: dict) -> dict:
    # Node/Edge tolerate extra fields (type, data, handles); hand the engine the
    # plain dicts it walks over.
    return engine.run_pipeline(
        [node.model_dump() for node in nodes],
        [edge.model_dump() for edge in edges],
        inputs,
    )


@app.post('/pipelines/run')
def run_pipeline(request: RunRequest) -> dict:
    return _run(request.nodes, request.edges, request.inputs)


# --- Generate: build a pipeline from a natural-language prompt ----------------
# Describe what you want; the LLM drafts the graph and we expand it into real
# nodes/edges. The canvas loads it, still fully editable by hand.


class GenerateRequest(BaseModel):
    prompt: str


@app.post('/pipelines/generate')
def generate_pipeline(request: GenerateRequest) -> dict:
    try:
        return generate.generate_pipeline(request.prompt)
    except Exception as err:  # noqa: BLE001 — surface a clean 400, don't 500
        raise HTTPException(status_code=400, detail=str(err))


# --- Deploy: a saved pipeline becomes a callable endpoint --------------------
# Save a pipeline once, get an id, then trigger it from anywhere with
# POST /pipelines/{id}/run. This is the "use it elsewhere" half — the graph you
# drew turns into an API you (or your own code) can call without the editor.
#
# Storage is in-process: fine for a demo where you save and immediately call it.
# Swapping this dict for Postgres/Redis is the only change needed to persist it.

_SAVED_PIPELINES: dict[str, dict] = {}


class SavedPipeline(BaseModel):
    id: str
    endpoint: str


@app.post('/pipelines', response_model=SavedPipeline)
def save_pipeline(pipeline: Pipeline) -> SavedPipeline:
    pipeline_id = uuid.uuid4().hex[:8]
    _SAVED_PIPELINES[pipeline_id] = {
        'nodes': [node.model_dump() for node in pipeline.nodes],
        'edges': [edge.model_dump() for edge in pipeline.edges],
    }
    return SavedPipeline(id=pipeline_id, endpoint=f'{BASE_URL}/pipelines/{pipeline_id}/run')


@app.post('/pipelines/{pipeline_id}/run')
def run_saved_pipeline(pipeline_id: str, request: Optional[dict] = None) -> dict:
    saved = _SAVED_PIPELINES.get(pipeline_id)
    if saved is None:
        raise HTTPException(status_code=404, detail=f'No pipeline with id {pipeline_id!r}')
    inputs = (request or {}).get('inputs', {})
    return engine.run_pipeline(saved['nodes'], saved['edges'], inputs)
