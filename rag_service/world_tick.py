"""World Brain orchestrator.

Runs all four agents sequentially, feeds each with the same RAG context
pulled once at the start. Returns a consolidated WorldTickResponse.
"""
from __future__ import annotations

from typing import List, Optional

from chroma_store import get_sim_events_collection
from models import WorldTickRequest, WorldTickResponse
from agents import economy_agent, faction_agent, narrative_agent, npc_agent


def _query_rag(query: str, top_k: int = 8) -> List[str]:
    """Pull top-k semantically relevant events from ChromaDB.

    Returns an empty list if the collection is empty or any error occurs —
    agents must all handle rag_events=[] gracefully.
    """
    try:
        col = get_sim_events_collection()
        count = col.count()
        if count == 0:
            return []
        results = col.query(
            query_texts=[query],
            n_results=min(top_k, count),
        )
        docs = results.get("documents", [[]])[0]
        return [d for d in docs if d]
    except Exception:
        return []


def run_world_tick(
    request: WorldTickRequest,
    gemini_key: Optional[str],
) -> WorldTickResponse:
    """Orchestrate all World Brain agents and return the mutation batch."""
    # Build a composite query that captures the most active world state
    at_war_names = " ".join(f.name for f in request.factions if f.at_war_with)[:60]
    rag_query = (
        f"faction war {at_war_names} economy trade "
        f"season {request.season} "
        f"drought {request.regional.drought:.1f} "
        f"tension {request.regional.war_tension:.1f}"
    )
    rag_events = _query_rag(rag_query, top_k=8)

    # ── Agent 1: Faction strategic decisions ──
    faction_decisions = faction_agent.decide(
        factions=request.factions,
        regional=request.regional,
        rag_events=rag_events,
        gemini_key=gemini_key,
    )

    # ── Agent 2: NPC life simulation ──
    npc_events = npc_agent.simulate(
        npcs=request.npcs,
        relationships=request.relationships,
        rag_events=rag_events,
        regional=request.regional,
        season=request.season,
        world_time=request.world_time,
        gemini_key=gemini_key,
    )

    # ── Agent 3: Trade-flow economy model ──
    economy_adjustments = economy_agent.model_trade_flow(
        markets=request.markets,
        regional=request.regional,
        relationships=request.relationships,
    )

    # ── Agent 4: Narrative director (rate-limited internally) ──
    narrative_ev = narrative_agent.generate_event(
        world_state=request,
        rag_events=rag_events,
        gemini_key=gemini_key,
    )

    return WorldTickResponse(
        factionDecisions=faction_decisions,
        npcEvents=npc_events,
        economyAdjustments=economy_adjustments,
        narrativeEvent=narrative_ev,
    )
