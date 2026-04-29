"""Chronicle of Aethermoor — RAG microservice.

Exposes two HTTP endpoints:

  POST /ingest
    Accepts batches of SimEvent objects and NpcMemory objects exported from
    the game's Zustand store.  Upserts them into ChromaDB for later retrieval.
    The game calls this fire-and-forget in the background (no blocking wait).

  POST /retrieve
    Given a natural-language query assembled from NPC role + player intent,
    returns the top-K semantically similar world events and NPC memories.
    Results replace the naive ``slice(-3)`` currently used in geminiNpc.ts.

Run locally:
    uvicorn main:app --reload --port 8787

Environment variables (optional overrides):
    RAG_PORT        — uvicorn port (default 8787, used in the __main__ block)
    RAG_ALLOW_ORIGIN — CORS origin for the game's Vite dev server
                       (default "http://localhost:5173")
"""

from __future__ import annotations

import os
from typing import List, Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import ingest as ingest_module
from chroma_store import get_npc_memories_collection, get_sim_events_collection

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Chronicle RAG Service",
    description="Semantic retrieval of sim events and NPC memories for grounded LLM prompts.",
    version="1.0.0",
)

_ALLOW_ORIGIN = os.getenv("RAG_ALLOW_ORIGIN", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[_ALLOW_ORIGIN],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)

# ---------------------------------------------------------------------------
# Pydantic models — request / response schemas
# ---------------------------------------------------------------------------


class SimEventPayload(BaseModel):
    """Mirrors the TypeScript SimEvent interface (snake_case for Python)."""

    event_id: str = Field(..., alias="eventId")
    summary: str
    category: str
    season: str
    game_tick: int = Field(..., alias="gameTick")
    world_time: int = Field(..., alias="worldTime")
    source: str
    visibility: str
    deltas_preview: Optional[str] = Field(None, alias="deltasPreview")

    model_config = {"populate_by_name": True}


class NpcMemoryPayload(BaseModel):
    """Mirrors the TypeScript NpcMemory interface."""

    npc_id: str = Field(..., alias="npcId")
    event: str
    tick: int
    sentiment: str

    model_config = {"populate_by_name": True}


class IngestRequest(BaseModel):
    sim_events: List[SimEventPayload] = Field(default_factory=list, alias="simEvents")
    npc_memories: List[NpcMemoryPayload] = Field(default_factory=list, alias="npcMemories")

    model_config = {"populate_by_name": True}


class IngestResponse(BaseModel):
    ingested_events: int
    ingested_memories: int


class RetrieveFilters(BaseModel):
    """Optional metadata filters applied to the sim_events query."""

    category: Optional[List[str]] = None
    season: Optional[str] = None


class RetrieveRequest(BaseModel):
    query: str
    npc_id: str = Field(..., alias="npcId")
    top_k_events: int = Field(6, alias="topKEvents", ge=1, le=20)
    top_k_memories: int = Field(4, alias="topKMemories", ge=1, le=20)
    filters: Optional[RetrieveFilters] = None

    model_config = {"populate_by_name": True}


class RetrieveResponse(BaseModel):
    events: List[str]
    memories: List[str]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ingest", response_model=IngestResponse)
def ingest(body: IngestRequest) -> IngestResponse:
    """Upsert a batch of sim events and NPC memories into ChromaDB."""
    n_events = ingest_module.ingest_sim_events(body.sim_events)
    n_memories = ingest_module.ingest_npc_memories(body.npc_memories)
    return IngestResponse(ingested_events=n_events, ingested_memories=n_memories)


@app.post("/retrieve", response_model=RetrieveResponse)
def retrieve(body: RetrieveRequest) -> RetrieveResponse:
    """Return semantically relevant events and memories for an NPC dialogue query."""
    events = _query_events(body.query, body.top_k_events, body.filters)
    memories = _query_memories(body.query, body.npc_id, body.top_k_memories)
    return RetrieveResponse(events=events, memories=memories)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_event_where(filters: Optional[RetrieveFilters]) -> Optional[dict]:
    """Translate ``RetrieveFilters`` into a ChromaDB ``where`` clause."""
    if filters is None:
        return None

    clauses: List[dict] = []

    if filters.category:
        if len(filters.category) == 1:
            clauses.append({"category": {"$eq": filters.category[0]}})
        else:
            clauses.append({"category": {"$in": filters.category}})

    if filters.season:
        clauses.append({"season": {"$eq": filters.season}})

    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


def _query_events(query: str, top_k: int, filters: Optional[RetrieveFilters]) -> List[str]:
    """Query the sim_events collection and return document strings."""
    collection = get_sim_events_collection()
    if collection.count() == 0:
        return []

    where = _build_event_where(filters)
    kwargs: dict = {"query_texts": [query], "n_results": min(top_k, collection.count())}
    if where is not None:
        kwargs["where"] = where

    results = collection.query(**kwargs)
    docs = results.get("documents", [[]])[0]
    return [d for d in docs if d]


def _query_memories(query: str, npc_id: str, top_k: int) -> List[str]:
    """Query the npc_memories collection filtered to a specific NPC."""
    collection = get_npc_memories_collection()
    if collection.count() == 0:
        return []

    # Only surface memories that belong to this NPC.
    where = {"npcId": {"$eq": npc_id}}
    n_results = min(top_k, collection.count())

    results = collection.query(
        query_texts=[query],
        n_results=n_results,
        where=where,
    )
    docs = results.get("documents", [[]])[0]
    return [d for d in docs if d]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("RAG_PORT", "8787"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
