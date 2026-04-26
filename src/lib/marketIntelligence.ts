import type { Market } from './economySystem';
import { getPrice } from './economySystem';

export interface MarketSnapshot {
  locationId: string;
  worldTime: number;
  prices: Record<string, number>;
  stockLevels: Record<string, number>;
}

export interface TradeLead {
  buyFrom: string;
  sellTo: string;
  itemId: string;
  buyPrice: number;
  sellPrice: number;
  profitEstimate: number;
}

const SNAPSHOT_HISTORY_CAP = 3;

export function snapshotMarkets(markets: Record<string, Market>, worldTime: number): MarketSnapshot[] {
  const snapshots: MarketSnapshot[] = [];
  for (const [locationId, market] of Object.entries(markets)) {
    if (!market.items.length) continue;
    const prices: Record<string, number> = {};
    const stockLevels: Record<string, number> = {};
    for (const item of market.items) {
      prices[item.itemId] = getPrice(item);
      stockLevels[item.itemId] = item.stock;
    }
    snapshots.push({ locationId, worldTime, prices, stockLevels });
  }
  return snapshots;
}

export function appendSnapshot(
  existing: MarketSnapshot[],
  fresh: MarketSnapshot[],
): MarketSnapshot[] {
  // Keep only the latest per location, capped by SNAPSHOT_HISTORY_CAP total
  const byLoc = new Map<string, MarketSnapshot>();
  for (const s of [...existing, ...fresh]) {
    const cur = byLoc.get(s.locationId);
    if (!cur || s.worldTime > cur.worldTime) byLoc.set(s.locationId, s);
  }
  const all = Array.from(byLoc.values()).sort((a, b) => b.worldTime - a.worldTime);
  return all.slice(0, SNAPSHOT_HISTORY_CAP * 20); // max 20 locations worth
}

export function computeTradeLeads(snapshots: MarketSnapshot[]): TradeLead[] {
  const leads: TradeLead[] = [];
  const byItem = new Map<string, MarketSnapshot[]>();

  for (const snapshot of snapshots) {
    for (const itemId of Object.keys(snapshot.prices)) {
      const arr = byItem.get(itemId) ?? [];
      arr.push(snapshot);
      byItem.set(itemId, arr);
    }
  }

  for (const [itemId, locs] of byItem.entries()) {
    if (locs.length < 2) continue;
    for (let i = 0; i < locs.length; i++) {
      for (let j = i + 1; j < locs.length; j++) {
        const a = locs[i]!;
        const b = locs[j]!;
        const pa = a.prices[itemId] ?? 0;
        const pb = b.prices[itemId] ?? 0;
        if (pa === 0 || pb === 0) continue;

        // Check stock availability
        const stockA = a.stockLevels[itemId] ?? 0;
        const stockB = b.stockLevels[itemId] ?? 0;
        if (stockA < 2 && stockB < 2) continue;

        if (pb > pa + 3 && stockA >= 2) {
          leads.push({ buyFrom: a.locationId, sellTo: b.locationId, itemId, buyPrice: pa, sellPrice: pb, profitEstimate: pb - pa });
        } else if (pa > pb + 3 && stockB >= 2) {
          leads.push({ buyFrom: b.locationId, sellTo: a.locationId, itemId, buyPrice: pb, sellPrice: pa, profitEstimate: pa - pb });
        }
      }
    }
  }

  return leads.sort((a, b) => b.profitEstimate - a.profitEstimate).slice(0, 8);
}

export function pickBestRoute(leads: TradeLead[], currentLocation: string): TradeLead | null {
  // Prefer leads where current location is the buy source
  const local = leads.filter(l => l.buyFrom === currentLocation);
  if (local.length > 0) return local[0]!;
  return leads[0] ?? null;
}
