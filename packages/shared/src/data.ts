import type { Adventurer, Equipment, Monster } from './types.js';

// ── Monster deck — 13 cards ───────────────────────────────────────────────────

export function makeMonsterDeck(): Monster[] {
  return [
    { name: 'Goblin',   strength: 1 },
    { name: 'Goblin',   strength: 1 },
    { name: 'Skeleton', strength: 2 },
    { name: 'Skeleton', strength: 2 },
    { name: 'Orc',      strength: 3 },
    { name: 'Orc',      strength: 3 },
    { name: 'Vampire',  strength: 4 },
    { name: 'Vampire',  strength: 4 },
    { name: 'Golem',    strength: 5 },
    { name: 'Golem',    strength: 5 },
    { name: 'Lich',     strength: 6 },
    { name: 'Demon',    strength: 7 },
    { name: 'Dragon',   strength: 9 },
  ];
}

/** All unique monster names (for vorpal target selection). */
export const MONSTER_NAMES = [
  'Goblin', 'Skeleton', 'Orc', 'Vampire', 'Golem', 'Lich', 'Demon', 'Dragon',
] as const;

// ── Equipment definitions ─────────────────────────────────────────────────────

const PLATE_ARMOUR: Equipment = { name: 'Plate Armour', hpBonus: 5, special: 'hp_bonus', description: '+5 HP' };
const KNIGHT_SHIELD: Equipment = { name: 'Knight Shield', hpBonus: 3, special: 'hp_bonus', description: '+3 HP' };
const HOLY_GRAIL: Equipment = { name: 'Holy Grail', hpBonus: 0, special: 'holy_grail', description: 'Defeat all monsters with even strength (2, 4, 6).' };
const TORCH: Equipment = { name: 'Torch', hpBonus: 0, special: 'torch', description: 'Defeat all monsters with strength 3 or less.' };
const VORPAL_SWORD: Equipment = { name: 'Vorpal Sword', hpBonus: 0, special: 'vorpal_sword', description: 'Before the dungeon, choose a monster type. Defeat ALL monsters of that type.' };
const DRAGON_SPEAR: Equipment = { name: 'Dragon Spear', hpBonus: 0, special: 'dragon_spear', description: 'Defeat the Dragon.' };

const CHAINMAIL: Equipment = { name: 'Chainmail', hpBonus: 4, special: 'hp_bonus', description: '+4 HP' };
const LEATHER_SHIELD: Equipment = { name: 'Leather Shield', hpBonus: 3, special: 'hp_bonus', description: '+3 HP' };
const WAR_HAMMER: Equipment = { name: 'War Hammer', hpBonus: 0, special: 'war_hammer', description: 'Defeat the Golem.' };
const VORPAL_AXE: Equipment = { name: 'Vorpal Axe', hpBonus: 0, special: 'vorpal_axe', description: 'Each time a monster is revealed, you may choose to defeat it (decided before seeing the next card).' };
const HEALING_POTION: Equipment = { name: 'Healing Potion', hpBonus: 0, special: 'healing_potion', description: 'If you die, restore HP to the value you had before meeting that monster (once per dungeon).' };

const WALL_OF_FIRE: Equipment = { name: 'Wall of Fire', hpBonus: 6, special: 'hp_bonus', description: '+6 HP' };
const BRACELET_OF_PROTECTION: Equipment = { name: 'Bracelet of Protection', hpBonus: 3, special: 'hp_bonus', description: '+3 HP' };
const OMNIPOTENCE: Equipment = { name: 'Omnipotence', hpBonus: 0, special: 'omnipotence', description: 'After the dungeon, if all monsters were different types, you win even if HP ≤ 0.' };
const DEMONIC_PACT: Equipment = { name: 'Demonic Pact', hpBonus: 0, special: 'demonic_pact', description: 'Defeat the Demon and the monster immediately after it.' };
const POLYMORPH: Equipment = { name: 'Polymorph', hpBonus: 0, special: 'polymorph', description: 'During bidding: swap your drawn monster back into the deck and draw the next one instead.' };

const MITHRIL_ARMOUR: Equipment = { name: 'Mithril Armour', hpBonus: 5, special: 'hp_bonus', description: '+5 HP' };
const BUCKLER: Equipment = { name: 'Buckler', hpBonus: 3, special: 'hp_bonus', description: '+3 HP' };
const RING_OF_POWER: Equipment = { name: 'Ring of Power', hpBonus: 0, special: 'ring_of_power', description: 'Defeat monsters with Strength 2 or less; add their Strength to your current HP.' };
const INVISIBILITY_CLOAK: Equipment = { name: 'Invisibility Cloak', hpBonus: 0, special: 'invisibility_cloak', description: 'Defeat monsters with Strength 6 or more.' };
const VORPAL_DAGGER: Equipment = { name: 'Vorpal Dagger', hpBonus: 0, special: 'vorpal_dagger', description: 'Before the dungeon, choose a monster type. Defeat ALL monsters of that type.' };

// ── Adventurers ───────────────────────────────────────────────────────────────

export const ADVENTURERS: Record<string, Adventurer> = {
  warrior: {
    name: 'Warrior',
    baseHp: 3,
    equipment: [PLATE_ARMOUR, KNIGHT_SHIELD, HOLY_GRAIL, TORCH, VORPAL_SWORD, DRAGON_SPEAR],
  },
  barbarian: {
    name: 'Barbarian',
    baseHp: 4,
    equipment: [CHAINMAIL, LEATHER_SHIELD, TORCH, WAR_HAMMER, VORPAL_AXE, HEALING_POTION],
  },
  mage: {
    name: 'Mage',
    baseHp: 2,
    equipment: [WALL_OF_FIRE, BRACELET_OF_PROTECTION, HOLY_GRAIL, OMNIPOTENCE, DEMONIC_PACT, POLYMORPH],
  },
  rogue: {
    name: 'Rogue',
    baseHp: 3,
    equipment: [MITHRIL_ARMOUR, BUCKLER, RING_OF_POWER, INVISIBILITY_CLOAK, VORPAL_DAGGER, HEALING_POTION],
  },
};

export const ADVENTURER_NAMES = Object.keys(ADVENTURERS);

/** Look up an Equipment object by name from any adventurer's equipment list. */
export function findEquipmentByName(name: string): Equipment | null {
  for (const adv of Object.values(ADVENTURERS)) {
    const eq = adv.equipment.find(e => e.name === name);
    if (eq) return eq;
  }
  return null;
}

/** Serialise a Monster to a string key "name:strength". */
export function serializeMonster(m: Monster): string {
  return `${m.name}:${m.strength}`;
}

/** Deserialise a "name:strength" string back to a Monster. */
export function deserializeMonster(s: string): Monster {
  const [name, strengthStr] = s.split(':');
  return { name, strength: parseInt(strengthStr, 10) };
}
