/* global detectCurrency */
const RATES_URL = "https://open.er-api.com/v6/latest/USD";
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // refresh rates every 6 hours

const menuTitle = (code) => `Convert “%s” to ${code}`;

browser.menus.create({
  id: "convert-to-usd",
  title: menuTitle("USD"),
  contexts: ["selection"],
});

async function getTarget() {
  const { targetCurrency } = await browser.storage.local.get("targetCurrency");
  return targetCurrency || "USD";
}

// Keep the menu label in sync with the currency picked in the card.
getTarget().then((code) => browser.menus.update("convert-to-usd", { title: menuTitle(code) }));
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.targetCurrency) {
    browser.menus.update("convert-to-usd", { title: menuTitle(changes.targetCurrency.newValue || "USD") });
  }
});

async function getRates() {
  const cached = await browser.storage.local.get("ratesCache");
  const c = cached.ratesCache;
  if (c && Date.now() - c.fetchedAt < MAX_AGE_MS) return c;
  try {
    const res = await fetch(RATES_URL);
    const data = await res.json();
    if (data.result !== "success") throw new Error("Rate service error");
    const fresh = {
      rates: data.rates, // units of each currency per 1 USD
      updated: data.time_last_update_utc,
      fetchedAt: Date.now(),
    };
    await browser.storage.local.set({ ratesCache: fresh });
    return fresh;
  } catch (e) {
    if (c) return { ...c, stale: true }; // fall back to old rates if offline
    throw e;
  }
}

browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "convert-to-usd") return;
  const frameId = info.frameId || 0;
  const text = (info.selectionText || "").trim();

  let payload;
  try {
    const { rates, updated, stale } = await getRates();
    const { lastCurrency } = await browser.storage.local.get("lastCurrency");
    const target = await getTarget();
    let hostname = "";
    try { hostname = new URL(info.frameUrl || info.pageUrl || tab.url).hostname; } catch {}
    const det = detectCurrency(text, Object.keys(rates), hostname, lastCurrency || "EUR");
    payload = { type: "fxusd-show", text, rates, updated, stale, target, ...det };
  } catch (e) {
    payload = { type: "fxusd-show", text, error: "Couldn't load exchange rates: " + e.message };
  }

  try {
    await browser.tabs.executeScript(tab.id, { file: "overlay.js", frameId });
    await browser.tabs.sendMessage(tab.id, payload, { frameId });
  } catch {
    // Pages like about: or addons.mozilla.org block scripts; show a notification instead.
    let msg = payload.error || "";
    if (!msg && payload.amount != null && payload.rates) {
      const t = payload.rates[payload.target] ? payload.target : "USD";
      const converted = (payload.amount / payload.rates[payload.guess]) * payload.rates[t];
      msg = `${payload.amount} ${payload.guess} ≈ ${converted.toFixed(2)} ${t}` +
        (payload.confident ? "" : ` (currency guessed: ${payload.guess})`);
    }
    browser.notifications.create({
      type: "basic",
      iconUrl: "icon-96.png",
      title: "Convert currency",
      message: msg || "Couldn't read an amount from the selection.",
    });
  }
});
