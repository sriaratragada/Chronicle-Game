"""Faction strategic AI agent.

Heuristic fallback always works. Gemini fires for every 4th faction when world
tension >= 0.4. Returns a FactionDecision per faction.

Thresholds mirror TypeScript factionAgent.ts constants:
  - Peace:  armySize < 20 OR treasury < 500 while at war
  - War:    NOT at war, treasury >= 2000, army ratio >= 1.4, morale >= 60
  - Trade:  NOT at war, treasury >= 3000
"""
from __future__ import annotations

import json
import re
from typing import List, Optional

import httpx

from models import FactionDecision, FactionSnapshot, RegionalSnapshot

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-2.0-flash:generateContent"
)

WAR_ADVANTAGE_RATIO = 1.4
WAR_TREASURY_MIN = 2000.0
WAR_TENSION_MIN = 0.4
WAR_MORALE_MIN = 60.0
PEACE_ARMY_MIN = 20
PEACE_TREASURY_MIN = 500.0
TRADE_TREASURY_MIN = 3000.0


def _heuristic(
    faction: FactionSnapshot,
    all_factions: List[FactionSnapshot],
) -> FactionDecision:
    at_war = len(faction.at_war_with) > 0

    # ── Seek peace if critically weakened ──
    if at_war and (
        faction.army_size < PEACE_ARMY_MIN or faction.treasury < PEACE_TREASURY_MIN
    ):
        enemy_id = faction.at_war_with[0]
        return FactionDecision(
            factionId=faction.id,
            action="make_peace",
            targetId=enemy_id,
            reason=(
                f"{faction.name} sues for peace — "
                f"treasury {faction.treasury:.0f}g, army {faction.army_size}"
            ),
            confidence=0.9,
        )

    # ── Declare war if dominant and world is tense ──
    if not at_war and faction.treasury >= WAR_TREASURY_MIN and faction.morale >= WAR_MORALE_MIN:
        for other in all_factions:
            if other.id == faction.id:
                continue
            if faction.id in other.at_war_with:
                continue
            ratio = faction.army_size / other.army_size if other.army_size > 0 else 99.0
            if ratio >= WAR_ADVANTAGE_RATIO:
                return FactionDecision(
                    factionId=faction.id,
                    action="declare_war",
                    targetId=other.id,
                    reason=(
                        f"{faction.name} sees strategic advantage over {other.name} "
                        f"(army ratio {ratio:.1f}×)"
                    ),
                    confidence=0.75,
                )

    # ── Send trade when flush ──
    if not at_war and faction.treasury >= TRADE_TREASURY_MIN:
        partners = sorted(
            [f for f in all_factions if f.id != faction.id and len(f.at_war_with) == 0],
            key=lambda f: f.treasury,
        )
        if partners:
            return FactionDecision(
                factionId=faction.id,
                action="send_trade",
                targetId=partners[0].id,
                reason=(
                    f"{faction.name} extends trade to {partners[0].name} "
                    f"to build goodwill"
                ),
                confidence=0.65,
            )

    return FactionDecision(
        factionId=faction.id,
        action="none",
        reason="No strategic action warranted this period",
        confidence=0.5,
    )


def _gemini_decision(
    faction: FactionSnapshot,
    all_factions: List[FactionSnapshot],
    rag_events: List[str],
    gemini_key: str,
) -> Optional[FactionDecision]:
    others_summary = "; ".join(
        f"{f.name}(treasury={f.treasury:.0f},army={f.army_size},atWar={f.at_war_with})"
        for f in all_factions
        if f.id != faction.id
    )
    events_block = "\n".join(f"- {e}" for e in rag_events[:6]) or "No recent events."

    prompt = f"""You are the strategic council of {faction.name} in a medieval fantasy realm.

Your faction state:
- Treasury: {faction.treasury:.0f} gold
- Army size: {faction.army_size} soldiers
- Morale: {faction.morale:.0f}/100
- Currently at war with: {faction.at_war_with or 'nobody'}
- Controlled territory: {faction.territory}

Other factions: {others_summary}

Recent world events:
{events_block}

Choose exactly one strategic action. Reply with ONLY valid JSON (no markdown, no explanation):
{{"action":"declare_war"|"make_peace"|"send_trade"|"fortify"|"none","targetId":"<faction id or null>","reason":"<one sentence>","confidence":0.0}}"""

    try:
        resp = httpx.post(
            f"{GEMINI_URL}?key={gemini_key}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.5, "maxOutputTokens": 200},
            },
            timeout=8.0,
        )
        if not resp.is_success:
            return None
        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        # Strip markdown fences
        raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
        data = json.loads(raw)
        action = data.get("action", "none")
        # Validate action is a known literal
        if action not in ("declare_war", "make_peace", "send_trade", "fortify", "none"):
            action = "none"
        return FactionDecision(
            factionId=faction.id,
            action=action,
            targetId=data.get("targetId") or None,
            reason=str(data.get("reason", "Strategic council deliberated."))[:200],
            confidence=float(data.get("confidence", 0.7)),
        )
    except Exception:
        return None


def decide(
    factions: List[FactionSnapshot],
    regional: RegionalSnapshot,
    rag_events: List[str],
    gemini_key: Optional[str],
) -> List[FactionDecision]:
    """Return one FactionDecision per faction."""
    decisions: List[FactionDecision] = []

    for i, faction in enumerate(factions):
        decision: Optional[FactionDecision] = None

        # Every 4th faction (rotating by index) gets a Gemini decision when tension is high
        use_gemini = (
            gemini_key is not None
            and i % 4 == 0
            and regional.war_tension >= WAR_TENSION_MIN
        )
        if use_gemini:
            decision = _gemini_decision(faction, factions, rag_events, gemini_key)

        if decision is None:
            decision = _heuristic(faction, factions)

        decisions.append(decision)

    return decisions
