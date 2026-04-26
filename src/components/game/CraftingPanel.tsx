import { useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { RECIPES } from '@/lib/recipes';
import { ITEMS } from '@/lib/items';
import { canCraft, countItem } from '@/lib/craftingSystem';
import { getEntitiesNear } from '@/lib/worldEntities';

function CraftingPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const inventory = useGameStore(s => s.inventory);
  const skills = useGameStore(s => s.skills);
  const craftItemAction = useGameStore(s => s.craftItemAction);
  const playerX = useGameStore(s => s.playerX);
  const playerY = useGameStore(s => s.playerY);

  const nearCookingFire = useMemo(
    () => getEntitiesNear(playerX, playerY, 5).some(e => e.kind === 'cooking_fire'),
    [playerX, playerY],
  );

  if (overlay !== 'crafting') return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto">
        <div className="max-w-2xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-gold gold-glow">Crafting</h2>
            <button onClick={() => setOverlay('none')} className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer">[ESC] Close</button>
          </div>
          <div className="space-y-2">
            {RECIPES.map(recipe => {
              const outputDef = ITEMS[recipe.output.itemId];
              const craftable = canCraft(inventory, recipe, skills as any, { nearCookingFire });
              return (
                <div key={recipe.id} className={`border p-3 flex items-center justify-between transition-colors ${craftable ? 'border-gold/20 hover:border-gold/40' : 'border-gold/5 opacity-50'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{outputDef?.icon ?? '?'}</span>
                    <div>
                      <p className="font-display text-xs text-parchment">{recipe.name} {recipe.output.qty > 1 ? `×${recipe.output.qty}` : ''}</p>
                      <p className="font-mono-game text-[9px] text-mist/50">
                        {recipe.inputs.map(i => {
                          const have = countItem(inventory, i.itemId);
                          const enough = have >= i.qty;
                          return <span key={i.itemId} className={enough ? 'text-rep-craft' : 'text-blood'}>{have}/{i.qty} {ITEMS[i.itemId]?.name ?? i.itemId}  </span>;
                        })}
                      </p>
                      {recipe.workbench && <span className="font-mono-game text-[8px] text-gold/40">Requires: {recipe.workbench}</span>}
                      {recipe.skillReq && <span className="font-mono-game text-[8px] text-gold/40 ml-2">{recipe.skillReq.skill} Lv{recipe.skillReq.level}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => craftable && craftItemAction(recipe.id)}
                    disabled={!craftable}
                    className={`px-3 py-1 border font-mono-game text-[10px] transition-all cursor-pointer ${craftable ? 'border-gold/30 text-gold hover:bg-gold/10' : 'border-gold/10 text-mist/30 cursor-not-allowed'}`}
                  >Craft</button>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(CraftingPanel);
