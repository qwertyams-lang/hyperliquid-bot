const http = require("http");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TARGET_RATIO = 1.18;
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Elke 5 minuten

let lastState = null;
let lastStatusLog = "Bot is net opgestart, eerste check bezig...";

async function checkRatio() {
  try {
    // Haal HYPE en Hyperliquid Strategies (PURR / xyz:PURRDAT) op via CoinGecko (geen 403 datacenter blokkade)
    const [hypeRes, purrRes] = await Promise.all([
      fetch("https://coingecko.com", {
        headers: { "Accept": "application/json", "User-Agent": "HyperliquidRatioBot/1.0" }
      }),
      fetch("https://coingecko.com", {
        headers: { "Accept": "application/json", "User-Agent": "HyperliquidRatioBot/1.0" }
      })
    ]);

    if (!hypeRes.ok || !purrRes.ok) {
      lastStatusLog = `Data API fout: ${hypeRes.status} / ${purrRes.status}`;
      console.log(lastStatusLog);
      return;
    }

    const hypeData = await hypeRes.json();
    const purrData = await purrRes.json();

    const hypePrice = parseFloat(hypeData?.hyperliquid?.usd);

    // Zoek specifiek het Hyperliquid (xyz:PURRDAT) contract op tussen de tickers
    const hlTicker = purrData?.tickers?.find(
      (t) => t.market?.identifier?.toLowerCase().includes("hyperliquid") || t.base?.toUpperCase().includes("PURRDAT")
    );
    const purrDatPrice = parseFloat(hlTicker?.last || purrData?.tickers?.[0]?.last);

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

checkRatio();
setInterval(checkRatio, CHECK_INTERVAL_MS);

const PORT = process.env.PORT || 8000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(`Hyperliquid Bot actief!\n\nLaatste meting:\n${lastStatusLog}`);
}).listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
