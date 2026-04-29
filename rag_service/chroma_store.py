"""Singleton wrapper around ChromaDB collections and the embedding function.

Two collections are managed:
  - ``sim_events``   — one document per SimEvent, keyed by ``event.id``
  - ``npc_memories`` — one document per NpcMemory entry, keyed by
                       ``<npc_id>__<tick>__<sentiment>``

Both collections use the same ``all-MiniLM-L6-v2`` sentence-transformers
embedding function so queries and documents share the same vector space.

In development the store runs in embedded (in-process) mode and persists to
``./chroma_data/`` relative to the working directory.  For production, swap the
client construction for ``chromadb.HttpClient(host=..., port=...)`` and remove
the ``path`` argument.
"""

from __future__ import annotations

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

_EMBED_MODEL = "all-MiniLM-L6-v2"
_PERSIST_DIR = "./chroma_data"

_client: chromadb.ClientAPI | None = None
_embed_fn: SentenceTransformerEmbeddingFunction | None = None


def _get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=_PERSIST_DIR)
    return _client


def _get_embed_fn() -> SentenceTransformerEmbeddingFunction:
    global _embed_fn
    if _embed_fn is None:
        _embed_fn = SentenceTransformerEmbeddingFunction(model_name=_EMBED_MODEL)
    return _embed_fn


def get_sim_events_collection() -> chromadb.Collection:
    """Return the ``sim_events`` collection, creating it if needed."""
    return _get_client().get_or_create_collection(
        name="sim_events",
        embedding_function=_get_embed_fn(),
        metadata={"hnsw:space": "cosine"},
    )


def get_npc_memories_collection() -> chromadb.Collection:
    """Return the ``npc_memories`` collection, creating it if needed."""
    return _get_client().get_or_create_collection(
        name="npc_memories",
        embedding_function=_get_embed_fn(),
        metadata={"hnsw:space": "cosine"},
    )
