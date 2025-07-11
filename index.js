const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

const { handleCommand } = require("./case"); // fitur kamu
const { default: pino } = require("pino");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth"); // Folder auth
  const { version, isLatest } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "error" }),
  });

  sock.ev.on("creds.update", saveCreds);

  // ✅ Listen QR Code secara manual
  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("📱 Scan QR ini untuk login:\n");
      qrcode.generate(qr, { small: true }); // Gambar QR di terminal
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log("❌ Koneksi ditutup. Reconnect:", shouldReconnect);
      if (shouldReconnect) {
        startBot();
      }
    } else if (connection === "open") {
      console.log("✅ Bot berhasil terhubung ke WhatsApp!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const body =
    msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!body) return;

    const start = Date.now();
    
    const [command, ...args] = body.trim().split(" ");
    await handleCommand(sock, msg, command.toLowerCase(), args);
    const end = Date.now();
      const elapsed = end - start;
      const jid = msg.key.remoteJid;
      const name = msg.pushName || "Unknown";
      const bodyMsg = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "(No Text)";

      process.stdout.write(
        `\r📩 From: ${name} | Msg: "${bodyMsg}" | Delay: ${elapsed}ms`
      )
  });
}

startBot();