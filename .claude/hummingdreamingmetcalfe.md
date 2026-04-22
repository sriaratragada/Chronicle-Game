# Massive World Redesign & Systems Overhaul

## Context

Current game (after commits through `5e4f731`) is a narrative location-hopping experience: a 6000×3000 world of 27 fixed locations spread across three continents, where ticks only advance when the player crosses a location proximity radius and events are static narrative choices. There is no autonomous world, no real combat, no crafting, no economy, no save system, and no equipment. The user wants a total overhaul: a 10,000×10,000 world with three visually and politically distinct continents, a boat-based cross-continent traversal system, a live world that evolves without the player (autonomous NPCs, economies, armies, weather, day/night), real inventory/equipment/crafting/combat, quests and bounties, faction warfare, skill trees, fog-of-war exploration, Terraria-style side-scrolling dungeons, and save/load. The intended outcome is to transform the project from a narrative tech demo into a systemic living-world RPG.

This plan is phased. Earlier phases are load-bearing for later ones, so they are built first with real (not stub) implementations; later phases layer on top. Because the system is enormous, a small number of features (full dungeon platformer physics, sound design, richest UI polish) land as working minimum viable implementations that are extensible rather than complete shippable products — called out explicitly where that applies.

## Architectural shifts

The following cross-cutting decisions drive everything:

1. **Lazy chunked world.** A 10,000×10,000 tile array is 100M bytes — too much to precompute. Replace the eager `generateWorldMap` approach with on-demand chunk generation keyed by `(chunkX, chunkY)`, backed by an LRU cache of ~1024 chunks (≈4MB). Tile biome is a pure function of `(x, y)` computed from noise + continent mask, so chunks can be regenerated deterministically from the seed.
2. **Real-time world ticker.** Replace "tick only on location entry" with a `setInterval`-driven world clock (default 1500 ms/tick, configurable). Every tick: day/night advances, weather mutates, NPC schedules advance, caravans move, economies update, armies march, quests decay. Player movement becomes smooth (free roam) and no longer drives ticks.
3. **World entities become first-class.** Introduce `WorldEntity` (caravans, patrols, armies, wild animals, bandits, bounties, placed boats) stored in a spatial hash keyed by chunk. They render, tick, and interact with the player.
4. **Inventory replaces hotbar.** A new `Inventory` structure has a 30-slot backpack plus 6 equipment slots (mainhand, offhand, helm, chest, legs, boots). The hotbar becomes a view into backpack slots 0–5.
5. **Mode-based phases.** `phase` gains `'dungeon'` (side-scroll) and `'sailing'` (boat) in addition to existing modes. Each phase has its own render + input path.
6. **Save is the full serialized store.** `localStorage` keys `save_slot_0..3` hold JSON of the Zustand state (minus regenerable data — the map is always regenerated from seed).

## Phase 1 — New world generation & map

**Goal:** A 10,000×10,000 world with three strongly-identified continents separated by sea, with named kingdoms, castles, roads, and settlements placed meaningfully rather than arbitrarily.

Files:
- [src/lib/mapGenerator.ts](src/lib/mapGenerator.ts) — rewrite. Change `MAP_W = 10000`, `MAP_H = 10000`. Replace eager `tiles: Uint8Array(MAP_W*MAP_H)` with a chunked provider:
  - `getTile(x, y): number` — noise + continent mask; deterministic
  - `getChunk(cx, cy): Uint8Array(CHUNK_SIZE*CHUNK_SIZE)` — filled once, cached LRU
  - Continent masks: 3 elliptical landmasses sitting in sea
- New continent layout:
  - **Auredia** (left, `x: 500..3800`, `y: 1000..8500`) — the Grand Kingdom. Temperate plains, oak forests, river network. Dense road network. Features the capital **Highmarch** (huge — ~40×40 tile footprint, multi-ring walls, 4 districts), 6 vassal castles with named noble houses, 15 villages, 8 towns. All under one flag.
  - **Trivalen** (center-right, `x: 4500..7500`, `y: 1000..8500`) — the Warring Continent. Three kingdoms: **Korrath** (north, mountains + iron), **Vell** (south, coast + grain), **Sarnak** (east, steppe + cavalry). Each has a capital castle, 3 frontier castles, 6–8 villages. Middle plains are contested with ruined castles and battlefields.
  - **Uloren** (far right, `x: 8200..9800`, `y: 500..9500`) — the Unexplored. Mist-shrouded; dense forest, unclimbed peaks. Only ~8 villages discoverable, hidden ruins, strange standing stones. Heavy fog of war; no roads.
  - Sea fills the rest.
- New `CONTINENT_FLAGS` palette per continent + per-kingdom, used when rendering castles/banners.
- New settlement metadata: `kingdomId`, `flag`, `garrisonSize`, `houseName` (Auredia houses), `allegiance`.
- `generateRoads()` — connects each kingdom's settlements by road tiles written into the tile array during chunk generation. Uses A* on passable terrain, cached per-route.
- `LOCATION_COORDS` rewritten to new continents; old location IDs renamed or repurposed. Keep `ashenford` only if it maps into Auredia. Migration note: all references in `gameData.ts` events must be updated.
- `src/lib/worldLore.ts` — extracted from `gameData.ts`, rewritten to reflect the new three-continent fiction.

[src/components/game/WorldMap.tsx](src/components/game/WorldMap.tsx) — rendering updates:
- Switch from precomputed chunk canvases to lazy chunk generation + render.
- Add castle-with-banner rendering for kingdom-tagged settlements (two-triangle flag flown in the kingdom's color).
- Draw kingdom borders as subtle dashed lines in contested/Trivalen regions.
- Camera-follow still applies; zoom range widened so player can see further (needed on a 10k map).
- Free-roam movement: remove the proximity-based tick trigger; movement is now continuous and doesn't tick the world (the ticker does).

**Verification:** Start dev server, load game, pan to each continent, confirm visual identity: Auredia feels unified with road web + banners, Trivalen shows three color regions, Uloren is dim and fogged. Seven-league boots debug key (temporary) used to fly camera across the map.

## Phase 2 — Boats & cross-continent travel

Files:
- [src/lib/worldEntities.ts](src/lib/worldEntities.ts) (new) — `WorldEntity` type and spatial-hash registry `EntityWorld`.
- Boats are `WorldEntity` of kind `boat`. Spawned at known dock tiles on each continent during world init. Player interacts with a boat via `E` key when within 1 tile; mounts it (`phase = 'sailing'`), and movement rules flip: deep water/water become walkable, grass becomes blocked. Disembark by pressing `E` on a sand/grass tile; spawns a boat entity there (so "leaving a boat near the end of a continent" literally persists).
- Boat icon rendered at entity position with a directional sprite.
- Keybind: when mounted, movement speed 2× on open water.

**Verification:** Walk to a dock on Auredia, press `E`, sail west to Trivalen, disembark, confirm boat icon remains; walk away, return, re-mount.

## Phase 3 — World ticker & time systems

Files:
- [src/lib/worldTicker.ts](src/lib/worldTicker.ts) (new) — owns `setInterval`; calls registered subsystems each tick: npcs, economy, weather, armies, quests, bounties. Tick rate 1500 ms, pauseable when modal open or phase `'dungeon'` (dungeon has its own faster loop).
- [src/lib/timeSystem.ts](src/lib/timeSystem.ts) (new) — `gameMinute`, `dayNightPhase` (dawn/day/dusk/night), 24 hours = 48 ticks (~72 s real time per in-game day). Exposes current-hour, lighting tint for `WorldMap`.
- [src/lib/weatherSystem.ts](src/lib/weatherSystem.ts) (new) — per-continent weather state machine (clear → cloudy → rain → storm; arid continents skew dry). Weather affects visibility radius, travel speed multiplier, farming yield, and some events.
- `GameState` gains: `worldTime`, `dayNightPhase`, `weather: Record<continentId, WeatherState>`, `tickRunning: boolean`.
- [src/components/game/WorldMap.tsx](src/components/game/WorldMap.tsx) applies day/night tint over the terrain + weather overlay (rain particles at low density).

**Verification:** Start game, watch HUD clock advance, confirm night-time screen dims, start a storm and see it clear after several ticks.

## Phase 4 — Inventory, equipment, crafting

Files:
- [src/lib/gameTypes.ts](src/lib/gameTypes.ts) — add:
  - `Inventory { slots: (Item | null)[30]; equipment: { mainhand, offhand, helm, chest, legs, boots, amulet } }`
  - `Item { id, name, icon, stack, type, statMods?, damage?, armor?, durability?, maxDurability? }`
  - `Recipe { id, inputs: {itemId, qty}[], output: {itemId, qty}, workbench?, skill?, minSkillLevel? }`
- [src/lib/items.ts](src/lib/items.ts) (new) — item catalog (~80 items: ores, woods, foods, tools, weapons, armors, potions, trade goods, trinkets).
- [src/lib/recipes.ts](src/lib/recipes.ts) (new) — ~40 recipes covering smelting, smithing, cooking, tailoring, fletching, alchemy.
- [src/lib/craftingSystem.ts](src/lib/craftingSystem.ts) (new) — `canCraft(state, recipeId)`, `craft(state, recipeId)`.
- [src/components/game/InventoryPanel.tsx](src/components/game/InventoryPanel.tsx) (new) — grid view with drag-to-equip, tooltip with stats.
- [src/components/game/CraftingPanel.tsx](src/components/game/CraftingPanel.tsx) (new) — recipe list filtered by nearby workbench, "Craft" button.
- [src/components/game/Hotbar.tsx](src/components/game/Hotbar.tsx) — bind to `inventory.slots[0..5]`.
- [src/lib/gameStore.ts](src/lib/gameStore.ts) — replace hotbar actions with inventory actions: `addItem`, `removeItem`, `equip`, `unequip`, `useItem`, `moveSlot`.

Migration: existing `hotbar` + `activeSlot` state deleted; `starter loadout` populates `inventory.slots`.

**Verification:** Loot flint from ground (Phase 5 will add actual gathering), open inventory with `I`, craft "wooden club" at no workbench, equip to mainhand, see weapon icon in HUD.

## Phase 5 — Resource gathering, combat, skills

Files:
- [src/lib/combatSystem.ts](src/lib/combatSystem.ts) (new) — turn-less tick-based real-time: when player presses attack (`J`) in a facing direction, damage = weaponDamage + skillBonus − targetArmor. Enemies on the ticker choose to approach/attack player within aggro radius.
- [src/lib/skills.ts](src/lib/skills.ts) (new) — `SkillTree = { combat, stealth, diplomacy, crafting }`. Each has XP, level, and 4–6 perks unlocked at levels 2/4/6/8/10. Perks apply stat multipliers when resolved.
- `WorldEntity` gains enemy kinds: `wolf`, `bandit`, `warband`, `deer`, `bear`. They spawn per-biome via a spawner that runs on the ticker.
- Resource nodes: `tree`, `rock`, `iron_ore`, `herb`, `berry_bush` are also `WorldEntity`s. Player presses `E` within range to gather; yields depend on equipped tool and crafting skill.
- [src/components/game/SkillPanel.tsx](src/components/game/SkillPanel.tsx) (new) — shows trees, XP bars, perk selection modal.
- HUD extended with equipped weapon icon, cooldown indicator, hotkey prompts.

**Verification:** Enter Trivalen contested plain, engage wolf (it chases), kill with club, loot meat, combat XP increases, level up, pick a perk.

## Phase 6 — Autonomous NPCs, economy, trade routes

Files:
- [src/lib/npcAI.ts](src/lib/npcAI.ts) (new) — per-NPC schedule: `job` (farmer, merchant, guard, innkeeper, smith, priest, sellsword, bandit, noble), `home`, `workplace`, daily routine keyed off `dayNightPhase`. `tickNpc(npc, world)` advances them — they physically move between tiles when visible on the same chunk; off-screen they use abstract state transitions for perf.
- Merchants belong to a caravan that travels along a **trade route**: list of `(fromLocation, toLocation, goods[])`. Routes generate from the settlement graph on world init.
- [src/lib/economySystem.ts](src/lib/economySystem.ts) (new) — each settlement has a `Market` with per-item `stock` and `price`. Each tick: farmers produce grain, miners produce ore, craftsmen convert ore → tools, merchants buy low/sell high which rebalances prices. Wars/droughts/blockades mutate regional production multipliers.
- Player can trade at any market via shop UI — prices respond to stock.
- [src/components/game/ShopPanel.tsx](src/components/game/ShopPanel.tsx) (new).
- NPC pathing: A* on local 64×64 chunk grid, memoized.

**Verification:** Park near a trade road in Auredia, watch a merchant caravan arrive at a village, prices on that village's grain drop after they offload; block a road with bandits (spawn manually), see caravan re-route or die.

## Phase 7 — Faction politics, armies, war simulation

Files:
- [src/lib/factionSystem.ts](src/lib/factionSystem.ts) (new) — Trivalen's three kingdoms have `treasury`, `armySize`, `territory: Set<locationId>`, `atWarWith: Set<factionId>`. Each world-day rolls diplomatic/military actions: raise taxes → increase army, march army to contested location, besiege, capture. Auredia is a single stable kingdom but can go to war with a Trivalen power under player action.
- Armies are large `WorldEntity` groups (a banner icon on map) with HP, size, morale. Moving slowly along roads. Player can observe, join, ambush.
- Territory is rendered on the map as a tinted region (Voronoi over kingdom-held locations).
- [src/components/game/FactionPanel.tsx](src/components/game/FactionPanel.tsx) (new) — summary of current wars, territory, player standing.

**Verification:** Advance the ticker 10 in-game days with a debug `>>` button; confirm at least one siege and one capture recorded in chronicle; faction panel updates.

## Phase 8 — Quests, bounties, sellsword flow

Files:
- [src/lib/questSystem.ts](src/lib/questSystem.ts) (new) — `Quest { id, title, giverNpcId, steps: QuestStep[], rewards, state }`. Steps: `goto`, `kill`, `fetch`, `talk`, `deliver`. State machine updates per relevant event.
- [src/lib/bountyBoard.ts](src/lib/bountyBoard.ts) (new) — each city has a bounty board. Bounties target named enemy NPCs (bandit leaders, enemy captains). Player takes one → tracks target's entity → kills → returns to board for gold + reputation. Bounties auto-generate from the economy/war simulation (a bandit gang raiding causes a bounty to spawn automatically).
- [src/components/game/QuestLog.tsx](src/components/game/QuestLog.tsx) (new) — active + completed + failed, with objective text.
- [src/components/game/DialogueView.tsx](src/components/game/DialogueView.tsx) (new) — branching dialogue trees with reputation-gated options; replaces the old static `EventPopup` for NPC talks. Existing location events still use `EventPopup`.
- Dialogue data: [src/lib/dialogue.ts](src/lib/dialogue.ts) (new) — authored trees for ~15 core NPCs + templated trees for job-type NPCs (generic farmer, guard, merchant).

**Verification:** Walk up to bounty board in Auredia capital, take "Silver Maw Bandit Chief" bounty, tracker arrow appears on map, find and kill target, return → gold and diplomacy rep rise.

## Phase 9 — Dungeons (Terraria-style side-scroll)

Files:
- [src/components/game/DungeonView.tsx](src/components/game/DungeonView.tsx) (new) — separate canvas component. 2D tile grid (800×400), gravity, jumping, pickaxe-digs-tile, ore veins, 2D enemies (slime, goblin, bat). Procedurally generated per cave ID from a seeded PRNG. Exit tile returns to overworld.
- [src/lib/dungeonGen.ts](src/lib/dungeonGen.ts) (new) — cellular-automata cave generation with ore placement biased by continent.
- Cave entrances are `WorldEntity` kind `cave_entrance` placed on mountain biomes during map gen. Pressing `E` switches phase to `'dungeon'`.
- The world ticker pauses while in dungeon; a local dungeon tick (60 FPS `requestAnimationFrame`) drives physics.
- Scope caveat: this ships as a minimum viable side-scroller — working gravity, mining, combat, exit — but not a full Terraria-clone. Extensible.

**Verification:** Enter a cave in Korrath's mountains, mine 5 iron ore, fight a slime, exit cave, confirm ore in inventory, overworld resumes.

## Phase 10 — Save/load, fog of war, minimap, housing

Files:
- [src/lib/saveSystem.ts](src/lib/saveSystem.ts) (new) — `saveToSlot(n)`, `loadFromSlot(n)`, `listSlots()`. Serializes state except regenerable chunk cache. Includes seed so the world rebuilds identically.
- [src/components/game/SaveLoadPanel.tsx](src/components/game/SaveLoadPanel.tsx) (new) — 4 slots, accessible from title screen + ESC menu.
- [src/lib/fogOfWar.ts](src/lib/fogOfWar.ts) (new) — per-chunk `revealLevel` (0 unseen, 1 discovered, 2 bright). Player's view radius reveals. Uloren chunks stay at level 1 even after first visit (heavy mist); only reaching settlements clears a small bright area.
- [src/components/game/Minimap.tsx](src/components/game/Minimap.tsx) (new) — 200×200 top-right canvas, shows revealed chunks tinted by biome + the player dot + known settlement icons.
- [src/lib/housing.ts](src/lib/housing.ts) (new) — each settlement exposes buyable plots. Player purchases → plot recorded in state. Entering the plot enters build mode: place furniture/workbench/bed entities from inventory. Minimum viable: one buyable plot per major city, furniture placement on a 16×16 grid, saved with state.
- [src/components/game/BuildPanel.tsx](src/components/game/BuildPanel.tsx) (new).

**Verification:** Save to slot 1, close tab, reload page, load slot 1 → exact same world position, inventory, quests, faction war state. Buy plot in Highmarch, place a crafting table, confirm crafting works there.

## Phase 11 — Sound & polish (scope-constrained)

Files:
- [src/lib/audio.ts](src/lib/audio.ts) (new) — thin `<audio>` wrapper with `playSfx(name)` and `playMusic(track)`. Tracks tied to continent + dayNightPhase. Uses a short list of free CC0 clips (paths only; assets themselves not checked in — `public/audio/` with `.gitkeep` + a README pointer). If no audio files present, silent no-op. **Caveat:** this phase ships code plumbing only; actual audio assets are out of scope for the engineering work.
- HUD polish: kingdom banner, time-of-day icon, weather icon, mini-status.

## Central state changes (superseding scattered notes above)

[src/lib/gameTypes.ts](src/lib/gameTypes.ts) `GameState` gains:

```
inventory: Inventory
skills: SkillTree
worldTime: number              // minutes since day 0
dayNightPhase: 'dawn'|'day'|'dusk'|'night'
weather: Record<ContinentId, WeatherState>
entities: WorldEntityRegistry  // serialized reference; runtime held in worldEntities.ts
quests: Quest[]
bounties: Bounty[]
markets: Record<LocationId, Market>
factionState: FactionState
fog: FogMap
housing: Housing
phase: 'title'|'playing'|'chronicle'|'dead'|'dungeon'|'sailing'
tickRunning: boolean
seed: number
```

`hotbar` and `activeSlot` removed. `reputation` + `factions` retained (existing 6 tracks/factions keep meaning; faction standings plumb into new `factionSystem.ts`).

## Files to read before starting execution

- [src/lib/gameStore.ts](src/lib/gameStore.ts) — existing tick semantics + how events, reputation, lore unlocks wire together. Pattern to preserve: chronicle entry construction.
- [src/lib/mapGenerator.ts](src/lib/mapGenerator.ts) — existing noise + biome mapping (reuse the `fbm`, `smoothNoise`, `hash` functions, tile codes, `HEX_PALETTES`).
- [src/components/game/WorldMap.tsx](src/components/game/WorldMap.tsx) — existing chunk-canvas render pipeline (pattern to preserve for the lazy chunk version).
- [src/lib/gameData.ts](src/lib/gameData.ts) — existing events referenced by old location IDs; rewrite/remap rather than delete so narrative feel is preserved.
- [src/components/game/Hotbar.tsx](src/components/game/Hotbar.tsx), [src/components/game/HudBar.tsx](src/components/game/HudBar.tsx) — keybind conventions to extend (1–6, H, E, etc.).
- [src/components/game/GameScreen.tsx](src/components/game/GameScreen.tsx) — top-level phase routing; `phase: 'dungeon'` branch plugs here.

## Execution order (practical)

Implement in the phase order above. Phases 1–3 form the new spine and must be working before any other phase will run. Phase 4 blocks 5. Phase 5 blocks 6. Phase 6 blocks 7 and 8. Phases 9 and 10 can proceed in parallel after 5. Phase 11 is last.

## Verification

End-to-end verification (run after every phase, with preview tools):

1. `bun install && bun run dev` (or `npm run dev` — check `package.json`).
2. Use `preview_start` to open the app, `preview_screenshot` to confirm visual expectations, `preview_console_logs` for errors.
3. Phase-specific verification checks listed at the end of each phase above.
4. Final full-game smoke test: title → start → move around Auredia → take a bounty → ride boat to Trivalen → fight a bandit → mine a cave → save → reload → state preserved.

## Explicit scope caveats

- **Dungeons (Phase 9)** land as a working minimum Terraria-style mode (gravity, mining, 1–2 enemy types, exit) — not a deep side-scroller game.
- **Audio (Phase 11)** lands as plumbing only; asset sourcing is out of scope.
- **Housing (Phase 10)** lands with one buyable plot per capital + basic furniture placement — not a full settlement builder.
- **NPC AI (Phase 6)** uses abstract off-screen state + full pathing only on loaded chunks, to keep performance viable on a 10k map.
- **Tile count.** 10,000×10,000 is generated lazily; at any time only ~1024 chunks (~1% of the world) are resident. Players will not notice, but the world is not fully precomputed.
