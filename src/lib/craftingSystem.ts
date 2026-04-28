import { Recipe, RECIPES } from './recipes';
import { ItemDef, ITEMS } from './items';
import type { SkillTree } from './skills';

export interface InventorySlot {
  itemId: string;
  qty: number;
}

export interface Inventory {
  slots: (InventorySlot | null)[];  // 30 backpack slots
  equipment: Partial<Record<string, InventorySlot>>; // keyed by EquipSlot
}

export function createInventory(): Inventory {
  return { slots: new Array(30).fill(null), equipment: {} };
}

export function countItem(inv: Inventory, itemId: string): number {
  let count = 0;
  for (const s of inv.slots) if (s && s.itemId === itemId) count += s.qty;
  return count;
}

export interface CanCraftContext {
  nearCookingFire?: boolean;
}

export function canCraft(
  inv: Inventory,
  recipe: Recipe,
  skills?: Record<string, { level: number }>,
  ctx?: CanCraftContext,
): boolean {
  for (const input of recipe.inputs) {
    if (countItem(inv, input.itemId) < input.qty) return false;
  }
  if (recipe.skillReq && skills) {
    const sk = skills[recipe.skillReq.skill];
    if (!sk || sk.level < recipe.skillReq.level) return false;
  }
  if (recipe.requiresCookingFire && countItem(inv, 'portable_stove') < 1 && !ctx?.nearCookingFire) return false;
  return true;
}

export function craft(inv: Inventory, recipe: Recipe, skills?: SkillTree): Inventory {
  const next: Inventory = { slots: inv.slots.map(s => s ? { ...s } : null), equipment: { ...inv.equipment } };
  // efficient_craft perk: 20% chance to not consume materials
  const freeChance = skills?.crafting.perks.includes('efficient_craft') ? 0.2 : 0;
  const materialsFree = freeChance > 0 && Math.random() < freeChance;
  if (!materialsFree) {
    // Remove inputs
    for (const input of recipe.inputs) {
      let remaining = input.qty;
      for (let i = 0; i < next.slots.length && remaining > 0; i++) {
        const s = next.slots[i];
        if (s && s.itemId === input.itemId) {
          const take = Math.min(s.qty, remaining);
          s.qty -= take;
          remaining -= take;
          if (s.qty <= 0) next.slots[i] = null;
        }
      }
    }
  }
  // Add output
  return addToInventory(next, recipe.output.itemId, recipe.output.qty);
}

export function addToInventory(inv: Inventory, itemId: string, qty: number): Inventory {
  const next: Inventory = { slots: inv.slots.map(s => s ? { ...s } : null), equipment: { ...inv.equipment } };
  const def = ITEMS[itemId];
  const maxStack = def?.maxStack ?? 99;
  let remaining = qty;

  // Stack into existing slots
  if (def?.stackable) {
    for (let i = 0; i < next.slots.length && remaining > 0; i++) {
      const s = next.slots[i];
      if (s && s.itemId === itemId && s.qty < maxStack) {
        const add = Math.min(remaining, maxStack - s.qty);
        s.qty += add;
        remaining -= add;
      }
    }
  }

  // Fill empty slots
  while (remaining > 0) {
    const emptyIdx = next.slots.findIndex(s => s === null);
    if (emptyIdx === -1) break; // inventory full
    const add = Math.min(remaining, maxStack);
    next.slots[emptyIdx] = { itemId, qty: add };
    remaining -= add;
  }

  return next;
}

export function removeFromInventory(inv: Inventory, itemId: string, qty: number): Inventory {
  const next: Inventory = { slots: inv.slots.map(s => s ? { ...s } : null), equipment: { ...inv.equipment } };
  let remaining = qty;
  for (let i = 0; i < next.slots.length && remaining > 0; i++) {
    const s = next.slots[i];
    if (s && s.itemId === itemId) {
      const take = Math.min(s.qty, remaining);
      s.qty -= take;
      remaining -= take;
      if (s.qty <= 0) next.slots[i] = null;
    }
  }
  return next;
}

export function equipItem(inv: Inventory, slotIndex: number): Inventory {
  const next: Inventory = { slots: inv.slots.map(s => s ? { ...s } : null), equipment: { ...inv.equipment } };
  const slot = next.slots[slotIndex];
  if (!slot) return inv;
  const def = ITEMS[slot.itemId];
  if (!def?.equipSlot) return inv;

  // Swap with currently equipped
  const existing = next.equipment[def.equipSlot];
  next.equipment[def.equipSlot] = { itemId: slot.itemId, qty: 1 };
  if (existing) {
    next.slots[slotIndex] = { itemId: existing.itemId, qty: existing.qty };
  } else {
    next.slots[slotIndex] = null;
  }
  return next;
}

export function unequipItem(inv: Inventory, equipSlot: string): Inventory {
  const next: Inventory = { slots: inv.slots.map(s => s ? { ...s } : null), equipment: { ...inv.equipment } };
  const item = next.equipment[equipSlot];
  if (!item) return inv;
  const emptyIdx = next.slots.findIndex(s => s === null);
  if (emptyIdx === -1) return inv; // inventory full
  next.slots[emptyIdx] = { itemId: item.itemId, qty: item.qty };
  delete next.equipment[equipSlot];
  return next;
}

export function getAvailableRecipes(inv: Inventory, nearWorkbench?: string, skills?: Record<string, { level: number }>): Recipe[] {
  return RECIPES.filter(r => {
    if (r.workbench && r.workbench !== nearWorkbench) return false;
    return canCraft(inv, r, skills);
  });
}

export function getTotalArmor(inv: Inventory, skills?: SkillTree): number {
  let total = 0;
  for (const slot of Object.values(inv.equipment)) {
    if (slot) {
      const def = ITEMS[slot.itemId];
      if (def?.armor) total += def.armor;
    }
  }
  // thick_skin perk: +3 armor from toughness
  if (skills?.combat.perks.includes('thick_skin')) total += 3;
  return total;
}

export function getWeaponDamage(inv: Inventory): number {
  const mainhand = inv.equipment['mainhand'];
  if (mainhand) {
    const def = ITEMS[mainhand.itemId];
    return def?.damage ?? 2;
  }
  return 2; // bare hands
}
