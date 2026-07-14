from collections import deque

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

app = FastAPI(title='VectorShift Pipeline API')

# The frontend is served from a different origin (:3000) than this API (:8000),
# so without CORS the browser refuses the request before it ever reaches us.
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000', 'http://127.0.0.1:3000'],
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
        # An edge whose endpoints aren't both on the canvas can't form a cycle
        # among the nodes we have. It still counts toward num_edges; it just
        # doesn't participate in the graph we walk here.
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
