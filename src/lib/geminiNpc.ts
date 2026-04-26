// Gemini-powered NPC dialogue and life simulation
// Requires VITE_GEMINI_API_KEY in environment

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

const responseCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

function getApiKey(): string | null {
  return (import.meta as any).env?.VITE_GEMINI_API_KEY ?? null;
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

export async function generateNpcDialogue(ctx: NpcContext): Promise<DialogueResponse | null> {
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
