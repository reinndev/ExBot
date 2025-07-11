const fs = require("fs");
const { send } = require("process");
const { text } = require("stream/consumers");

// Load utils
const {
  passiveHealing: petHeal,
  shieldRecharge: petShield,
  rollHuntEvent: rngHunt,
  getRandomPetByDropRate: getRandomPet,
  getWinrate: getWR,
  getUserWinrate: getUserWR,
  checkLevelUp: levelUp,
} = require("./lib/utils");

const { start } = require("./index");

// Load database
const {
  userDb: db,
  saveUserDb: saveDb,
  areaDb,
  saveAreaDb,
  petDb,
  savePetDb,
} = require("./lib/database");

async function handleCommand(sock, msg, command, args) {
  const from = msg.key.remoteJid;
  const sender = msg.key.participant || from;
  const config = require("./config");
  const isGroup = from.endsWith("@g.us");

  // Whitelist check
  if (isGroup && !config.allowedGroup.includes(from)) return;

  // Initialize User
  if (!db[sender]) {
    db[sender] = {
      health: 100,
      maxHealth: 100,
      gold: 0,
      level: 1,
      exp: 0,
      lastOnline: 0,
      pet: {},
    };
    saveDb();
  }

  const user = db[sender];

  switch (command) {
    case "!profile":
    case "!prof":
    case "!p": {
      const now = Math.floor(Date.now() / 1000);
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
      const healed = isSelf ? petHeal(user) : 0;
      if (isSelf) {
        petHeal(user); // Apply healing if self
        petShield(user); // Recharge shield if self
        user.lastOnline = now; // Update last online time
      }
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
      const maxExp = 50 + (user.level - 1) * 30;
      const wr = getUserWR(user);
      let profile =
        `━━━━━「 *RPG PROFILE* 」━━━━━\n\n` +
        `╰ 📝 User : ${displayName}\n` +
        `╰ ❤ HP : ${user.health}/${user.maxHealth}\n` +
        `╰ 🌟 Level : ${user.level} (${user.exp}/${maxExp})\n` +
        `╰ 💰 Gold : ${user.gold}\n` +
        `╰ Wr WR : ${(wr * 100).toFixed(1)}%`;

      // PETS
      if (pet && pet.id && petDb[pet.id]) {
        const petData = petDb[pet.id];
        const effects = petData.effect || {};
        const lines = [];

        if (effects.winrateBoost) {
          lines.push(`- Winrate +${effects.winrateBoost * 100}%`);
        }

        if (effects.heal) {
          const healValue = effects.heal;
          lines.push(`- Heals ${healValue}HP every 1 minutes (max 50% HP)`);
          if (isSelf && healed > 0) {
            lines.push(`- Passive Heal: +${healed}HP applied`);
          }
        }

        if (effects.shield) {
          const recharge = effects.rechargeTime || 2400;
          const last = pet.lastShieldRecharge || 0;
          const next = Math.max(0, recharge - (now - last));
          const min = Math.floor(next / 60);
          const sec = next % 60;
          lines.push(
            `- Shield (${pet.shields}/${pet.maxShields}) (Recharge in ${min}m ${sec}s)`
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

      const chance = getUserWR(user);
      const won = Math.random() < chance;
      const hasShield =
        user.pet?.id &&
        petDb[user.pet.id]?.effect?.shield &&
        user.pet.shields > 0;

      if (won) {
        const goldGain = Math.floor(Math.random() * (50 - 10 + 1)) + 10;
        const expGain = Math.floor(Math.random() * (20 - 5 + 1)) + 5;
        db[sender].gold += goldGain;
        db[sender].exp += expGain;

        await sock.sendMessage(from, {
          text: `━━━━━「 *ADVENTURE* 」━━━━━\n╰ ‼️ Kamu berjelajah dan bertemu kawanan _*Goblin*_\n╰ 💖 Kamu mengalahkan semua goblin\n\n╰ 💰 +${goldGain} Gold\n╰ 🌟 +${expGain} Exp`,
        });

        if (levelUp(db[sender])) {
          await sock.sendMessage(
            from,
            {
              text: `Lu naik level ke level ${db[sender].level} sekarang max HP lu jadi ${db[sender].maxHealth}`,
            },
            { quoted: msg }
          );
        }
      } else {
        if (hasShield) {
          user.pet.shields -= 1;
          await sock.sendMessage(
            from,
            {
              text: `dilindungi`,
            },
            { quoted: msg }
          );
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
      const event = rngHunt();
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
        const chance = getUserWR(user);
        const won = Math.random() < chance;

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
        pet = getRandomPet(petDb);

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
