# Chronicle of Aethermoor — agent context dictionary

Single reference for **what exists**, **how it fits together**, **performance contracts**, and **where to extend**. No API keys or secrets here.

---

## Project identity (plain terms)

- **What:** Browser-based top-down open-world RPG prototype: explore a huge tile map, settlements, hamlets, trade roads, combat, inventory, quests, chronicle, fog of war, optional AI dialogue (Gemini).
- **What it is not:** Not a multiplayer server game; not a 3D engine; not a full MMO backend. Saves are **localStorage** + JSON entity blob.

---

## Stack glossary (coding terms)

| Layer | Technology |
|--------|-------------|
| App shell | **React 18**, **TypeScript**, **Vite 5** |
| Global state | **Zustand** (`src/lib/gameStore.ts`) — one store, actions on the same object shape as `GameState` + methods |
| World map UI | **HTML5 Canvas** in `WorldMap.tsx` — `requestAnimationFrame` render loop, refs for hot paths (no React per frame for terrain) |
| Styling | **Tailwind**, shadcn/Radix primitives where used |
| Motion | **Framer Motion** on title/overlays |
| Map data | **Procedural** per chunk — no pre-baked 10k×10k array; `getChunkData(cx,cy)` caches chunks in `mapGenerator` |

---

## App routing (`src/pages/Index.tsx`)

- **`phase === 'title'`** → `TitleScreen` (menu + world preview canvas).
- **`phase === 'booting'`** → `BootingScreen` (spinner copy only; errors surface on title — see **bootError**).
- **Else** → `GameScreen` (playing, sailing, dungeon, battle, dead, etc. — all non-title phases share this shell).

---

## Game phases (`GameState.phase` in `gameTypes.ts`)

| Phase | Meaning |
|--------|---------|
| `title` | Menu; `startGame` allowed |
| `booting` | Between title and playing; heavy init split across rAFs |
| `playing` | Overworld |
| `sailing`, `dungeon`, `battle`, `dead`, `chronicle` | Specialized flows |

**World simulation** (`worldTicker`) is blocked when `worldTickBlocked(state)` is true (event modal, battle, dungeon, death, non-`none` overlay, etc.) — see `worldTicker.ts`.

---

## Boot pipeline (architecture)

**Goal:** Paint `BootingScreen` before long synchronous work; split work so the main thread can breathe; warm expensive caches before mass `getTileAt`.

**Entry:** `startGame()` in `gameStore.ts` — only from `phase === 'title'`; sets `phase: 'booting'`, `bootError: null`.

**Scheduling:** `scheduleAfterPaint(fn)` = **double `requestAnimationFrame`** (fallback `setTimeout`) so the booting UI gets one paint before work.

**Slice 1 — `bootstrapWorldGeometry()`**

1. `setSeed(42)` — clears chunk cache, road cache, **settlement layout caches**, wilderness POI caches, **hamlet cache** (`invalidateHamletCache` via `mapGenerator`).
2. `ensureRoads()` — builds global trade-road `Set` (Bresenham between `TRADE_CONNECTIONS`).
3. `warmSettlementRoadIndexes()` — exported from `settlementLayout.ts`; builds **union of all settlement-local road cells** once (`ensureUnionLocalRoads`) so later `getTileAt` → `isSettlementLocalRoad` does not pay first-hit O(all settlements) inside random code paths.
4. `void getHamlets()` — forces hamlet list build once (memoized module-side).

**Slice 2 — `buildFreshPlayingStatePayload()`**

- `initWorldEntities()` — spatial entities (boats, wildlife, NPCs, caravans, hamlet residents, etc.).
- Markets (`createMarkets`, `buildRoadInnMarkets(getRoadInnSites())`), fog `revealAroundPlayer(createFogMap(), …)`, full default `GameState` fields for a new game.
- Then **`startTicker()`** starts the world time interval.

**Errors:** Any throw in slice 1 or 2 sets `phase: 'title'`, **`bootError`** to message, logs stack in **DEV**. There is **no other code path** that sends the user back to title from boot except this catch (unless they never left title).

**UX:** `TitleScreen` shows a dismissible banner when `bootError` is set; `clearBootError()` clears it. `saveSystem.loadFromSlot` sets `bootError: null` when merging save; `saveToSlot` strips `clearBootError` from serialized state like other store methods.

---

## Settlement layout (`settlementLayout.ts`) — dictionary

| Symbol | Role |
|--------|------|
| `getSettlementLayoutCenter(id)` | Deterministic “layout center” off global roads; **cached per settlement id** in `layoutCenterCache`. |
| `collectRoadKeysForSettlement` | **Cached** in `roadKeysBySettlement`; heavy Bresenham + bbox lives in `buildRoadKeysForSettlementUncached`. |
| `getSettlementSidewalkPositions` | Walkable tiles near local roads for NPC placement; uses cached road keys. |
| `ensureUnionLocalRoads` | Single `Set` of all settlement-local road cell keys; lazy unless warmed. |
| `warmSettlementRoadIndexes()` | **Public** — forces union build; call during boot before entity/tile storms. |
| `invalidateSettlementRoadCache()` | Clears union + **both** per-settlement caches; invoked from `setSeed`. |
| `mergeSettlementLocalRoadsIntoChunk` / `isSettlementLocalRoad` | Chunk painting and `getTileAt` ROAD override. |

**Invariant:** After changing seed or anything that affects layout, caches must invalidate together (`setSeed` already chains this).

---

## Hamlets (`hamlets.ts`) — dictionary

| Symbol | Role |
|--------|------|
| `buildHamlets()` | Grid scan (stride **84**, min spacing 36) near global roads, cap **140** sites; uses `ensureRoads`, `getContinentAt`, `farFromNamedSettlements`. |
| `getHamlets()` | Memoized list; first call pays grid cost. |
| `invalidateHamletCache()` | Clears `_hamlets`; called from **`setSeed`** so hamlets stay coherent with new world seed. |
| `getExtendedLocationCoords()` | Named coords + all hamlet ids for travel/discovery UI. |
| `isHamletId(id)` | `id.startsWith('hamlet_')`. |
| `mergeHamletChunkRoads` | Called from chunk generator for road bitmask + spur art. |

---

## Map generator (`mapGenerator.ts`) — dictionary

| Symbol | Role |
|--------|------|
| `getChunkData(cx,cy)` | Lazy generate + cache `ChunkData` (tiles, roads bitmask, objects, ambient entities). |
| `getTileAt(x,y)` | Chunk tile + **global** road set + **`isSettlementLocalRoad`** (union). |
| `ensureRoads()` | Cached `Set<number>` of global road cell indices. |
| `setSeed(n)` | Resets **all** seed-dependent caches (chunks, roads, settlement caches, wilderness caches, **hamlets**). |
| `sampleBaseTerrainCode` / `computeTile` | Biome / continent noise; expensive per call. |

---

## World ticker (`worldTicker.ts`) — dictionary

| Concept | Behavior |
|---------|----------|
| Default rate | `setInterval(onTick, ~1500ms)`. |
| `onTick` | Schedules `requestAnimationFrame(runWorldTickPipeline)`. |
| `runWorldTickPipeline` | **Nested rAFs:** (1) light frame schedules (2) `computeWorldTickPhaseA` (economy/weather/quests…), (3) inner rAF runs `runWorldTickPhaseB` + `applyWorldTickPatch`. Spreads heavy work across frames. |
| Phase A | `tickWeather`, hunger, markets (periodic), factions, bounty refresh, quest step updates, etc. |
| Phase B | Caravans, NPC schedules, cooking fires, caravan deliveries, aggro/move enemies, animals flee, periodic **resource spawns** (`newWorldTime % 20`). |
| Wildlife respawn | `respawnWildlifeFarFrom` on `% 100` worldTime in a **further** deferred rAF. |
| `applyWorldTickPatch` | Partial `useGameStore.setState` with chronicle cap (`CHRONICLE_CAP`). Also merges **`simEventLog`** via `appendSimEvents` (`SIM_EVENT_CAP` in `simulationEvents.ts`): tick diffs (regional, markets at visited + current location, faction day tick) plus phase-B extras (e.g. escort pay). `simEventsToChronicleEntries` appends `type: 'sim'` chronicle rows for `visibility: 'chronicle'` events. |

**Simulation event spine (`simulationEvents.ts`, `gameTypes.ts` — `SimEvent`, `simEventLog`):**

- **Purpose:** Structured append-only log for progression, causality, future graph edges, and LLM context. Player shop buy/sell records `source: 'player'` trade events.
- **Caps:** `SIM_EVENT_CAP` (trim oldest). Schema field `schemaVersion` on each event for migrations.
- **Progression stub:** `progressionRegistry.ts` — `evaluateMilestones` returns `[]` until milestone tables land; `GameState.progressionVersion` and `milestonesUnlocked` persist with saves.

**Performance:** Do not add full scans over `entityById` in tick paths; use `entitiesByKind` / spatial queries.

---

## World entities (`worldEntities.ts`) — dictionary

| Symbol | Role |
|--------|------|
| `spatialHash` | `Map<chunkKey, WorldEntity[]>` for proximity. |
| `entityById` | `Map<id, WorldEntity>`. |
| `entitiesByKind` | **`Map<EntityKind, WorldEntity[]>`** — updated in `spawnEntity` / `removeEntity`; **`getEntitiesByKind`** returns a **copy** so loops that `removeEntity` stay safe. |
| `scheduleNpcBucket` | Only `settlement_npc` + `hamlet_npc` for **`tickWorldNpcSchedules`** (round-robin, `NPC_SCHEDULE_BUDGET` per tick). |
| `registerEntityIndexes` / `unregisterEntityIndexes` | Internal; **`deserializeEntities`** must register same way as spawn. |
| `tickCaravanMovement` | Iterates **caravan** bucket only (not all entities). |
| `respawnWildlifeFarFrom` | Ring sampling, capped attempts, cheap terrain rejects. |
| `initWorldEntities` | Full world entity bootstrap (runs in boot slice 2). |

---

## Fog (`fogOfWar.ts`) — dictionary

- Fog is **per chunk metadata**, `Uint8Array` length `NUM_CX * NUM_CY` (not per-tile megagrid).
- `createFogMap()`, `revealAroundPlayer`, `revealLocation`, `getRevealLevel` — used by map rendering and `movePlayer`.

---

## Economy / world POI (`economySystem.ts`, `wildernessPoi.ts`)

- `createMarkets` — per named settlement with meta.
- `getRoadInnSites` — cached trail inns along long trade polylines (`computeRoadInnSitesInternal`); invalidated with seed-related flows via `invalidateWildernessCaches` from `setSeed`.

---

## Save system (`saveSystem.ts`) — dictionary

- **Slots:** `localStorage` keys `chronicle_save_slot_*`, max 4 slots.
- **Payload:** `{ version, timestamp, state, entities }` — `state` is store minus functions; **`entities`** from `serializeEntities()`. Current **`version`** constant: `SAVE_DATA_VERSION` in `saveSystem.ts` (increment when new persisted fields need defaults).
- **Load:** `deserializeEntities` then `setState` merge; **`bootError` forced null** after merge. Missing **`simEventLog`**, **`progressionVersion`**, or **`milestonesUnlocked`** are defaulted for older JSON saves.

---

## UI surface map (files)

| File | Responsibility |
|------|----------------|
| `Index.tsx` | Phase switch title / booting / game. |
| `TitleScreen.tsx` | New game, preview canvas, **boot error banner**, keyboard Enter/Space. |
| `BootingScreen.tsx` | Copy-only loading state. |
| `GameScreen.tsx` | Overlays, tutorial, phase-specific panels. |
| `WorldMap.tsx` | Canvas loop, movement interval, fog, chunk bake cache, input. |
| `HudBar.tsx` | HUD; prefers narrow Zustand selectors where tuned. |
| `Minimap.tsx` | Terrain sample, roads, locations, hamlets, entities. |
| `OverlayPanel.tsx` | Overlay router. |
| `ChronicleView.tsx` | Chronicle UI; entries with **`eventId`** expand to show linked **`SimEvent.deltas`** from `simEventLog`. |

---

## Optional Gemini (`geminiNpc.ts`)

- Env: `VITE_GEMINI_API_KEY`. Used to enrich hamlet dialogue from `interactEntity` when configured. Never commit secrets; `.env.example` documents.

---

## Temporary debug instrumentation (optional cleanup)

Some files still contain **folded `#region agent log`** blocks posting NDJSON to a local ingest URL (`127.0.0.1:7891`) and/or logging slow `movePlayer` / rAF gaps. Safe to remove when performance work is settled; does not affect production logic beyond tiny `fetch` no-ops.

**Files:** `worldTicker.ts`, `gameStore.ts` (`movePlayer`), `WorldMap.tsx` (large rAF gap).

---

## Extension points (where features grow)

| Want to add… | Touch |
|--------------|--------|
| New `EntityKind` | `worldEntities.ts` (spawn/remove + **kind bucket** + draw in `WorldMap` + combat/interaction filters) |
| New settlement / POI | `SETTLEMENTS` / `LOCATION_COORDS` / `gameData` events / `settlementLayout` if layout roads needed |
| New overlay | `OverlayType` in `gameTypes.ts`, `OverlayPanel`, `GameScreen` |
| New world-time behavior | `worldTicker.ts` phase A or B; respect `worldTickBlocked` |
| New save fields | `saveToSlot` strip list + migration if `version` bumps |

---

## Future scope (not built yet — product direction)

Reasonable **next** directions (none guaranteed in repo):

- **Stronger boot UX:** Progress text per slice, optional third rAF if profiling shows one step still dominates.
- **Runtime sim caps:** Global cap or GC for periodic **resource** entities spawned near player; prevents unbounded `getEntitiesNear` density in one chunk over long sessions.
- **Worker / incremental chunk pipeline:** Off-main-thread chunk generation (large refactor).
- **Cloud saves / auth:** Would replace or augment `saveSystem.ts`.
- **Deeper quest / faction simulation:** More `gameData` + store slices; keep tick work budgeted.

**Out of scope for “small change” expectations:** rewriting the entire renderer, full MMO server, or replacing Zustand without a dedicated migration.

---

## Conventions for agents

- Prefer **small, focused diffs**; match existing naming and file layout.
- After **seed** or **road** changes, assume **settlement + hamlet caches must stay consistent** — use existing invalidation entry points.
- **New entity kinds** must update **both** spatial structures **and** `entitiesByKind` (+ `scheduleNpcBucket` if NPC-scheduled).
- **Boot failures** are surfaced via **`bootError`**; do not silently swallow errors in `startGame` without updating that contract.
