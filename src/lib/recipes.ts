export interface Recipe {
  id: string;
  name: string;
  inputs: { itemId: string; qty: number }[];
  output: { itemId: string; qty: number };
  workbench?: string; // null = can craft anywhere
  skillReq?: { skill: string; level: number };
  /** Cooked recipes need a campfire entity nearby or a portable stove in inventory. */
  requiresCookingFire?: boolean;
}

export const RECIPES: Recipe[] = [
  // ── Basic (no workbench) ──
  { id: 'craft_wooden_club', name: 'Wooden Club', inputs: [{ itemId: 'wood', qty: 3 }], output: { itemId: 'wooden_club', qty: 1 } },
  { id: 'craft_wooden_shield', name: 'Wooden Shield', inputs: [{ itemId: 'wood', qty: 5 }], output: { itemId: 'wooden_shield', qty: 1 } },
  { id: 'cook_meat', name: 'Cooked Meat', inputs: [{ itemId: 'raw_meat', qty: 1 }], output: { itemId: 'cooked_meat', qty: 1 }, requiresCookingFire: true },
  { id: 'craft_fishing_rod', name: 'Fishing Rod', inputs: [{ itemId: 'wood', qty: 2 }], output: { itemId: 'fishing_rod', qty: 1 } },
  { id: 'craft_stew', name: 'Hearty Stew', inputs: [{ itemId: 'cooked_meat', qty: 1 }, { itemId: 'herb', qty: 2 }], output: { itemId: 'stew', qty: 1 } },
  { id: 'craft_bread', name: 'Bread', inputs: [{ itemId: 'herb', qty: 3 }], output: { itemId: 'bread', qty: 2 } },

  // ── Smelting (needs campfire/forge) ──
  { id: 'smelt_iron', name: 'Iron Ingot', inputs: [{ itemId: 'iron_ore', qty: 2 }], output: { itemId: 'iron_ingot', qty: 1 }, workbench: 'forge' },

  // ── Smithing ──
  { id: 'forge_iron_sword', name: 'Iron Sword', inputs: [{ itemId: 'iron_ingot', qty: 3 }, { itemId: 'wood', qty: 1 }], output: { itemId: 'iron_sword', qty: 1 }, workbench: 'forge', skillReq: { skill: 'crafting', level: 2 } },
  { id: 'forge_iron_axe', name: 'Iron Axe', inputs: [{ itemId: 'iron_ingot', qty: 2 }, { itemId: 'wood', qty: 2 }], output: { itemId: 'iron_axe', qty: 1 }, workbench: 'forge' },
  { id: 'forge_pickaxe', name: 'Pickaxe', inputs: [{ itemId: 'iron_ingot', qty: 2 }, { itemId: 'wood', qty: 1 }], output: { itemId: 'pickaxe', qty: 1 }, workbench: 'forge' },
  { id: 'forge_iron_helm', name: 'Iron Helm', inputs: [{ itemId: 'iron_ingot', qty: 2 }], output: { itemId: 'iron_helm', qty: 1 }, workbench: 'forge' },
  { id: 'forge_iron_chest', name: 'Iron Breastplate', inputs: [{ itemId: 'iron_ingot', qty: 5 }], output: { itemId: 'iron_chest', qty: 1 }, workbench: 'forge', skillReq: { skill: 'crafting', level: 3 } },
  { id: 'forge_iron_legs', name: 'Iron Greaves', inputs: [{ itemId: 'iron_ingot', qty: 3 }], output: { itemId: 'iron_legs', qty: 1 }, workbench: 'forge' },
  { id: 'forge_iron_shield', name: 'Iron Shield', inputs: [{ itemId: 'iron_ingot', qty: 3 }, { itemId: 'wood', qty: 2 }], output: { itemId: 'iron_shield', qty: 1 }, workbench: 'forge' },

  // ── Leatherworking ──
  { id: 'craft_leather_helm', name: 'Leather Cap', inputs: [{ itemId: 'leather', qty: 2 }], output: { itemId: 'leather_helm', qty: 1 } },
  { id: 'craft_leather_chest', name: 'Leather Vest', inputs: [{ itemId: 'leather', qty: 4 }], output: { itemId: 'leather_chest', qty: 1 } },
  { id: 'craft_leather_legs', name: 'Leather Trousers', inputs: [{ itemId: 'leather', qty: 3 }], output: { itemId: 'leather_legs', qty: 1 } },
  { id: 'craft_leather_boots', name: 'Leather Boots', inputs: [{ itemId: 'leather', qty: 2 }], output: { itemId: 'leather_boots', qty: 1 } },

  // ── Alchemy ──
  { id: 'brew_health_potion', name: 'Health Potion', inputs: [{ itemId: 'herb', qty: 3 }, { itemId: 'berries', qty: 2 }], output: { itemId: 'health_potion', qty: 1 }, skillReq: { skill: 'crafting', level: 2 } },
  { id: 'brew_stamina_potion', name: 'Vigor Tonic', inputs: [{ itemId: 'rare_herb', qty: 1 }, { itemId: 'herb', qty: 2 }], output: { itemId: 'stamina_potion', qty: 1 }, skillReq: { skill: 'crafting', level: 3 } },

  // ── Fletching ──
  { id: 'craft_longbow', name: 'Longbow', inputs: [{ itemId: 'wood', qty: 4 }, { itemId: 'cloth', qty: 1 }], output: { itemId: 'longbow', qty: 1 }, skillReq: { skill: 'crafting', level: 2 } },

  // ── Steel tier (forge, crafting 4–5) ──
  { id: 'forge_steel_sword',  name: 'Steel Sword',      inputs: [{ itemId: 'iron_ingot', qty: 5 }, { itemId: 'gold_ore', qty: 1 }],                             output: { itemId: 'steel_sword',  qty: 1 }, workbench: 'forge', skillReq: { skill: 'crafting', level: 5 } },
  { id: 'forge_steel_helm',   name: 'Steel Helm',       inputs: [{ itemId: 'iron_ingot', qty: 4 }, { itemId: 'gold_ore', qty: 1 }],                             output: { itemId: 'steel_helm',   qty: 1 }, workbench: 'forge', skillReq: { skill: 'crafting', level: 4 } },
  { id: 'forge_steel_chest',  name: 'Steel Breastplate',inputs: [{ itemId: 'iron_ingot', qty: 8 }, { itemId: 'gold_ore', qty: 2 }],                             output: { itemId: 'steel_chest',  qty: 1 }, workbench: 'forge', skillReq: { skill: 'crafting', level: 5 } },
  { id: 'forge_steel_legs',   name: 'Steel Greaves',    inputs: [{ itemId: 'iron_ingot', qty: 5 }, { itemId: 'gold_ore', qty: 1 }],                             output: { itemId: 'steel_legs',   qty: 1 }, workbench: 'forge', skillReq: { skill: 'crafting', level: 4 } },
  { id: 'forge_steel_shield', name: 'Steel Shield',     inputs: [{ itemId: 'iron_ingot', qty: 5 }, { itemId: 'wood', qty: 2 }, { itemId: 'gold_ore', qty: 1 }], output: { itemId: 'steel_shield', qty: 1 }, workbench: 'forge', skillReq: { skill: 'crafting', level: 4 } },

  // ── Enchanted tier (no workbench, crafting 6–7, crystal required) ──
  { id: 'enchant_blade',    name: 'Enchanted Blade',inputs: [{ itemId: 'steel_sword', qty: 1 }, { itemId: 'crystal', qty: 2 }, { itemId: 'herb', qty: 5 }],  output: { itemId: 'enchanted_blade', qty: 1 }, skillReq: { skill: 'crafting', level: 6 } },
  { id: 'craft_shadow_cloak', name: 'Shadow Cloak', inputs: [{ itemId: 'leather_chest', qty: 1 }, { itemId: 'crystal', qty: 2 }, { itemId: 'cloth', qty: 5 }], output: { itemId: 'shadow_cloak', qty: 1 }, skillReq: { skill: 'crafting', level: 6 } },
  { id: 'forge_runic_helm', name: 'Runic Helm',     inputs: [{ itemId: 'steel_helm', qty: 1 }, { itemId: 'crystal', qty: 3 }, { itemId: 'rare_herb', qty: 2 }], output: { itemId: 'runic_helm', qty: 1 }, skillReq: { skill: 'crafting', level: 7 } },
];
