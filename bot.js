const http = require("http");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TARGET_RATIO = 1.18;
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Elke 5 minuten (verander 5 naar 1 voor elke minuut)

let lastState = null;
let lastStatusLog = "Bot is net opgestart, eerste check bezig...";

async function checkRatio() {
  try {
    const [mainRes, xyzRes] = await Promise.all([
      fetch("https://hyperliquid.xyz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids" }),
      }),
      fetch("https://hyperliquid.xyz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids", dex: "xyz" }),
      }),
    ]);

    if (!mainRes.ok || !xyzRes.ok) {
      lastStatusLog = `API fout: ${mainRes.status} / ${xyzRes.status}`;
      console.log(lastStatusLog);
      return;
    }

    const mainPrices = await mainRes.json();
    const xyzPrices = await xyzRes.json();

    const hypePrice = parseFloat(mainPrices["HYPE"]);
    const purrDatPrice = parseFloat(xyzPrices["xyz:PURRDAT"]);

    if (!hypePrice || !purrDatPrice) {
      lastStatusLog = `Prijzen niet gevonden: HYPE=${hypePrice}, PURRDAT=${purrDatPrice}`;
      console.log(lastStatusLog);
      return;
    }

    const currentRatio = hypePrice / purrDatPrice;
    const currentState = currentRatio >= TARGET_RATIO ? "ABOVE" : "BELOW";
    const time = new Date().toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam" });

    lastStatusLog = `[${time}] HYPE: $${hypePrice} | PURR DAT: $${purrDatPrice} | Ratio: ${currentRatio.toFixed(4)} (${currentState})`;
    console.log(lastStatusLog);

    if (!lastState) {
      lastState = currentState;
      console.log("Eerste run geslaagd! Beginstatus opgeslagen:", currentState);
      return;
    }

    if (currentState !== lastState) {
      lastState = currentState;

      const direction = currentState === "ABOVE"
        ? "📈 *Crossed ABOVE* (Boven target)"
        : "📉 *Crossed BELOW* (Onder target)";

      const message = `${direction}\n\nHYPE / PURR DAT ratio is nu *${currentRatio.toFixed(4)}* (Target: ${TARGET_RATIO})\n\n• HYPE: $${hypePrice}\n• PURR DAT: $${purrDatPrice}`;

      await fetch(`https://telegram.org{TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
          parse_mode: "Markdown",
        }),
      });

      console.log("CROSS GEDETECTEERD! Telegram bericht verstuurd.");
    }
  } catch (err) {
    lastStatusLog = `Fout: ${err.message}`;
    console.log(lastStatusLog);
  }
}

// Start direct bij opstarten en herhaal daarna elke 5 minuten
checkRatio();
setInterval(checkRatio, CHECK_INTERVAL_MS);

// Houd een simpele statuspagina open (zodat Koyeb ziet dat de app leeft en jij hem op je telefoon kunt bekijken)
const PORT = process.env.PORT || 8000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(`Hyperliquid Bot actief!\n\nLaatste meting:\n${lastStatusLog}`);
}).listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
