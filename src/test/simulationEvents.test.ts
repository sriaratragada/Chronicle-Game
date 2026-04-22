import { describe, it, expect } from 'vitest';
import {
  appendSimEvents,
  diffRegionalToEvent,
  diffMarketsToEvent,
  diffFactionsToEvent,
  SIM_EVENT_CAP,
  SIM_SCHEMA_VERSION,
} from '@/lib/simulationEvents';
import type { Market } from '@/lib/economySystem';
import type { FactionState } from '@/lib/factionSystem';
import type { RegionalModifiers } from '@/lib/regionalState';

function mkMarket(locId: string, itemId: string, stock: number, pm: number): Market {
  return {
    locationId: locId,
    items: [{ itemId, stock, basePrice: 10, priceMultiplier: pm }],
  };
}

describe('appendSimEvents', () => {
  it('caps the log to SIM_EVENT_CAP', () => {
    const prev = Array.from({ length: SIM_EVENT_CAP }, (_, i) => ({
      schemaVersion: SIM_SCHEMA_VERSION,
      id: `old_${i}`,
      worldTime: i,
      gameTick: 0,
      season: 'thaw' as const,
      source: 'world_tick' as const,
      category: 'regional' as const,
      summary: 'x',
      deltas: [],
      visibility: 'silent' as const,
    }));
    const add = [
      {
        schemaVersion: SIM_SCHEMA_VERSION,
        id: 'new_a',
        worldTime: 99,
        gameTick: 1,
        season: 'thaw' as const,
        source: 'world_tick' as const,
        category: 'regional' as const,
        summary: 'a',
        deltas: [],
        visibility: 'silent' as const,
      },
      {
        schemaVersion: SIM_SCHEMA_VERSION,
        id: 'new_b',
        worldTime: 100,
        gameTick: 1,
        season: 'thaw' as const,
        source: 'world_tick' as const,
        category: 'regional' as const,
        summary: 'b',
        deltas: [],
        visibility: 'silent' as const,
      },
    ];
    const next = appendSimEvents(prev, add, SIM_EVENT_CAP);
    expect(next.length).toBe(SIM_EVENT_CAP);
    expect(next[next.length - 1]!.id).toBe('new_b');
    expect(next[next.length - 2]!.id).toBe('new_a');
    expect(next[0]!.id).toBe('old_2');
  });

  it('returns same reference when no new events', () => {
    const prev: ReturnType<typeof appendSimEvents> = [];
    expect(appendSimEvents(prev, [], SIM_EVENT_CAP)).toBe(prev);
  });
});

describe('diffRegionalToEvent', () => {
  it('returns null when change is below epsilon', () => {
    const prev: RegionalModifiers = {
      warTension: 0.2,
      drought: 0.2,
      banditPressure: 0.2,
      stormSeverity: 0.2,
      lastChronicleBand: 0,
    };
    const next = { ...prev, warTension: 0.205 };
    const idIndex = { n: 0 };
    expect(diffRegionalToEvent(prev, next, { worldTime: 1, gameTick: 0, season: 'thaw', idIndex })).toBeNull();
  });

  it('emits an event when a pressure moves materially', () => {
    const prev: RegionalModifiers = {
      warTension: 0.2,
      drought: 0.2,
      banditPressure: 0.2,
      stormSeverity: 0.2,
      lastChronicleBand: 0,
    };
    const next = { ...prev, warTension: 0.35 };
    const idIndex = { n: 0 };
    const ev = diffRegionalToEvent(prev, next, { worldTime: 12, gameTick: 3, season: 'summer', idIndex });
    expect(ev).not.toBeNull();
    expect(ev!.deltas.some(d => d.key === 'warTension')).toBe(true);
    expect(ev!.visibility).toBe('hud');
  });
});

describe('diffMarketsToEvent', () => {
  it('returns null when no meaningful price/stock change', () => {
    const loc = 'ashenford';
    const prev: Record<string, Market> = { [loc]: mkMarket(loc, 'salt', 10, 1.0) };
    const next: Record<string, Market> = { [loc]: mkMarket(loc, 'salt', 10, 1.0) };
    const idIndex = { n: 0 };
    expect(
      diffMarketsToEvent(prev, next, { worldTime: 1, gameTick: 0, season: 'thaw', idIndex }, { visitedLocations: [loc], currentLocation: loc }),
    ).toBeNull();
  });

  it('detects stock shifts at visited settlements', () => {
    const loc = 'ashenford';
    const prev: Record<string, Market> = { [loc]: mkMarket(loc, 'salt', 20, 1.0) };
    const next: Record<string, Market> = { [loc]: mkMarket(loc, 'salt', 5, 1.0) };
    const idIndex = { n: 0 };
    const ev = diffMarketsToEvent(prev, next, { worldTime: 10, gameTick: 0, season: 'thaw', idIndex }, { visitedLocations: [loc], currentLocation: 'other' });
    expect(ev).not.toBeNull();
    expect(ev!.deltas.some(d => d.domain === 'market' && d.itemId === 'salt')).toBe(true);
  });
});

describe('diffFactionsToEvent', () => {
  it('returns null when kingdom numbers unchanged', () => {
    const f: FactionState = {
      id: 'a',
      name: 'A',
      treasury: 1000,
      armySize: 50,
      territory: [],
      atWarWith: [],
      morale: 80,
    };
    const prev = { k: f };
    const idIndex = { n: 0 };
    expect(diffFactionsToEvent(prev, { k: { ...f } }, { worldTime: 1, gameTick: 0, season: 'thaw', idIndex })).toBeNull();
  });

  it('records treasury drift', () => {
    const f: FactionState = {
      id: 'korrath',
      name: 'K',
      treasury: 1000,
      armySize: 50,
      territory: ['a'],
      atWarWith: [],
      morale: 80,
    };
    const prev = { korrath: f };
    const next = { korrath: { ...f, treasury: 1200 } };
    const idIndex = { n: 0 };
    const ev = diffFactionsToEvent(prev, next, { worldTime: 96, gameTick: 0, season: 'thaw', idIndex });
    expect(ev).not.toBeNull();
    expect(ev!.visibility).toBe('chronicle');
    expect(ev!.deltas.some(d => d.key === 'treasury')).toBe(true);
  });
});
