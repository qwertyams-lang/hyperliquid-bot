const fs = require("fs");

async function run() {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  const TARGET_RATIO = 1.18;
  const STATE_FILE = "state.json";

  // 1. Haal prijzen op van Hyperliquid
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
    console.log("API fout:", mainRes.status, xyzRes.status);
    process.exit(1);
  }

  const mainPrices = await mainRes.json();
  const xyzPrices = await xyzRes.json();

  const hypePrice = parseFloat(mainPrices["HYPE"]);
  const purrDatPrice = parseFloat(xyzPrices["xyz:PURRDAT"]);

  if (!hypePrice || !purrDatPrice) {
    console.log("Prijzen niet gevonden:", { hypePrice, purrDatPrice });
    process.exit(1);
  }

  const currentRatio = hypePrice / purrDatPrice;
  const currentState = currentRatio >= TARGET_RATIO ? "ABOVE" : "BELOW";

  console.log(`HYPE: $${hypePrice} | PURR DAT: $${purrDatPrice} | Ratio: ${currentRatio.toFixed(4)} (${currentState})`);

  // 2. Lees vorige status uit state.json
  let lastState = null;
  if (fs.existsSync(STATE_FILE)) {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    lastState = data.state;
  }

  // 3. Eerste keer ooit draaien? Sla beginstatus op
  if (!lastState) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ state: currentState }));
    console.log("Eerste run geslaagd! Beginstatus opgeslagen:", currentState);
    return;
  }

  // 4. Controleer op een CROSS
  if (currentState !== lastState) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ state: currentState }));

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
  } else {
    console.log("Geen cross. Status blijft:", currentState);
  }
}

run();
