export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type EquipSlot = 'mainhand' | 'offhand' | 'helm' | 'chest' | 'legs' | 'boots' | 'amulet';

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  type: 'weapon' | 'armor' | 'tool' | 'food' | 'resource' | 'potion' | 'trade_good' | 'misc';
  rarity: ItemRarity;
  stackable: boolean;
  maxStack: number;
  description: string;
  equipSlot?: EquipSlot;
  damage?: number;
  armor?: number;
  foodValue?: number;
  value?: number; // base gold value
}

export const ITEMS: Record<string, ItemDef> = {
  // ── Resources ──
  wood:         { id: 'wood', name: 'Wood', icon: '🪵', type: 'resource', rarity: 'common', stackable: true, maxStack: 50, description: 'Rough-hewn timber.', value: 2 },
  stone:        { id: 'stone', name: 'Stone', icon: '🪨', type: 'resource', rarity: 'common', stackable: true, maxStack: 50, description: 'A chunk of grey rock.', value: 1 },
  iron_ore:     { id: 'iron_ore', name: 'Iron Ore', icon: '⛏️', type: 'resource', rarity: 'common', stackable: true, maxStack: 30, description: 'Raw iron from the earth.', value: 5 },
  iron_ingot:   { id: 'iron_ingot', name: 'Iron Ingot', icon: '🔩', type: 'resource', rarity: 'uncommon', stackable: true, maxStack: 20, description: 'Smelted iron, ready for the forge.', value: 12 },
  gold_ore:     { id: 'gold_ore', name: 'Gold Ore', icon: '✨', type: 'resource', rarity: 'rare', stackable: true, maxStack: 20, description: 'Glittering ore veined with gold.', value: 25 },
  herb:         { id: 'herb', name: 'Wild Herb', icon: '🌿', type: 'resource', rarity: 'common', stackable: true, maxStack: 30, description: 'A fragrant plant with medicinal properties.', value: 3 },
  rare_herb:    { id: 'rare_herb', name: 'Moonpetal', icon: '🌸', type: 'resource', rarity: 'rare', stackable: true, maxStack: 10, description: 'Blooms only under starlight.', value: 30 },
  leather:      { id: 'leather', name: 'Leather', icon: '🟫', type: 'resource', rarity: 'common', stackable: true, maxStack: 30, description: 'Cured animal hide.', value: 6 },
  cloth:        { id: 'cloth', name: 'Cloth', icon: '🧵', type: 'resource', rarity: 'common', stackable: true, maxStack: 30, description: 'Simple woven fabric.', value: 4 },
  crystal:      { id: 'crystal', name: 'Crystal Shard', icon: '💎', type: 'resource', rarity: 'rare', stackable: true, maxStack: 10, description: 'Hums with faint energy.', value: 40 },

  // ── Foods ──
  berries:      { id: 'berries', name: 'Wild Berries', icon: '🫐', type: 'food', rarity: 'common', stackable: true, maxStack: 20, description: 'Fresh-picked. Sweet and tart.', foodValue: 10, value: 1 },
  raw_meat:     { id: 'raw_meat', name: 'Raw Meat', icon: '🥩', type: 'food', rarity: 'common', stackable: true, maxStack: 10, description: 'Needs cooking, but edible raw in a pinch.', foodValue: 8, value: 3 },
  cooked_meat:  { id: 'cooked_meat', name: 'Cooked Meat', icon: '🍖', type: 'food', rarity: 'common', stackable: true, maxStack: 10, description: 'Well-seared. Restores hunger.', foodValue: 25, value: 8 },
  fish:         { id: 'fish', name: 'Fresh Fish', icon: '🐟', type: 'food', rarity: 'common', stackable: true, maxStack: 10, description: 'River catch. Best eaten soon.', foodValue: 15, value: 4 },
  bread:        { id: 'bread', name: 'Bread', icon: '🍞', type: 'food', rarity: 'common', stackable: true, maxStack: 10, description: 'A rustic loaf.', foodValue: 20, value: 5 },
  trail_ration: { id: 'trail_ration', name: 'Trail Rations', icon: '🍖', type: 'food', rarity: 'common', stackable: true, maxStack: 10, description: 'Dried meat. Enough for a few days.', foodValue: 25, value: 6 },
  stew:         { id: 'stew', name: 'Hearty Stew', icon: '🍲', type: 'food', rarity: 'uncommon', stackable: true, maxStack: 5, description: 'Warm and filling.', foodValue: 40, value: 12 },

  // ── Potions ──
  health_potion:  { id: 'health_potion', name: 'Health Potion', icon: '❤️‍🩹', type: 'potion', rarity: 'uncommon', stackable: true, maxStack: 5, description: 'Restores 30 health.', value: 20 },
  stamina_potion: { id: 'stamina_potion', name: 'Vigor Tonic', icon: '💚', type: 'potion', rarity: 'uncommon', stackable: true, maxStack: 5, description: 'Reduces hunger decay for a time.', value: 18 },

  // ── Weapons ──
  bare_hands:    { id: 'bare_hands', name: 'Bare Hands', icon: '✊', type: 'weapon', rarity: 'common', stackable: false, maxStack: 1, description: 'All you have. For now.', equipSlot: 'mainhand', damage: 2, value: 0 },
  rusty_knife:   { id: 'rusty_knife', name: 'Rusty Knife', icon: '🗡️', type: 'weapon', rarity: 'common', stackable: false, maxStack: 1, description: 'A worn blade. Better than nothing.', equipSlot: 'mainhand', damage: 5, value: 8 },
  wooden_club:   { id: 'wooden_club', name: 'Wooden Club', icon: '🪵', type: 'weapon', rarity: 'common', stackable: false, maxStack: 1, description: 'Heavy and blunt.', equipSlot: 'mainhand', damage: 7, value: 5 },
  iron_sword:    { id: 'iron_sword', name: 'Iron Sword', icon: '⚔️', type: 'weapon', rarity: 'uncommon', stackable: false, maxStack: 1, description: 'A serviceable blade.', equipSlot: 'mainhand', damage: 15, value: 40 },
  iron_axe:      { id: 'iron_axe', name: 'Iron Axe', icon: '🪓', type: 'weapon', rarity: 'uncommon', stackable: false, maxStack: 1, description: 'Good for combat and woodcutting.', equipSlot: 'mainhand', damage: 12, value: 35 },
  longbow:       { id: 'longbow', name: 'Longbow', icon: '🏹', type: 'weapon', rarity: 'uncommon', stackable: false, maxStack: 1, description: 'Strikes from afar.', equipSlot: 'mainhand', damage: 10, value: 30 },
  steel_sword:   { id: 'steel_sword', name: 'Steel Sword', icon: '⚔️', type: 'weapon', rarity: 'rare', stackable: false, maxStack: 1, description: 'Folded steel. Cuts clean.', equipSlot: 'mainhand', damage: 25, value: 120 },

  // ── Armor ──
  leather_helm:   { id: 'leather_helm', name: 'Leather Cap', icon: '🎩', type: 'armor', rarity: 'common', stackable: false, maxStack: 1, description: 'Better than nothing on your head.', equipSlot: 'helm', armor: 2, value: 10 },
  leather_chest:  { id: 'leather_chest', name: 'Leather Vest', icon: '🦺', type: 'armor', rarity: 'common', stackable: false, maxStack: 1, description: 'Supple hide armor.', equipSlot: 'chest', armor: 5, value: 20 },
  leather_legs:   { id: 'leather_legs', name: 'Leather Trousers', icon: '👖', type: 'armor', rarity: 'common', stackable: false, maxStack: 1, description: 'Protects the legs.', equipSlot: 'legs', armor: 3, value: 15 },
  leather_boots:  { id: 'leather_boots', name: 'Leather Boots', icon: '🥾', type: 'armor', rarity: 'common', stackable: false, maxStack: 1, description: 'Sturdy footwear.', equipSlot: 'boots', armor: 2, value: 12 },
  iron_helm:      { id: 'iron_helm', name: 'Iron Helm', icon: '⛑️', type: 'armor', rarity: 'uncommon', stackable: false, maxStack: 1, description: 'Hammered iron headgear.', equipSlot: 'helm', armor: 5, value: 30 },
  iron_chest:     { id: 'iron_chest', name: 'Iron Breastplate', icon: '🛡️', type: 'armor', rarity: 'uncommon', stackable: false, maxStack: 1, description: 'Solid iron protection.', equipSlot: 'chest', armor: 10, value: 60 },
  iron_legs:      { id: 'iron_legs', name: 'Iron Greaves', icon: '🦿', type: 'armor', rarity: 'uncommon', stackable: false, maxStack: 1, description: 'Heavy leg armor.', equipSlot: 'legs', armor: 7, value: 45 },
  wooden_shield:  { id: 'wooden_shield', name: 'Wooden Shield', icon: '🛡️', type: 'armor', rarity: 'common', stackable: false, maxStack: 1, description: 'A battered round shield.', equipSlot: 'offhand', armor: 4, value: 15 },
  iron_shield:    { id: 'iron_shield', name: 'Iron Shield', icon: '🛡️', type: 'armor', rarity: 'uncommon', stackable: false, maxStack: 1, description: 'Reinforced with iron bands.', equipSlot: 'offhand', armor: 8, value: 50 },

  // ── Tools ──
  flint_steel:    { id: 'flint_steel', name: 'Flint & Steel', icon: '🔥', type: 'tool', rarity: 'common', stackable: false, maxStack: 1, description: 'Start fires. Signal for help.', value: 5 },
  pickaxe:        { id: 'pickaxe', name: 'Pickaxe', icon: '⛏️', type: 'tool', rarity: 'common', stackable: false, maxStack: 1, description: 'For mining ore and stone.', value: 15 },
  waterskin:      { id: 'waterskin', name: 'Waterskin', icon: '🫗', type: 'misc', rarity: 'common', stackable: false, maxStack: 1, description: 'Carry water.', value: 3 },
  fishing_rod:    { id: 'fishing_rod', name: 'Fishing Rod', icon: '🎣', type: 'tool', rarity: 'common', stackable: false, maxStack: 1, description: 'For catching fish.', value: 10 },

  // ── Trade goods ──
  salt:         { id: 'salt', name: 'Salt', icon: '🧂', type: 'trade_good', rarity: 'common', stackable: true, maxStack: 30, description: 'White gold of the trade roads.', value: 8 },
  spice:        { id: 'spice', name: 'Exotic Spice', icon: '🌶️', type: 'trade_good', rarity: 'uncommon', stackable: true, maxStack: 20, description: 'Prized by cooks and merchants alike.', value: 20 },
  silk:         { id: 'silk', name: 'Silk Bolt', icon: '🎀', type: 'trade_good', rarity: 'rare', stackable: true, maxStack: 10, description: 'Luxury fabric from distant lands.', value: 50 },
  gold_coin:    { id: 'gold_coin', name: 'Gold', icon: '🪙', type: 'misc', rarity: 'common', stackable: true, maxStack: 9999, description: 'Currency of the known world.', value: 1 },

  // ── Amulets ──
  traveler_charm: { id: 'traveler_charm', name: 'Traveler\'s Charm', icon: '🧿', type: 'armor', rarity: 'uncommon', stackable: false, maxStack: 1, description: 'Reduces hunger decay slightly.', equipSlot: 'amulet', armor: 0, value: 35 },

  tent_kit: { id: 'tent_kit', name: 'Travel Tent', icon: '⛺', type: 'tool', rarity: 'common', stackable: true, maxStack: 3, description: 'Pitch a camp and open a stash. Use from hotbar on open ground.', value: 12 },
  realm_map: { id: 'realm_map', name: 'Realm Atlas', icon: '🗺️', type: 'misc', rarity: 'common', stackable: false, maxStack: 1, description: 'A chart of the known world. Use from the hotbar (E) to study roads, settlements, and caves.', value: 8 },
  portable_stove: { id: 'portable_stove', name: 'Portable Stove', icon: '🫕', type: 'tool', rarity: 'uncommon', stackable: false, maxStack: 1, description: 'Cook anywhere without a campfire.', value: 45 },
  void_sigil: { id: 'void_sigil', name: 'Void Sigil', icon: '🜁', type: 'misc', rarity: 'rare', stackable: true, maxStack: 5, description: 'A proof-token from the deep places. Factions pay well for these.', value: 80 },

  // ── Arcane ──
  mana_potion:       { id: 'mana_potion', name: 'Mana Draught', icon: '🔮', type: 'potion', rarity: 'uncommon', stackable: true, maxStack: 5, description: 'Restores 30 mana.', value: 25 },
  scroll_flame_bolt: { id: 'scroll_flame_bolt', name: 'Scroll: Flame Bolt', icon: '📜', type: 'misc', rarity: 'uncommon', stackable: true, maxStack: 3, description: 'Teaches the Flame Bolt spell. Single use.', value: 35 },
  scroll_mend:       { id: 'scroll_mend', name: 'Scroll: Mend', icon: '📜', type: 'misc', rarity: 'uncommon', stackable: true, maxStack: 3, description: 'Teaches the Mend spell. Single use.', value: 40 },
  scroll_shadow_step:{ id: 'scroll_shadow_step', name: 'Scroll: Shadow Step', icon: '📜', type: 'misc', rarity: 'rare', stackable: true, maxStack: 3, description: 'Teaches the Shadow Step spell. Single use.', value: 60 },
  scroll_reveal:     { id: 'scroll_reveal', name: 'Scroll: Reveal', icon: '📜', type: 'misc', rarity: 'uncommon', stackable: true, maxStack: 3, description: 'Teaches the Reveal spell. Single use.', value: 45 },
  scroll_tremor:     { id: 'scroll_tremor', name: 'Scroll: Tremor', icon: '📜', type: 'misc', rarity: 'rare', stackable: true, maxStack: 3, description: 'Teaches the Tremor spell. Single use.', value: 65 },
};

export function getItemDef(id: string): ItemDef | undefined {
  return ITEMS[id];
}
