"""Ingest helpers for sim events and NPC memories.

Called by the FastAPI ``/ingest`` route.  Each function accepts the typed
payload models defined in ``main.py`` and upserts documents into the
corresponding ChromaDB collection.  Using ``upsert`` (rather than ``add``)
makes repeated calls idempotent — the same ``event.id`` or memory key is
simply overwritten with fresh data.
"""

from __future__ import annotations

from typing import List

from chroma_store import get_npc_memories_collection, get_sim_events_collection


# ---------------------------------------------------------------------------
# Type mirrors for the JSON payload
# (avoids a circular import; main.py owns the Pydantic models)
# ---------------------------------------------------------------------------

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from main import SimEventPayload, NpcMemoryPayload


def ingest_sim_events(events: List["SimEventPayload"]) -> int:
    """Upsert *events* into the ``sim_events`` collection.

    The document text is ``summary`` optionally followed by the first
    ``deltasPreview`` string so semantic search can match on concrete changes
    (e.g. "iron price rose", "Korrath army fell").

    Returns the number of documents upserted.
    """
    if not events:
        return 0

    collection = get_sim_events_collection()

    ids: List[str] = []
    documents: List[str] = []
    metadatas: List[dict] = []

    for ev in events:
        doc_text = ev.summary
        if ev.deltas_preview:
            doc_text = f"{ev.summary} [{ev.deltas_preview}]"

        ids.append(ev.event_id)
        documents.append(doc_text)
        metadatas.append(
            {
                "eventId": ev.event_id,
                "category": ev.category,
                "season": ev.season,
                "gameTick": ev.game_tick,
                "worldTime": ev.world_time,
                "source": ev.source,
                "visibility": ev.visibility,
            }
        )

    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
    return len(ids)


def ingest_npc_memories(memories: List["NpcMemoryPayload"]) -> int:
    """Upsert *memories* into the ``npc_memories`` collection.

    The document ID is ``<npc_id>__<tick>__<sentiment>`` which is stable
    across repeated ingest calls for the same memory entry.

    Returns the number of documents upserted.
    """
    if not memories:
        return 0

    collection = get_npc_memories_collection()

    ids: List[str] = []
    documents: List[str] = []
    metadatas: List[dict] = []

    for mem in memories:
        doc_id = f"{mem.npc_id}__{mem.tick}__{mem.sentiment}"
        ids.append(doc_id)
        documents.append(mem.event)
        metadatas.append(
            {
                "npcId": mem.npc_id,
                "tick": mem.tick,
                "sentiment": mem.sentiment,
            }
        )

    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
    return len(ids)
