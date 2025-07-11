const {
  userDb: db,
  saveUserDb: saveDb,
  areaDb,
  saveAreaDb,
  petDb,
  savePetDb,
} = require("../lib/database.js");

// Hunt Events
function rollHuntEvent() {
  const events = [
    { type: "pet", chance: 0.1 }, // 10%
    { type: "monster", chance: 0.6 }, // 60%
    { type: "none", chance: 0.3 }, // 30%
  ];

  const roll = Math.random();
  console.log("Roll Event", roll);
  let acc = 0;

  for (const event of events) {
    acc += event.chance;
    if (roll < acc) return event.type;
  }

  return "none"; // fallback
}

// RNG Pet
function getRandomPetByDropRate(petDb) {
  const entries = Object.entries(petDb);
  const roll = Math.random();
  let acc = 0;
  console.log("Roll:", roll);
  console.log("Accumulated:", acc);

  for (const [petId, pet] of entries) {
    acc += pet.dropRate;
    if (roll < acc) return { id: petId, ...pet };
  }

  const [fallbackId, fallbackPet] =
    entries[Math.floor(Math.random() * entries.length)];
  return { id: fallbackId, ...fallbackPet };
}
 
// Winrate level system
function getWinrate(areaId, level) {
  const config = areaDb[areaId];
  if (!config) return 0.5;

  if (level < config.minLevel) return 0.1;
  if (level > config.maxLevel) return config.maxChance;

  const scale = (level - config.minLevel) * config.scalePerLevel;
  
  const chance = config.baseChance + scale;
  return Math.min(chance, config.maxChance);
}

// WR User System
function getUserWinrate(user) {
  const area = user.area || 1;
  const level = user.level || 1;
  const pet = user.pet;
  const petEffect = petDb[pet?.id]?.effect || {};

  const baseWr = getWinrate(area, level);
  const boost = petEffect.winrateBoost || 0;
  return Math.min(baseWr + boost, 1);
}

// Level Up System
function checkLevelUp(user) {
  let leveledUp = false;
  let expNeeded = 50 + (user.level - 1) * 30;

  while (user.exp >= expNeeded) {
    user.exp -= expNeeded;
    user.level += 1;
    user.maxHealth += 10;
    user.health = user.maxHealth;
    leveledUp = true;
  }

  return leveledUp;
}

// Pet Skill
// Heal Pet
function passiveHealing(user) {
    const now = Math.floor(Date.now() / 1000);
    user.lastOnline = user.lastOnline || now;

    const offTime = now - user.lastOnline;
    const healPer = 60;
    const healCount = Math.floor(offTime / healPer);
    const effect = petDb[user.pet?.id]?.effect || {};
    const healAmount = effect.heal || 0;

    const healLimit = Math.floor(user.maxHealth * 0.5);
    const healCap = user.maxHealth - healLimit;

    let healedNow = 0;
    if (healCount > 0 && user.health < healCap && healAmount > 0) {
        healedNow = Math.min(healAmount * healCount, healCap - user.health);
        user.health += healedNow
    }

    user.lastOnline = now;
    return healedNow;
}

// Shield Pet
function shieldRecharge(user) {
    const now = Math.floor(Date.now() / 1000);
    const pet = user.pet;
    const petData = petDb[pet?.id];
    const effect = petData?.effect || {};

    if (!effect.shield || !effect.rechargeTime) return;

    pet.shields = typeof pet.shields === "number" ? pet.shields : effect.shield;
    pet.lastShieldRecharge = pet.lastShieldRecharge || now;

    const elapsed = now - pet.lastShieldRecharge;
    const rechargeEach = effect.rechargeTime;
    const maxShield = effect.shield;

    const recharged = Math.floor(elapsed / rechargeEach);

    if (recharged > 0 && pet.shields < maxShield) {
        const newShield = Math.min(pet.shields + recharged, maxShield);
        pet.shields = newShield;
        pet.lastShieldRecharge = now;
    }
}

module.exports = {
    passiveHealing,
    shieldRecharge,
    rollHuntEvent,
    getRandomPetByDropRate,
    getWinrate,
    getUserWinrate,
    checkLevelUp,
}