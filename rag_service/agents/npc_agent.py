"""NPC life simulation agent.

Each NPC is assigned a behavioral state (stressed / ambitious / at_peace)
derived from their personality and the current regional conditions.

Every 5th NPC (rotating by world_time + index) gets a Gemini-generated action
sentence. The rest use heuristic prose. All NPCs may generate small sentiment
deltas toward their closest relationships.
"""
from __future__ import annotations

import random
from typing import List, Optional, Tuple

import httpx

from models import NpcEvent, NpcSnapshot, RegionalSnapshot, RelationshipEdge

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-2.0-flash:generateContent"
)

# Valid Auredia + Trivalen location IDs for migration targets
VALID_LOCATIONS = [
    "highmarch", "ashenford", "saltmoor", "ironhold", "thornwick",
    "graygate", "crossroads", "coldpeak", "millhaven", "brightwater",
    "oakshire", "goldcrest", "emberhaven", "duskwall", "stonemarsh",
]

_STRESSED_KEYWORDS = {"fearful", "anxious", "cautious", "nervous", "timid", "wary"}
_AMBITIOUS_KEYWORDS = {"ambitious", "greedy", "competitive", "proud", "bold", "cunning"}
_FACTION_STRESS = {"amber", "green"}   # farming factions feel drought strongly


def _npc_state(npc: NpcSnapshot, regional: RegionalSnapshot) -> str:
    pers = npc.personality.lower()
    if (
        regional.war_tension > 0.6
        and any(k in pers for k in _STRESSED_KEYWORDS)
    ) or (
        regional.drought > 0.5
        and npc.faction in _FACTION_STRESS
    ) or (
        regional.bandit_pressure > 0.65
    ):
        return "stressed"
    if any(k in pers for k in _AMBITIOUS_KEYWORDS) and npc.disposition > 5:
        return "ambitious"
    return "at_peace"


def _heuristic_action(
    npc: NpcSnapshot, state: str, season: str
) -> Tuple[str, str, Optional[str]]:
    """Return (todayAction, memoryEvent, locationChange?)."""
    if state == "stressed":
        return (
            f"{npc.name} stayed close to {npc.location}, watching the roads with unease.",
            f"{npc.name} was anxious due to rising tensions in the realm.",
            None,
        )
    if state == "ambitious":
        # 20% chance of migration to an adjacent city
        if random.random() < 0.2 and npc.location in VALID_LOCATIONS:
            idx = VALID_LOCATIONS.index(npc.location)
            new_loc = VALID_LOCATIONS[(idx + 1) % len(VALID_LOCATIONS)]
            return (
                f"{npc.name} packed their belongings and set out for {new_loc}, "
                f"seeking new opportunity.",
                f"{npc.name} relocated from {npc.location} to {new_loc}.",
                new_loc,
            )
        return (
            f"{npc.name} worked late into the evening, driven by restless ambition.",
            f"{npc.name} pursued personal goals as {npc.title}.",
            None,
        )
    # at_peace
    season_flavor = {
        "thaw": "tending to the thaw's first chores",
        "summer": "working through the long summer day",
        "harvest": "busy with the harvest season",
        "dark": "keeping close to the fire in the dark months",
    }.get(season, "going about their daily duties")
    return (
        f"{npc.name} spent the day {season_flavor} in {npc.location}.",
        f"{npc.name} worked as {npc.title} in {npc.location}.",
        None,
    )


def _gemini_action(
    npc: NpcSnapshot, state: str, season: str, gemini_key: str
) -> Optional[str]:
    prompt = (
        f"You are narrating the life of {npc.name}, a {npc.title} in {npc.location}. "
        f"Personality: {npc.personality}. Current emotional state: {state}. Season: {season}.\n\n"
        f"Write exactly one sentence describing what {npc.name} did today. "
        f"Third person, past tense. No dialogue. Vivid and specific."
    )
    try:
        resp = httpx.post(
            f"{GEMINI_URL}?key={gemini_key}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.85, "maxOutputTokens": 80},
            },
            timeout=6.0,
        )
        if not resp.is_success:
            return None
        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Take first sentence only
        sentence = raw.split("\n")[0].strip()
        return sentence[:220] if sentence else None
    except Exception:
        return None


def simulate(
    npcs: List[NpcSnapshot],
    relationships: List[RelationshipEdge],
    rag_events: List[str],
    regional: RegionalSnapshot,
    season: str,
    world_time: int,
    gemini_key: Optional[str],
) -> List[NpcEvent]:
    """Return one NpcEvent per NPC."""
    # Build fast relationship lookup for sentiment delta computation
    rel_map: dict[Tuple[str, str], float] = {}
    for r in relationships:
        rel_map[(r.from_id, r.to_id)] = r.sentiment
        rel_map[(r.to_id, r.from_id)] = r.sentiment

    events: List[NpcEvent] = []

    for idx, npc in enumerate(npcs):
        state = _npc_state(npc, regional)
        action, memory, loc_change = _heuristic_action(npc, state, season)

        # Rotating Gemini enrichment: every 5th NPC gets prose
        if gemini_key and (world_time + idx) % 5 == 0:
            gemini_prose = _gemini_action(npc, state, season, gemini_key)
            if gemini_prose:
                action = gemini_prose
                memory = gemini_prose[:120]

        # Sentiment deltas: stressed NPCs drift toward allies, away from rivals
        sentiment_deltas: dict[str, float] = {}
        if state == "stressed":
            for other_npc in npcs:
                if other_npc.id == npc.id:
                    continue
                existing = rel_map.get((npc.id, other_npc.id), 0.0)
                if abs(existing) > 30:
                    delta = 2.0 if existing > 0 else -2.0
                    sentiment_deltas[other_npc.id] = delta

        events.append(NpcEvent(
            npcId=npc.id,
            todayAction=action,
            memoryEvent=memory,
            sentimentDeltas=sentiment_deltas,
            locationChange=loc_change,
        ))

    return events
