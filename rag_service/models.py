"""Shared Pydantic models for the World Brain /world/tick endpoint."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class FactionSnapshot(BaseModel):
    id: str
    name: str
    treasury: float
    army_size: int = Field(..., alias="armySize")
    territory: List[str] = []
    at_war_with: List[str] = Field(default_factory=list, alias="atWarWith")
    morale: float
    model_config = {"populate_by_name": True}


class NpcSnapshot(BaseModel):
    id: str
    name: str
    title: str
    location: str
    faction: str
    personality: str
    disposition: float
    model_config = {"populate_by_name": True}


class RelationshipEdge(BaseModel):
    from_id: str = Field(..., alias="fromId")
    to_id: str = Field(..., alias="toId")
    sentiment: float
    interactions: int
    model_config = {"populate_by_name": True}


class MarketItemSnapshot(BaseModel):
    item_id: str = Field(..., alias="itemId")
    stock: int
    price_multiplier: float = Field(..., alias="priceMultiplier")
    model_config = {"populate_by_name": True}


class MarketSnapshot(BaseModel):
    location_id: str = Field(..., alias="locationId")
    items: List[MarketItemSnapshot] = []
    model_config = {"populate_by_name": True}


class RegionalSnapshot(BaseModel):
    war_tension: float = Field(0.0, alias="warTension")
    drought: float = 0.0
    bandit_pressure: float = Field(0.0, alias="banditPressure")
    storm_severity: float = Field(0.0, alias="stormSeverity")
    model_config = {"populate_by_name": True}


class WorldTickRequest(BaseModel):
    world_time: int = Field(..., alias="worldTime")
    season: str
    factions: List[FactionSnapshot] = []
    npcs: List[NpcSnapshot] = []
    relationships: List[RelationshipEdge] = []
    markets: List[MarketSnapshot] = []
    regional: RegionalSnapshot = Field(default_factory=RegionalSnapshot)
    player_rep: dict = Field(default_factory=dict, alias="playerRep")
    current_location: str = Field("", alias="currentLocation")
    recent_chronicle: List[str] = Field(default_factory=list, alias="recentChronicle")
    model_config = {"populate_by_name": True}


class FactionDecision(BaseModel):
    faction_id: str = Field(..., alias="factionId")
    action: Literal["declare_war", "make_peace", "send_trade", "fortify", "none"]
    target_id: Optional[str] = Field(None, alias="targetId")
    reason: str
    confidence: float = 0.7
    model_config = {"populate_by_name": True}


class NpcEvent(BaseModel):
    npc_id: str = Field(..., alias="npcId")
    today_action: str = Field(..., alias="todayAction")
    memory_event: str = Field(..., alias="memoryEvent")
    sentiment_deltas: dict = Field(default_factory=dict, alias="sentimentDeltas")
    location_change: Optional[str] = Field(None, alias="locationChange")
    model_config = {"populate_by_name": True}


class EconomyAdjustment(BaseModel):
    location_id: str = Field(..., alias="locationId")
    item_id: str = Field(..., alias="itemId")
    price_delta: float = Field(..., alias="priceDelta")
    stock_delta: int = Field(..., alias="stockDelta")
    reason: str
    model_config = {"populate_by_name": True}


class NarrativeEvent(BaseModel):
    title: str
    chronicle_text: str = Field(..., alias="chronicleText")
    type: Literal["faction", "npc", "world", "crisis"]
    model_config = {"populate_by_name": True}


class WorldTickResponse(BaseModel):
    faction_decisions: List[FactionDecision] = Field(default_factory=list, alias="factionDecisions")
    npc_events: List[NpcEvent] = Field(default_factory=list, alias="npcEvents")
    economy_adjustments: List[EconomyAdjustment] = Field(default_factory=list, alias="economyAdjustments")
    narrative_event: Optional[NarrativeEvent] = Field(None, alias="narrativeEvent")
    model_config = {"populate_by_name": True}
