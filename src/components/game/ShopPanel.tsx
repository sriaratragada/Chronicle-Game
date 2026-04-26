import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { ITEMS } from '@/lib/items';
import { computeTradeLeads } from '@/lib/marketIntelligence';

export default function ShopPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const currentLocation = useGameStore(s => s.currentLocation);
  const shopMarketId = useGameStore(s => s.shopMarketId);
  const markets = useGameStore(s => s.markets);
  const gold = useGameStore(s => s.gold);
  const inventory = useGameStore(s => s.inventory);
  const buyItemAction = useGameStore(s => s.buyItemAction);
  const sellItemAction = useGameStore(s => s.sellItemAction);
  const marketSnapshots = useGameStore(s => s.marketSnapshots);
  const [activeTab, setActiveTab] = useState<'buy' | 'sell' | 'intel'>('buy');

  if (overlay !== 'shop') return null;
  const marketKey = shopMarketId ?? currentLocation;
  const market = markets[marketKey];
  const tradeLeads = computeTradeLeads(marketSnapshots ?? []);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto">
        <div className="max-w-3xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-gold gold-glow">
              {marketKey.startsWith('road_inn_') ? 'Roadside Inn' : 'Market'} —{' '}
              {marketKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </h2>
            <div className="flex items-center gap-4">
              <span className="font-mono-game text-[11px] text-gold">🪙 {gold}g</span>
              <button onClick={() => setOverlay('none')} className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer">[ESC] Close</button>
            </div>
          </div>

          <div className="flex gap-2 mb-4 border-b border-gold/10 pb-2">
            {(['buy', 'sell', 'intel'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`font-mono-game text-[10px] px-3 py-1 border transition-colors cursor-pointer ${activeTab === tab ? 'border-gold/40 text-gold bg-gold/10' : 'border-gold/10 text-mist/50 hover:text-gold'}`}>
                {tab === 'intel' ? 'Trade Intel' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'buy' && (
            !market ? (
              <p className="text-mist/50 text-sm italic text-center">No market at this location.</p>
            ) : (
              <div className="space-y-1">
                {market.items.map(mItem => {
                  const def = ITEMS[mItem.itemId];
                  if (!def) return null;
                  const scarcity = mItem.stock < 3 ? 2.0 : mItem.stock < 8 ? 1.3 : mItem.stock > 20 ? 0.7 : 1.0;
                  const price = Math.max(1, Math.round(mItem.basePrice * mItem.priceMultiplier * scarcity));
                  const canBuy = gold >= price && mItem.stock > 0;
                  return (
                    <div key={mItem.itemId} className="flex items-center justify-between border border-gold/10 p-2 hover:border-gold/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <span>{def.icon}</span>
                        <span className="font-mono-game text-[10px] text-parchment">{def.name}</span>
                        <span className="font-mono-game text-[8px] text-mist/40">×{mItem.stock}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-game text-[10px] text-gold">{price}g</span>
                        <button onClick={() => canBuy && buyItemAction(mItem.itemId, 1)} disabled={!canBuy}
                          className={`px-2 py-0.5 border font-mono-game text-[8px] cursor-pointer transition-all ${canBuy ? 'border-gold/20 text-gold hover:bg-gold/10' : 'border-gold/5 text-mist/30 cursor-not-allowed'}`}>Buy</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 'sell' && (
            <div className="space-y-1">
              {inventory.slots.filter(s => s !== null).map((slot, i) => {
                if (!slot) return null;
                const def = ITEMS[slot.itemId];
                if (!def) return null;
                const sellPrice = Math.max(1, Math.floor((def.value ?? 1) * 0.6));
                return (
                  <div key={`${slot.itemId}-${i}`} className="flex items-center justify-between border border-gold/10 p-2 hover:border-gold/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <span>{def.icon}</span>
                      <span className="font-mono-game text-[10px] text-parchment">{def.name} ×{slot.qty}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-game text-[10px] text-rep-trade">{sellPrice}g</span>
                      <button onClick={() => sellItemAction(slot.itemId, 1)}
                        className="px-2 py-0.5 border border-gold/20 font-mono-game text-[8px] text-gold hover:bg-gold/10 cursor-pointer">Sell</button>
                    </div>
                  </div>
                );
              })}
              {inventory.slots.every(s => s === null) && <p className="font-mono-game text-[10px] text-mist/40 italic">Nothing to sell.</p>}
            </div>
          )}

          {activeTab === 'intel' && (
            <div>
              <p className="font-mono-game text-[9px] text-mist/40 mb-3 italic">
                Price spreads across known markets. Buy low, sell high.
              </p>
              {tradeLeads.length === 0 ? (
                <p className="font-mono-game text-[10px] text-mist/40 italic">No profitable routes detected yet. Visit more markets.</p>
              ) : (
                <div className="space-y-2">
                  {tradeLeads.map((lead, i) => {
                    const def = ITEMS[lead.itemId];
                    return (
                      <div key={i} className="border border-gold/10 p-2 hover:border-gold/25 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono-game text-[10px] text-parchment">{def?.icon ?? '📦'} {def?.name ?? lead.itemId}</span>
                          <span className="font-mono-game text-[10px] text-rep-trade">+{lead.profitEstimate}g profit</span>
                        </div>
                        <div className="font-mono-game text-[8px] text-mist/50">
                          Buy at <span className="text-parchment/70">{lead.buyFrom.replace(/_/g, ' ')}</span> for {lead.buyPrice}g
                          {' → '} Sell at <span className="text-parchment/70">{lead.sellTo.replace(/_/g, ' ')}</span> for {lead.sellPrice}g
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
