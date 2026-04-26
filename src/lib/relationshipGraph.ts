export interface RelationshipEdge {
  fromId: string;
  toId: string;
  sentiment: number;         // -100 to +100
  interactions: number;
  lastInteractionTick: number;
  sharedHistory: string[];   // capped at 10
}

type EdgeKey = string;
const graph = new Map<EdgeKey, RelationshipEdge>();

function edgeKey(a: string, b: string): EdgeKey {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getEdge(a: string, b: string): RelationshipEdge | undefined {
  return graph.get(edgeKey(a, b));
}

export function updateEdge(a: string, b: string, delta: number, event: string, tick: number): void {
  const key = edgeKey(a, b);
  const existing = graph.get(key);
  if (existing) {
    const newSentiment = Math.max(-100, Math.min(100, existing.sentiment + delta));
    const newHistory = [...existing.sharedHistory, event].slice(-10);
    graph.set(key, {
      ...existing,
      sentiment: newSentiment,
      interactions: existing.interactions + 1,
      lastInteractionTick: tick,
      sharedHistory: newHistory,
    });
  } else {
    graph.set(key, {
      fromId: a,
      toId: b,
      sentiment: Math.max(-100, Math.min(100, delta)),
      interactions: 1,
      lastInteractionTick: tick,
      sharedHistory: [event],
    });
  }
}

/** Decay relationships that haven't had interaction in 50+ ticks */
export function decayRelationships(currentTick: number): void {
  for (const [key, edge] of graph.entries()) {
    if (currentTick - edge.lastInteractionTick >= 50) {
      const decayed = edge.sentiment > 0
        ? Math.max(0, edge.sentiment - 1)
        : edge.sentiment < 0
          ? Math.min(0, edge.sentiment + 1)
          : 0;
      if (decayed === edge.sentiment) continue;
      graph.set(key, { ...edge, sentiment: decayed });
    }
  }
}

/** NPCs who have a positive relationship with npcId — they may hear rumors */
export function getRumorTargets(npcId: string): string[] {
  const targets: string[] = [];
  for (const edge of graph.values()) {
    if (edge.fromId === npcId && edge.sentiment > 20) targets.push(edge.toId);
    if (edge.toId === npcId && edge.sentiment > 20) targets.push(edge.fromId);
  }
  return targets;
}

/** Top relationships for a given NPC, sorted by absolute sentiment */
export function getTopRelationships(npcId: string, limit = 3): RelationshipEdge[] {
  const edges: RelationshipEdge[] = [];
  for (const edge of graph.values()) {
    if (edge.fromId === npcId || edge.toId === npcId) edges.push(edge);
  }
  return edges.sort((a, b) => Math.abs(b.sentiment) - Math.abs(a.sentiment)).slice(0, limit);
}

/** Describe relationships for Gemini context */
export function describeRelationships(npcId: string): string[] {
  return getTopRelationships(npcId).map(edge => {
    const otherId = edge.fromId === npcId ? edge.toId : edge.fromId;
    const tone = edge.sentiment > 50 ? 'close ally' : edge.sentiment > 20 ? 'trusted friend' : edge.sentiment < -50 ? 'bitter enemy' : edge.sentiment < -20 ? 'rival' : 'acquaintance';
    return `${tone} of ${otherId.replace(/_/g, ' ')}`;
  });
}

export function serializeGraph(): string {
  return JSON.stringify(Array.from(graph.entries()));
}

export function deserializeGraph(json: string): void {
  graph.clear();
  try {
    const entries = JSON.parse(json) as [string, RelationshipEdge][];
    for (const [key, edge] of entries) {
      graph.set(key, edge);
    }
  } catch {
    // Silent — graph starts fresh
  }
}

export function clearGraph(): void {
  graph.clear();
}
