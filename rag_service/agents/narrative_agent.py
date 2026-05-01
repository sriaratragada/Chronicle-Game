"""Narrative director agent.

Rate-limited to every 3rd world-brain sync (world_time % 3 == 0). Identifies
the most dramatically interesting current condition, calls Gemini to write
2 sentences of chronicle prose + a 5-word title. Returns None on any failure.
"""
from __future__ import annotations

import re
from typing import List, Optional

import httpx

from models import NarrativeEvent, WorldTickRequest

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-2.0-flash:generateContent"
)


def _most_dramatic_condition(req: WorldTickRequest) -> tuple[str, str]:
    """Return (condition_description, narrative_type)."""
    # 1. Active war takes highest priority
    for f in req.factions:
        if f.at_war_with:
            enemies = [e for e in req.factions if e.id in f.at_war_with]
            enemy_names = ", ".join(e.name for e in enemies[:2])
            return (
                f"{f.name} is at war with {enemy_names}",
                "faction",
            )
    # 2. Severe regional crises
    if req.regional.drought > 0.65:
        return (
            f"A devastating drought grips the realm (severity {req.regional.drought:.2f})",
            "crisis",
        )
    if req.regional.war_tension > 0.72:
        return (
            "War tension has reached a breaking point across the realm",
            "crisis",
        )
    if req.regional.bandit_pressure > 0.7:
        return (
            "Bandit warbands now threaten every road through Auredia",
            "world",
        )
    # 3. Economic extremes
    for m in req.markets:
        for item in m.items:
            if item.price_multiplier > 2.1:
                return (
                    f"Extreme scarcity: {item.item_id} prices have doubled at {m.location_id}",
                    "world",
                )
    # 4. Storm
    if req.regional.storm_severity > 0.6:
        return (
            f"A great storm lashes the coasts (severity {req.regional.storm_severity:.2f})",
            "world",
        )
    # 5. Default uneasy peace
    season_flavor = {
        "thaw": "the thaw's uncertain promise",
        "summer": "summer's long and watchful days",
        "harvest": "the harvest's anxious plenty",
        "dark": "the dark months' long shadows",
    }.get(req.season, "an uneasy quiet")
    return (f"The realm holds its breath during {season_flavor}", "world")


def generate_event(
    world_state: WorldTickRequest,
    rag_events: List[str],
    gemini_key: Optional[str],
) -> Optional[NarrativeEvent]:
    """Generate a narrative chronicle event, or return None."""
    # Rate-limit: fire every 3 world-brain syncs
    if world_state.world_time % 3 != 0:
        return None
    if not gemini_key:
        return None

    condition, event_type = _most_dramatic_condition(world_state)
    events_block = "\n".join(f"- {e}" for e in rag_events[:5]) or "Nothing recorded."

    prompt = f"""You are the official chronicler of the realm of Aethermoor, a medieval fantasy world.

Current situation: {condition}
Season: {world_state.season}
Recent world events:
{events_block}

Write a brief chronicle entry for this moment. Reply with ONLY:
TITLE: <5 words, dramatic>
TEXT: <exactly 2 vivid sentences, third person, past/present tense, no dialogue>"""

    try:
        resp = httpx.post(
            f"{GEMINI_URL}?key={gemini_key}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.9, "maxOutputTokens": 180},
            },
            timeout=10.0,
        )
        if not resp.is_success:
            return None

        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()

        title_match = re.search(r"TITLE:\s*(.+)", raw)
        text_match = re.search(r"TEXT:\s*(.+)", raw, re.DOTALL)

        title = (
            title_match.group(1).strip()[:80]
            if title_match
            else condition[:60]
        )
        chronicle_text = (
            text_match.group(1).strip().replace("\n", " ")[:320]
            if text_match
            else raw[:320]
        )

        return NarrativeEvent(
            title=title,
            chronicleText=chronicle_text,
            type=event_type,  # type: ignore[arg-type]
        )
    except Exception:
        return None
