export interface SpellDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  manaCost: number;
  cooldownTicks: number;
  scrollId: string;
  requiresBattle?: boolean;
}

export const SPELLS: Record<string, SpellDef> = {
  flame_bolt: {
    id: 'flame_bolt', name: 'Flame Bolt', icon: '🔥',
    description: 'Hurl a bolt of arcane fire at your foe. Deals 20 damage in battle.',
    manaCost: 15, cooldownTicks: 3,
    scrollId: 'scroll_flame_bolt', requiresBattle: true,
  },
  mend: {
    id: 'mend', name: 'Mend', icon: '✨',
    description: 'Knit wounds closed. Restores 25 health.',
    manaCost: 20, cooldownTicks: 5,
    scrollId: 'scroll_mend',
  },
  shadow_step: {
    id: 'shadow_step', name: 'Shadow Step', icon: '🌑',
    description: 'Dissolve into shadow. Escapes any battle instantly.',
    manaCost: 25, cooldownTicks: 10,
    scrollId: 'scroll_shadow_step',
  },
  reveal: {
    id: 'reveal', name: 'Reveal', icon: '👁️',
    description: 'Illuminate the unknown. Clears a wide swath of fog.',
    manaCost: 10, cooldownTicks: 4,
    scrollId: 'scroll_reveal',
  },
  tremor: {
    id: 'tremor', name: 'Tremor', icon: '💫',
    description: 'Shake the earth. Stuns the foe, halving their next attack.',
    manaCost: 30, cooldownTicks: 8,
    scrollId: 'scroll_tremor', requiresBattle: true,
  },
};

export const SPELL_LIST: SpellDef[] = Object.values(SPELLS);
