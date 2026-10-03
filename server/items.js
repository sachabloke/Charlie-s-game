'use strict';
// Weapons, healing items and chest loot tables.

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_INFO = {
  common: { label: 'Common', color: '#b8bcc4', tier: 1, mult: 1.0, chance: 36 },
  uncommon: { label: 'Uncommon', color: '#4cd137', tier: 1, mult: 1.1, chance: 26 },
  rare: { label: 'Rare', color: '#3b9dff', tier: 2, mult: 1.2, chance: 20 },
  epic: { label: 'Epic', color: '#b15cff', tier: 3, mult: 1.35, chance: 12 },
  legendary: { label: 'Legendary', color: '#ffb400', tier: 4, mult: 1.55, chance: 6 },
};

const WEAPONS = {
  pistol: { name: 'Pistol', dmg: 22, rate: 330, speed: 950, mag: 12, reload: 1100, spread: 0.04, range: 650, pellets: 1 },
  smg: { name: 'SMG', dmg: 13, rate: 95, speed: 900, mag: 30, reload: 1500, spread: 0.11, range: 480, pellets: 1 },
  shotgun: { name: 'Shotgun', dmg: 11, rate: 850, speed: 800, mag: 5, reload: 2000, spread: 0.22, range: 330, pellets: 6 },
  rifle: { name: 'Assault Rifle', dmg: 24, rate: 170, speed: 1000, mag: 25, reload: 1800, spread: 0.055, range: 850, pellets: 1 },
  sniper: { name: 'Sniper', dmg: 85, rate: 1300, speed: 1700, mag: 3, reload: 2400, spread: 0.005, range: 1500, pellets: 1 },
};

const CONSUMABLES = {
  bandage: { name: 'Bandage', heal: 15, maxTo: 75, time: 1500, stack: 5 },
  medkit: { name: 'Medkit', heal: 100, maxTo: 100, time: 4000, stack: 2 },
  minishield: { name: 'Mini Shield', shield: 25, maxTo: 50, time: 1500, stack: 6 },
  shieldpotion: { name: 'Shield Potion', shield: 50, maxTo: 100, time: 3000, stack: 3 },
};

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function weighted(entries) {
  const total = entries.reduce((s, e) => s + e[1], 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

function rollRarity() { return weighted(RARITIES.map((r) => [r, RARITY_INFO[r].chance])); }

const WEAPON_WEIGHTS = {
  common: [['pistol', 40], ['smg', 25], ['shotgun', 25], ['rifle', 10]],
  uncommon: [['pistol', 25], ['smg', 30], ['shotgun', 25], ['rifle', 20]],
  rare: [['pistol', 10], ['smg', 25], ['shotgun', 25], ['rifle', 30], ['sniper', 10]],
  epic: [['smg', 20], ['shotgun', 20], ['rifle', 35], ['sniper', 25]],
  legendary: [['shotgun', 15], ['rifle', 40], ['sniper', 45]],
};

function makeWeapon(key, rarity) { return { type: 'weapon', key, rarity, ammo: WEAPONS[key].mag }; }
function makeConsumable(key, count) { return { type: 'consumable', key, count }; }

// What falls out of a chest of a given rarity.
function makeLoot(rarity) {
  const loot = [makeWeapon(weighted(WEAPON_WEIGHTS[rarity]), rarity)];
  const tier = RARITY_INFO[rarity].tier;
  if (tier <= 1) loot.push(pick([makeConsumable('bandage', 3), makeConsumable('minishield', 2), makeConsumable('bandage', 2)]));
  else if (tier === 2) loot.push(pick([makeConsumable('bandage', 3), makeConsumable('minishield', 3), makeConsumable('shieldpotion', 1)]));
  else if (tier === 3) { loot.push(pick([makeConsumable('shieldpotion', 1), makeConsumable('medkit', 1)])); loot.push(makeConsumable('bandage', 2)); }
  else { loot.push(makeConsumable('shieldpotion', 2)); loot.push(makeConsumable('medkit', 1)); }
  return loot;
}

function itemName(item) {
  if (item.type === 'weapon') return `${RARITY_INFO[item.rarity].label} ${WEAPONS[item.key].name}`;
  return `${CONSUMABLES[item.key].name}${item.count > 1 ? ' ×' + item.count : ''}`;
}

module.exports = { RARITIES, RARITY_INFO, WEAPONS, CONSUMABLES, rollRarity, makeLoot, makeWeapon, makeConsumable, itemName, rand, pick };
