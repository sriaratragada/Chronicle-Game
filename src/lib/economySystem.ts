import { ITEMS } from './items';
import { LOCATION_COORDS, getSettlementMeta, type ContinentId } from './mapGenerator';
import type { RegionalModifiers } from './regionalState';
import { getContinentModifierMul } from './regionalState';
import type { RoadInnSite } from './wildernessPoi';

export interface MarketItem {
  itemId: string;
  stock: number;
  basePrice: number;
  priceMultiplier: number;
}

export interface Market {
  locationId: string;
  items: MarketItem[];
  /** Roadside inn markets (no settlement row in SETTLEMENTS). */
  innContinent?: ContinentId;
}

const TRADE_GOODS = ['salt', 'spice', 'silk', 'iron_ingot', 'wood', 'stone', 'leather', 'cloth', 'herb', 'bread', 'cooked_meat', 'fish'];

function getBaseStock(locType: string, itemId: string): number {
  const base = Math.floor(Math.random() * 10) + 5;
  if (locType === 'port' && ['salt', 'fish', 'silk'].includes(itemId)) return base * 3;
  if (locType === 'fortress' && ['iron_ingot', 'leather'].includes(itemId)) return base * 2;
  if (locType === 'village' && ['bread', 'cooked_meat', 'wood'].includes(itemId)) return base * 2;
  return base;
}

function hashStock(seed: number, i: number): number {
  let h = (seed * 9301 + i * 49297 + 1337) & 0xffffffff;
  h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff;
  return (h & 0x7fffffff) / 0x7fffffff;
}

/** Small curated stocks for trail inns (deterministic per inn id). */
export function buildRoadInnMarkets(sites: RoadInnSite[]): Record<string, Market> {
  const markets: Record<string, Market> = {};
  const goods = ['bread', 'cooked_meat', 'fish', 'herb', 'cloth', 'waterskin'] as const;
  for (const s of sites) {
    const seed = s.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const items: MarketItem[] = goods.map((itemId, i) => {
      const def = ITEMS[itemId];
      return {
        itemId,
        stock: 3 + Math.floor(hashStock(seed, i + 2) * 9),
        basePrice: def?.value ?? 5,
        priceMultiplier: 0.9 + hashStock(seed, i + 5) * 0.35,
      };
    });
    markets[s.id] = { locationId: s.id, innContinent: s.continent, items };
  }
  return markets;
}

export function createMarkets(): Record<string, Market> {
  const markets: Record<string, Market> = {};
  for (const [locId] of Object.entries(LOCATION_COORDS)) {
    const meta = getSettlementMeta(locId);
    if (!meta) continue;
    if (['wilderness', 'ruins'].includes(meta.type)) continue;

    const items: MarketItem[] = TRADE_GOODS.map(itemId => {
      const def = ITEMS[itemId];
      return {
        itemId,
        stock: getBaseStock(meta.type, itemId),
        basePrice: def?.value ?? 5,
        priceMultiplier: 0.8 + Math.random() * 0.4,
      };
    });

    // Arcane goods in cities and capitals
    if (meta.type === 'capital' || meta.type === 'city') {
      const arcaneGoods: Array<[string, number]> = [
        ['mana_potion', 3 + Math.floor(Math.random() * 4)],
        ['scroll_flame_bolt', 1 + Math.floor(Math.random() * 2)],
        ['scroll_mend', 1 + Math.floor(Math.random() * 2)],
        ['scroll_reveal', 1 + Math.floor(Math.random() * 2)],
      ];
      if (meta.type === 'capital') {
        arcaneGoods.push(['scroll_shadow_step', 1]);
        arcaneGoods.push(['scroll_tremor', 1]);
      }
      for (const [itemId, stock] of arcaneGoods) {
        const def = ITEMS[itemId];
        if (def) items.push({ itemId, stock, basePrice: def.value ?? 30, priceMultiplier: 1.0 + Math.random() * 0.3 });
      }
    }

    markets[locId] = { locationId: locId, items };
  }
  return markets;
}

export function getPrice(item: MarketItem): number {
  // Price scales inversely with stock
  const scarcityMul = item.stock < 3 ? 2.0 : item.stock < 8 ? 1.3 : item.stock > 20 ? 0.7 : 1.0;
  return Math.max(1, Math.round(item.basePrice * item.priceMultiplier * scarcityMul));
}

export function getSellPrice(item: MarketItem): number {
  return Math.max(1, Math.floor(getPrice(item) * 0.6));
}

const CARGO_TO_ITEM: Record<string, string> = {
  salt: 'salt',
  silk: 'silk',
  spice: 'spice',
  grain: 'bread',
  iron: 'iron_ingot',
  cloth: 'cloth',
  leather: 'leather',
  wine: 'fish',
};

export function tickMarket(market: Market, modifiers?: RegionalModifiers): Market {
  const meta = getSettlementMeta(market.locationId);
  const continent = meta?.continent ?? market.innContinent;
  const kingdom = meta?.kingdom ?? 'auredia_crown';
  const { stockMul, priceMul } =
    continent && modifiers
      ? getContinentModifierMul(continent, modifiers, kingdom)
      : { stockMul: 1, priceMul: 1 };

  return {
    ...market,
    items: market.items.map(item => {
      let stockDelta = Math.random() < 0.3 ? 1 : 0;
      if (item.itemId === 'bread' || item.itemId === 'herb') stockDelta -= modifiers && modifiers.drought > 0.5 ? 1 : 0;
      if (item.itemId === 'fish' && modifiers && modifiers.stormSeverity > 0.45) stockDelta -= 1;
      const newStock = Math.max(0, Math.min(30, Math.floor(item.stock * stockMul * 0.02 + item.stock * 0.98) + stockDelta));
      let pm = item.priceMultiplier + (Math.random() - 0.5) * 0.05;
      pm *= 0.92 + priceMul * 0.16;
      if (modifiers) {
        if (['bread', 'herb'].includes(item.itemId) && modifiers.drought > 0.45) pm *= 1.05 + modifiers.drought * 0.15;
        if (['salt', 'spice', 'silk'].includes(item.itemId) && modifiers.banditPressure > 0.45) pm *= 1.04 + modifiers.banditPressure * 0.12;
        if (item.itemId === 'fish' && modifiers.stormSeverity > 0.4) pm *= 1.03 + modifiers.stormSeverity * 0.1;
      }
      return {
        ...item,
        stock: newStock,
        priceMultiplier: Math.max(0.5, Math.min(2.4, pm)),
      };
    }),
  };
}

/** When a caravan reaches a destination, nudge that market's relevant stock. */
export function applyCaravanDelivery(market: Market, cargo: string): Market {
  const itemId = CARGO_TO_ITEM[cargo] ?? 'cloth';
  return {
    ...market,
    items: market.items.map(i =>
      i.itemId === itemId ? { ...i, stock: Math.min(30, i.stock + 2 + Math.floor(Math.random() * 3)) } : i,
    ),
  };
}

export function buyItem(market: Market, itemId: string, qty: number): { market: Market; cost: number } | null {
  const item = market.items.find(i => i.itemId === itemId);
  if (!item || item.stock < qty) return null;
  const cost = getPrice(item) * qty;
  return {
    market: {
      ...market,
      items: market.items.map(i => i.itemId === itemId ? { ...i, stock: i.stock - qty } : i),
    },
    cost,
  };
}

export function sellItem(market: Market, itemId: string, qty: number): { market: Market; revenue: number } {
  const existing = market.items.find(i => i.itemId === itemId);
  const basePrice = ITEMS[itemId]?.value ?? 5;
  const revenue = existing ? getSellPrice(existing) * qty : Math.floor(basePrice * 0.5) * qty;
  return {
    market: {
      ...market,
      items: existing
        ? market.items.map(i => i.itemId === itemId ? { ...i, stock: i.stock + qty } : i)
        : [...market.items, { itemId, stock: qty, basePrice, priceMultiplier: 1.0 }],
    },
    revenue,
  };
}
