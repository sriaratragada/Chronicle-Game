// Gemini-powered NPC dialogue and life simulation
// Requires VITE_GEMINI_API_KEY in environment
// Optional: VITE_RAG_SERVICE_URL enables semantic retrieval of relevant events/memories

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface NpcContext {
  npcName: string;
  npcJob: string;
  npcPersonality: string;
  location: string;
  continent: string;
  season: string;
  weather: string;
  dayPhase: string;
  playerReputation: Record<string, number>;
  npcDisposition: number;
  npcMemories: string[];
  recentChronicle: string[];
  worldEvents: string[];
  /** Overworld tile and time-of-day hint for grounded dialogue. */
  tileSummary?: string;
  /** Current NPC goals (top 2) for goal-aware responses. */
  npcGoals?: string[];
  /** Top NPC relationships for relationship-aware responses. */
  npcRelationships?: string[];
  /** Faction the NPC belongs to. */
  factionAllegiance?: string;
  /** Recent world crisis summary. */
  recentWorldCrisis?: string;
}

interface DialogueResponse {
  npcText: string;
  options: { text: string; effects?: { reputation?: Record<string, number>; disposition?: number } }[];
}

interface LifeDecision {
  action: string;
  reason: string;
}

interface RagContext {
  events: string[];
  memories: string[];
}

const responseCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

function getApiKey(): string | null {
  return (import.meta as any).env?.VITE_GEMINI_API_KEY ?? null;
}

function getRagServiceUrl(): string | null {
  return (import.meta as any).env?.VITE_RAG_SERVICE_URL ?? null;
}

/**
 * Fetch semantically relevant world events and NPC memories from the RAG
 * microservice.  Returns null silently when the service is not configured or
 * unreachable so the caller can fall back to the slice-based defaults.
 */
async function fetchRagContext(
  query: string,
  npcId: string,
  topKEvents = 6,
  topKMemories = 4,
): Promise<RagContext | null> {
  const baseUrl = getRagServiceUrl();
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        npcId,
        topKEvents,
        topKMemories,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return {
      events: Array.isArray(json.events) ? json.events : [],
      memories: Array.isArray(json.memories) ? json.memories : [],
    };
  } catch {
    return null;
  }
}

/**
 * Push a batch of sim events and NPC memories to the RAG service for
 * indexing.  This is fire-and-forget — errors are swallowed so game flow is
 * never blocked.
 */
export async function ingestRagContext(
  simEvents: {
    eventId: string;
    summary: string;
    category: string;
    season: string;
    gameTick: number;
    worldTime: number;
    source: string;
    visibility: string;
    deltasPreview?: string;
  }[],
  npcMemories: {
    npcId: string;
    event: string;
    tick: number;
    sentiment: string;
  }[],
): Promise<void> {
  const baseUrl = getRagServiceUrl();
  if (!baseUrl) return;

  try {
    await fetch(`${baseUrl}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simEvents, npcMemories }),
    });
  } catch {
    // Intentionally silent — ingest failures must not affect gameplay
  }
}

async function callGemini(prompt: string, cacheKey?: string): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
  }

  try {
    const res = await fetch(`${API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 500 },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    if (text && cacheKey) responseCache.set(cacheKey, { data: text, timestamp: Date.now() });
    return text;
  } catch {
    return null;
  }
}

function buildDialoguePrompt(ctx: NpcContext): string {
  const goalLine = ctx.npcGoals?.length ? `\nYour current preoccupation: ${ctx.npcGoals.slice(0, 2).join('; ')}` : '';
  const relLine = ctx.npcRelationships?.length ? `\nYour notable relationships: ${ctx.npcRelationships.join(', ')}` : '';
  const factionLine = ctx.factionAllegiance ? `\nFaction allegiance: ${ctx.factionAllegiance}` : '';
  const crisisLine = ctx.recentWorldCrisis ? `\nCurrent crisis in the realm: ${ctx.recentWorldCrisis}` : '';
  return `You are ${ctx.npcName}, a ${ctx.npcJob} in the medieval fantasy settlement of ${ctx.location} on the continent of ${ctx.continent}.

Personality: ${ctx.npcPersonality}
Current disposition toward the player: ${ctx.npcDisposition > 10 ? 'friendly' : ctx.npcDisposition < -10 ? 'hostile' : 'neutral'} (${ctx.npcDisposition}/100)
Season: ${ctx.season}, Weather: ${ctx.weather}, Time: ${ctx.dayPhase}${factionLine}${goalLine}${relLine}${crisisLine}

Your memories of the player: ${ctx.npcMemories.length > 0 ? ctx.npcMemories.join('; ') : 'None — first meeting'}

Where you meet: ${ctx.tileSummary ?? 'Along the road nearby'}

Recent world events: ${ctx.worldEvents.slice(-3).join('; ') || 'Nothing notable'}

The player approaches and speaks to you. Respond in character with 1-3 sentences of dialogue, then provide exactly 3 response options the player can choose.

Format your response EXACTLY as:
DIALOGUE: [your spoken text]
OPTION1: [option text]
OPTION2: [option text]
OPTION3: [option text]`;
}

export async function generateNpcDialogue(ctx: NpcContext, npcId?: string): Promise<DialogueResponse | null> {
  // Attempt to enrich context via the RAG service before building the prompt.
  // Falls back to the original slice-based arrays when RAG is unavailable.
  if (npcId) {
    const ragQuery = `${ctx.npcName} ${ctx.npcJob} in ${ctx.location} player approaches`;
    const rag = await fetchRagContext(ragQuery, npcId);
    if (rag) {
      if (rag.events.length > 0) ctx.worldEvents = rag.events;
      if (rag.memories.length > 0) ctx.npcMemories = rag.memories;
    }
  }

  const prompt = buildDialoguePrompt(ctx);
  const dispBucket = ctx.npcDisposition > 50 ? 'hi' : ctx.npcDisposition < -20 ? 'lo' : 'mid';
  const goalBucket = ctx.npcGoals?.[0]?.slice(0, 20) ?? '';
  const cacheKey = `dlg_${ctx.npcName}_${ctx.dayPhase}_${dispBucket}_${goalBucket}_${Math.floor(Date.now() / 30000)}`;
  const raw = await callGemini(prompt, cacheKey);
  if (!raw) return null;

  try {
    const dialogueLine = raw.match(/DIALOGUE:\s*(.+)/)?.[1]?.trim() ?? raw.split('\n')[0];
    const options: DialogueResponse['options'] = [];
    for (let i = 1; i <= 3; i++) {
      const match = raw.match(new RegExp(`OPTION${i}:\\s*(.+)`))?.[1]?.trim();
      if (match) options.push({ text: match });
    }
    if (options.length === 0) options.push({ text: 'Farewell.' });
    return { npcText: dialogueLine, options };
  } catch {
    return null;
  }
}

export async function generateNpcLifeDecision(
  npcName: string, npcJob: string, location: string, worldState: string
): Promise<LifeDecision | null> {
  const prompt = `You are ${npcName}, a ${npcJob} in ${location} in a medieval fantasy world.

Current world state: ${worldState}

Based on your job and the current situation, what do you do today? Answer in 1 sentence.

Format: ACTION: [what you do] REASON: [why]`;

  const cacheKey = `life_${npcName}_${Math.floor(Date.now() / 120000)}`;
  const raw = await callGemini(prompt, cacheKey);
  if (!raw) return null;

  try {
    const action = raw.match(/ACTION:\s*(.+?)(?:REASON:|$)/)?.[1]?.trim() ?? 'Continue working';
    const reason = raw.match(/REASON:\s*(.+)/)?.[1]?.trim() ?? '';
    return { action, reason };
  } catch {
    return null;
  }
}

export async function generateGossip(
  npcName: string, location: string, playerTitle: string, playerReputation: Record<string, number>, recentEvents: string[]
): Promise<string | null> {
  const topRep = Object.entries(playerReputation).sort(([, a], [, b]) => b - a)[0];
  const prompt = `You are a gossip NPC in the medieval settlement of ${location}. The player is known as "${playerTitle}" with a reputation for ${topRep?.[0] ?? 'nothing'}.

Recent events: ${recentEvents.slice(-3).join('; ') || 'Nothing of note'}

Generate one brief piece of gossip (1-2 sentences) about the player or the world. Be colorful and medieval-flavored.`;

  const cacheKey = `gossip_${location}_${Math.floor(Date.now() / 60000)}`;
  return await callGemini(prompt, cacheKey);
}

export function isGeminiConfigured(): boolean {
  return getApiKey() !== null;
}
