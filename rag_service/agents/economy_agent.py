"""Economy agent: NetworkX trade-flow graph + regional shock propagation.

No LLM required — purely graph math. For each item across all market nodes,
computes price gradients along trade edges and simulates stock transfers.
Regional modifiers (drought, storms, bandits) apply additive shocks.
"""
from __future__ import annotations

from typing import List

import networkx as nx

from models import EconomyAdjustment, MarketSnapshot, RegionalSnapshot, RelationshipEdge

# ---------------------------------------------------------------------------
# Trade network — mirrors TypeScript TRADE_CONNECTIONS for Auredia + contested
# ---------------------------------------------------------------------------

AUREDIA_EDGES = [
    ("highmarch", "ashenford"),
    ("highmarch", "millhaven"),
    ("highmarch", "graygate"),
    ("highmarch", "brightwater"),
    ("ashenford", "crossroads"),
    ("ashenford", "saltmoor"),
    ("saltmoor", "graygate"),
    ("saltmoor", "oakshire"),
    ("ironhold", "crossroads"),
    ("ironhold", "coldpeak"),
    ("ironhold", "brightwater"),
    ("thornwick", "graygate"),
    ("thornwick", "goldcrest"),
    ("graygate", "oakshire"),
    ("graygate", "goldcrest"),
    ("crossroads", "millhaven"),
    ("brightwater", "millhaven"),
    # Trivalen connections
    ("emberhaven", "duskwall"),
    ("emberhaven", "ashfeld"),
    ("duskwall", "stonemarsh"),
    ("stonemarsh", "ashfeld"),
]

# Edge weights: 1.0 baseline; key trade highways get higher flow rates
_BASE_WEIGHTS: dict[frozenset, float] = {frozenset(e): 1.0 for e in AUREDIA_EDGES}
_BASE_WEIGHTS[frozenset(("ashenford", "saltmoor"))] = 1.4   # coastal highway
_BASE_WEIGHTS[frozenset(("highmarch", "graygate"))] = 1.3   # capital artery
_BASE_WEIGHTS[frozenset(("saltmoor", "graygate"))] = 1.2    # port-to-crossroads
_BASE_WEIGHTS[frozenset(("ashenford", "crossroads"))] = 1.2

FLOW_THRESHOLD = 0.12   # price multiplier diff that triggers stock movement
FLOW_RATE = 0.4         # fraction of gap converted to stock units per sync

# Regional shock item sets
_DROUGHT_ITEMS = {"bread", "herb", "grain", "flour"}
_STORM_ITEMS = {"fish", "salt"}
_BANDIT_ITEMS = {"spice", "silk", "cloth", "gold_ore"}


def model_trade_flow(
    markets: List[MarketSnapshot],
    regional: RegionalSnapshot,
    relationships: List[RelationshipEdge],
) -> List[EconomyAdjustment]:
    """Return price/stock adjustments driven by trade flow and regional conditions."""
    if not markets:
        return []

    # Build market index: location_id -> {item_id -> MarketItemSnapshot}
    mkt_index: dict[str, dict] = {
        m.location_id: {item.item_id: item for item in m.items}
        for m in markets
    }
    known = set(mkt_index.keys())

    # Build NetworkX graph from known locations only
    G = nx.Graph()
    for (a, b) in AUREDIA_EDGES:
        if a in known and b in known:
            w = _BASE_WEIGHTS.get(frozenset((a, b)), 1.0)
            G.add_edge(a, b, weight=w)

    adjustments: List[EconomyAdjustment] = []
    all_items: set[str] = {
        item_id for items in mkt_index.values() for item_id in items
    }

    # ── Trade flow: for each item, propagate price signals along edges ──
    for item_id in all_items:
        for (a, b, data) in G.edges(data=True):
            item_a = mkt_index[a].get(item_id)
            item_b = mkt_index[b].get(item_id)
            if not item_a or not item_b:
                continue

            diff = item_a.price_multiplier - item_b.price_multiplier
            if abs(diff) < FLOW_THRESHOLD:
                continue

            w = data["weight"]
            flow = max(1, int(abs(diff) * FLOW_RATE * w * 10))

            # Stock flows from low-price (surplus) to high-price (deficit)
            src, dst = (b, a) if diff > 0 else (a, b)
            price_push = abs(diff) * 0.5
            reason = f"Trade flow: {item_id} {src}→{dst} (price gap {abs(diff):.2f})"

            adjustments.append(EconomyAdjustment(
                locationId=src, itemId=item_id,
                priceDelta=round(price_push * 0.3, 3),
                stockDelta=-flow,
                reason=reason,
            ))
            adjustments.append(EconomyAdjustment(
                locationId=dst, itemId=item_id,
                priceDelta=round(-price_push * 0.3, 3),
                stockDelta=flow,
                reason=reason,
            ))

    # ── Regional shocks ──
    for loc_id in known:
        for item_id in mkt_index[loc_id]:
            if item_id in _DROUGHT_ITEMS and regional.drought > 0.4:
                adjustments.append(EconomyAdjustment(
                    locationId=loc_id, itemId=item_id,
                    priceDelta=round(regional.drought * 0.2, 3),
                    stockDelta=-1,
                    reason=f"Drought drives {item_id} scarcity at {loc_id}",
                ))
            if item_id in _STORM_ITEMS and regional.storm_severity > 0.4:
                adjustments.append(EconomyAdjustment(
                    locationId=loc_id, itemId=item_id,
                    priceDelta=round(regional.storm_severity * 0.15, 3),
                    stockDelta=-1,
                    reason=f"Storm disrupts {item_id} supply at {loc_id}",
                ))
            if item_id in _BANDIT_ITEMS and regional.bandit_pressure > 0.45:
                adjustments.append(EconomyAdjustment(
                    locationId=loc_id, itemId=item_id,
                    priceDelta=round(regional.bandit_pressure * 0.12, 3),
                    stockDelta=0,
                    reason=f"Bandit pressure raises {item_id} prices at {loc_id}",
                ))

    return adjustments
