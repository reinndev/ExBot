const fs = require("fs");
const { send } = require("process");
const { text } = require("stream/consumers");

// Load database
const {
  userDb: db,
  saveUserDb: saveDb,
  areaDb,
  saveAreaDb,
  petDb,
  savePetDb,
} = require("./database/database");

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

  // ⛑ Fallback: kalau gak ada yang lolos roll, ambil pet random dari list
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

async function handleCommand(sock, msg, command, args) {
  const from = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;

  // Initialize User
  if (!db[sender]) {
    db[sender] = {
      health: 100,
      maxHealth: 100,
      gold: 0,
      level: 1,
      exp: 0,
      pet: {},
    };
    saveDb();
  }

  const user = db[sender];

  switch (command) {
    // Di bagian case !profile atau !p
    case "!profile":
    case "!p": {
      // New
      let target = sender;
      let isSelf = true;
      let targetName = msg.pushName || "Unknown";
      const mention =
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
      if (mention && mention.length > 0) {
        target = mention[0];
        isSelf = false;
        targetName = mention[0].split("@")[0];
      }
      if (!db[target]) {
        await sock.sendMessage(
          from,
          {
            text: "User tidak ditemukan",
          },
          { quoted: msg }
        );
        break;
      }
      const user = db[target];
      const displayName = isSelf ? `${targetName} (Kamu)` : targetName;

      if (!user) {
        await sock.sendMessage(
          from,
          { text: "User belum punya data." },
          { quoted: msg }
        );
        break;
      }

      const pet = user.pet;
      const now = Math.floor(Date.now() / 1000);
      const maxExp = 50 + (user.level - 1) * 30;
      let profile =
        `━━━━━「 *RPG PROFILE* 」━━━━━\n\n` +
        `╰ 📝 User : ${displayName}\n` +
        `╰ ❤ HP : ${user.health}/${user.maxHealth}\n` +
        `╰ 🌟 Level : ${user.level} (${user.exp}/${maxExp})\n` +
        `╰ 💰 Gold : ${user.gold}`;

      // PETS
      if (pet && pet.id && petDb[pet.id]) {
        const petData = petDb[pet.id];
        const effects = petData.effect || {};
        const lines = [];

        if (effects.winrateBoost) {
          lines.push(`- Winrate +${effects.winrateBoost * 100}%`);
        }

        if (effects.heal) {
          const interval = effects.interval || 300;
          const last = pet.lastHeal || 0;

          if (now - last >= interval) {
            const maxHeal = Math.floor(user.maxHealth * 0.5);
            const currentMaxLimit = user.maxHealth - maxHeal;
            const allowedHeal = Math.max(
              0,
              user.maxHealth - user.health - currentMaxLimit
            );

            if (allowedHeal > 0) {
              const healAmount = Math.min(effects.heal, allowedHeal);
              user.health = Math.min(user.health + healAmount, user.maxHealth);
              pet.lastHeal = now;
              saveDb(); // Jangan lupa simpan
            }
          }

          const nextHeal = Math.max(0, interval - (now - pet.lastHeal));
          const min = Math.floor(nextHeal / 60);
          const sec = nextHeal % 60;
          lines.push(
            `- Heals ${effects.heal} HP (Next Heal in ${min} Minutes ${sec} Seconds, Max 50% HP)`
          );
        }

        if (effects.shield) {
          const recharge = effects.rechargeTime || 2400;
          const last = pet.lastShieldRecharge || 0;
          const nextShield = Math.max(0, recharge - (now - last));
          const min = Math.floor(nextShield / 60);
          const sec = nextShield % 60;
          lines.push(
            `- Shield (${pet.shields}/${effects.shield}) (Recharge in ${min} Minutes ${sec} Seconds)`
          );
        }

        const icon = petData.icon || "🐾"; // default: anjing

        profile +=
          `\n\n╰─「 *PETS* 」\n` +
          `╰️ 📜 Name : ${petData.name} ${icon}\n` +
          `╰️ 📎 Deskripsi : ${petData.description}\n` +
          `╰️ 🔥 Skill :\n` +
          lines.map((l) => `  ${l}`).join("\n") +
          `\n` +
          `╰️ 🌟 Rarity : ${petData.rarity}`;
      }

      await sock.sendMessage(from, { text: profile }, { quoted: msg });
      break;
    }

    // Adventure
    case "!adventure":
    case "!adv":
      const area = parseInt(args[0]) || 1;

      if (!areaDb[area]) {
        await sock.sendMessage(from, {
          text: `Locked`,
        }),
          { quoted: msg };
        break;
      }

      if (db[sender].health <= 0) {
        await sock.sendMessage(
          from,
          {
            text: `Vro Youre dead`,
          },
          { quoted: msg }
        );
        break;
      }

      const chance = getWinrate(area, user.level);
      const won = Math.random() < chance;

      if (won) {
        const goldGain = Math.floor(Math.random() * (50 - 10 + 1)) + 10;
        const expGain = Math.floor(Math.random() * (20 - 5 + 1)) + 5;
        db[sender].gold += goldGain;
        db[sender].exp += expGain;

        await sock.sendMessage(from, {
          text: `━━━━━「 *ADVENTURE* 」━━━━━\n╰ ‼️ Kamu berjelajah dan bertemu kawanan _*Goblin*_\n╰ 💖 Kamu mengalahkan semua goblin\n\n╰ 💰 +${goldGain} Gold\n╰ 🌟 +${expGain} Exp`,
        });

        if (checkLevelUp(db[sender])) {
          await sock.sendMessage(
            from,
            {
              text: `Lu naik level ke level ${db[sender].level} sekarang max HP lu jadi ${db[sender].maxHealth}`,
            },
            { quoted: msg }
          );
        }
      } else {
        db[sender].health -= 10;
        await sock.sendMessage(
          from,
          {
            text: `━━━━━「 *ADVENTURE* 」━━━━━\n╰ ‼️ Kamu berjelajah dan bertemu kawanan _*Goblin*_\n╰ 💔 Para goblin mengalahkanmu\n\n╰ 💔 -10 HP `,
          },
          { quoted: msg }
        );
      }
      saveDb();
      break;

    // Heal
    case "!heal":
      if (db[sender].health >= 100) {
        db[sender].health = 100;
        await sock.sendMessage(
          from,
          {
            text: `Darah lu udah penuh sat`,
          },
          { quoted: msg }
        );
        saveDb();
        break;
      }

      const healGain = Math.floor(Math.random() * (15 - 5 + 1)) + 5;
      db[sender].health += healGain;
      await sock.sendMessage(
        from,
        {
          text: `Berhasil menyembuhkan ${healGain} HP`,
        },
        { quoted: msg }
      );
      saveDb();
      break;

    // Hunt
    case "!hunt":
    case "!h":
      const event = rollHuntEvent();
      let pet;
      // console.log('petsDb is', petDb)
      // console.log('Hunt Event', event)
      // console.log('Selected Pet', pet)

      if (event === "none") {
        await sock.sendMessage(
          from,
          {
            text: "wkwkwkwkwkwk lu ga nemu apa apa",
          },
          { quoted: msg }
        );
        break;
      }

      if (event === "monster") {
        const won = Math.random() > 0.5;

        if (won) {
          const goldGain = Math.floor(Math.random() * 15 + 10);
          db[sender].gold += goldGain;

          await sock.sendMessage(from, {
            text: `━━━━━「 *HUNT* 」━━━━━\n╰ ‼️ Kamu berjelajah dan bertemu kawanan _*Cina*_\n╰ 💖 Kamu mengalahkan semua Cina\n\n╰ 💰 +${goldGain} Gold`,
          });
        } else {
          db[sender].health -= 5;
          await sock.sendMessage(
            from,
            {
              text: `━━━━━「 *HUNT* 」━━━━━\n╰ ‼️ Kamu berjelajah dan bertemu kawanan _*Cina*_\n╰ 💔 Para Cina mengalahkanmu\n\n╰ 💔 -5 HP `,
            },
            { quoted: msg }
          );
          saveDb();
          break;
        }
      }

      if (event === "pet") {
        console.log("✅ Pet Event Triggered");
        pet = getRandomPetByDropRate(petDb);

        if (!pet) {
          await sock.sendMessage(
            from,
            { text: "Kamu menemukan pet Mythical.... dia kabur wkwkwk" },
            { quoted: msg }
          );
          break;
        }

        if (!user.pet || !user.pet.id) {
          user.pet = {
            id: pet.id,
            shields: pet.effect?.shield || 0,
            lastHeal: 0,
            lastShieldRecharge: 0,
          };

          await sock.sendMessage(from, {
            text: `Kamu menemukan pet!\n\nPet: ${pet.name}\nDeskripsi: ${pet.description}\nRarity: ${pet.rarity}`,
          });
        } else {
          await sock.sendMessage(from, {
            text: `Kamu sudah punya pet... yahh kasian padahal dpt pet mythical`,
          });
        }

        saveDb();
        break;
      }

    default:
      break;
  }
}

module.exports = { handleCommand };
