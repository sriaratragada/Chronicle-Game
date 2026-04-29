# Chronicle RAG Service

A lightweight Python microservice that gives NPC agents a **bounded, semantically relevant context window** by retrieving the most pertinent world events and NPC memories from a [ChromaDB](https://www.trychroma.com/) vector store.

It replaces the naive `slice(-3)` / `slice(-5)` in `geminiNpc.ts` with a semantic search that surfaces only the handful of events most relevant to the NPC's role and the player's current dialogue intent — keeping Gemini prompts lean and historically consistent regardless of how large the simulation event log grows.

---

## Architecture

```
Browser (geminiNpc.ts)
  │
  │  POST /ingest  (fire-and-forget, background)
  │  POST /retrieve (before every Gemini call)
  ▼
RAG Service (FastAPI + uvicorn)
  ├── ChromaDB (embedded, PersistentClient → ./chroma_data/)
  │     ├── sim_events    collection
  │     └── npc_memories  collection
  └── sentence-transformers  all-MiniLM-L6-v2  (~80 MB, CPU-friendly)
```

---

## Quick Start

```bash
cd rag_service
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8787
```

The service starts at `http://localhost:8787`.  
Set `VITE_RAG_SERVICE_URL=http://localhost:8787` in the game's `.env` file to enable it.

---

## API Reference

### `GET /health`

Returns `{"status": "ok"}` when the service is running.

---

### `POST /ingest`

Accepts a batch of sim events and NPC memories exported from the Zustand store. The game calls this fire-and-forget in the background whenever the simulation event log grows.

**Request body**

```jsonc
{
  "simEvents": [
    {
      "eventId": "sim_123_4_0",
      "summary": "Korrath has declared war on Vell. The realm trembles.",
      "category": "faction",
      "season": "harvest",
      "gameTick": 4,
      "worldTime": 123,
      "source": "world_tick",
      "visibility": "chronicle",
      "deltasPreview": "faction:atWar 0→1"   // optional
    }
  ],
  "npcMemories": [
    {
      "npcId": "innkeeper_bryndal",
      "event": "Player helped defend the inn from bandits",
      "tick": 42,
      "sentiment": "positive"
    }
  ]
}
```

**Response**

```json
{ "ingested_events": 1, "ingested_memories": 1 }
```

Upserts are idempotent — re-sending the same `eventId` simply overwrites the stored document.

---

### `POST /retrieve`

Returns the top-K semantically closest world events and NPC memories for a given query string assembled from NPC role + player dialogue intent.

**Request body**

```jsonc
{
  "npcId": "innkeeper_bryndal",
  "query": "innkeeper player asks about recent war news",
  "topKEvents": 6,
  "topKMemories": 4,
  "filters": {
    "category": ["faction", "economy"],   // optional
    "season": "harvest"                   // optional
  }
}
```

**Response**

```jsonc
{
  "events": [
    "Korrath has declared war on Vell. The realm trembles. [faction:atWar 0→1]",
    "Across the kingdoms, treasuries and musters shift with the day."
    // …up to topKEvents entries
  ],
  "memories": [
    "Player helped defend the inn from bandits"
    // …up to topKMemories entries (always NPC-scoped)
  ]
}
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `RAG_PORT` | `8787` | Port the uvicorn server listens on |
| `RAG_ALLOW_ORIGIN` | `http://localhost:5173` | CORS origin for the Vite dev server |

---

## Production Notes

- **ChromaDB mode**: The default `PersistentClient(path="./chroma_data")` stores vectors on disk alongside the service. For multi-instance or cloud deployments, replace it with `chromadb.HttpClient(host=..., port=...)` in `chroma_store.py`.
- **Embedding model**: `all-MiniLM-L6-v2` is ~80 MB and runs entirely on CPU. It is downloaded automatically on first startup via `sentence-transformers`.
- **Fallback safety**: If `VITE_RAG_SERVICE_URL` is unset or the service is unreachable, `geminiNpc.ts` falls back to its original slice-based context — no regression for players who do not run the service.
