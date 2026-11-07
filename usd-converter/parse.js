// Detects the amount and currency in a piece of selected text.
// Loaded by background.js; also exported for Node tests.

// Symbols/abbreviations, longest first so "US$" wins over "$".
// A list with more than one code means the symbol is ambiguous.
const SYMBOLS = [
  ["US$", ["USD"]], ["CA$", ["CAD"]], ["AU$", ["AUD"]], ["NZ$", ["NZD"]],
  ["HK$", ["HKD"]], ["NT$", ["TWD"]], ["MX$", ["MXN"]], ["SG$", ["SGD"]],
  ["C$", ["CAD"]], ["A$", ["AUD"]], ["S$", ["SGD"]], ["R$", ["BRL"]],
  ["€", ["EUR"]], ["£", ["GBP"]], ["₹", ["INR"]], ["₩", ["KRW"]], ["₽", ["RUB"]],
  ["₺", ["TRY"]], ["₫", ["VND"]], ["₱", ["PHP"]], ["₪", ["ILS"]], ["฿", ["THB"]],
  ["₴", ["UAH"]], ["₦", ["NGN"]], ["₡", ["CRC"]], ["₲", ["PYG"]], ["₸", ["KZT"]],
  ["₾", ["GEL"]], ["円", ["JPY"]], ["元", ["CNY"]], ["¥", ["JPY", "CNY"]], ["￥", ["JPY", "CNY"]],
  ["zł", ["PLN"]], ["Kč", ["CZK"]], ["Ft", ["HUF"]], ["RM", ["MYR"]], ["Rp", ["IDR"]],
  ["lei", ["RON"]], ["kr", ["SEK", "NOK", "DKK", "ISK"]], ["Kr", ["SEK", "NOK", "DKK", "ISK"]],
  ["$", ["USD", "CAD", "AUD", "MXN", "NZD", "SGD", "HKD", "TWD"]],
];
// Latin-letter symbols must stand alone (not inside a word).
const NEEDS_BOUNDARY = /^[A-Za-z]+$/;

const WORDS = [
  [/\beuros?\b/i, ["EUR"]], [/\b(pounds?|sterling|quid)\b/i, ["GBP"]],
  [/\byen\b/i, ["JPY"]], [/\b(yuan|rmb|renminbi)\b/i, ["CNY"]],
  [/\bwon\b/i, ["KRW"]], [/\brupees?\b/i, ["INR", "PKR", "LKR", "NPR"]],
  [/\bpesos?\b/i, ["MXN", "PHP", "ARS", "CLP", "COP"]], [/\bfrancs?\b/i, ["CHF"]],
  [/\b(kronor|krona)\b/i, ["SEK", "ISK"]], [/\b(kroner|krone)\b/i, ["NOK", "DKK"]],
  [/\b(reais|real)\b/i, ["BRL"]], [/\bbaht\b/i, ["THB"]], [/\bringgit\b/i, ["MYR"]],
  [/\brupiah\b/i, ["IDR"]], [/\bdong\b/i, ["VND"]], [/\blira\b/i, ["TRY"]],
  [/\brand\b/i, ["ZAR"]], [/\bzloty\b/i, ["PLN"]], [/\bforint\b/i, ["HUF"]],
  [/\b(rubles?|roubles?)\b/i, ["RUB"]], [/\bshekels?\b/i, ["ILS"]],
  [/\bdirhams?\b/i, ["AED", "MAD"]], [/\b(riyals?|rials?)\b/i, ["SAR", "QAR"]],
  [/\bdollars?\b/i, ["USD", "CAD", "AUD", "NZD", "SGD", "HKD"]],
];

// Country TLD -> currency, used only to reorder ambiguous guesses.
const TLD_HINT = {
  jp: "JPY", cn: "CNY", ca: "CAD", au: "AUD", nz: "NZD", mx: "MXN", sg: "SGD",
  hk: "HKD", tw: "TWD", se: "SEK", no: "NOK", dk: "DKK", is: "ISK", in: "INR",
  pk: "PKR", lk: "LKR", np: "NPR", ph: "PHP", ar: "ARS", cl: "CLP", co: "COP",
  ma: "MAD", ae: "AED", sa: "SAR", qa: "QAR", us: "USD",
};

const MULTIPLIERS = [
  [/^\s*(k|thousand)\b/i, 1e3],
  [/^\s*(m|mm|mn|million)\b/i, 1e6],
  [/^\s*(b|bn|billion)\b/i, 1e9],
  [/^\s*万/, 1e4], [/^\s*億/, 1e8], [/^\s*亿/, 1e8],
];

function parseNumber(raw) {
  let s = raw.replace(/[\s  '’]/g, "").replace(/[.,]+$/, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = s.split(sep);
    const isThousands =
      parts.length > 2 || (parts[1].length === 3 && parts[0] !== "0");
    s = isThousands ? parts.join("") : parts.join(".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseAmount(text) {
  const m = text.match(/\d[\d.,\s  '’]*/);
  if (!m) return null;
  let n = parseNumber(m[0].trim());
  if (n === null) return null;
  const after = text.slice(m.index + m[0].length);
  for (const [re, mult] of MULTIPLIERS) {
    if (re.test(after)) { n *= mult; break; }
  }
  return n;
}

function findCandidates(text, knownCodes) {
  // 1. Explicit ISO code (uppercase, standalone), e.g. "EUR 25", "25 GBP".
  const known = new Set(knownCodes);
  const isoRe = /(?<![A-Za-z])([A-Z]{3})(?![A-Za-z])/g;
  let m;
  while ((m = isoRe.exec(text))) {
    if (known.size === 0 || known.has(m[1])) return [m[1]];
  }
  // 2. Symbols.
  for (const [sym, codes] of SYMBOLS) {
    let idx = text.indexOf(sym);
    while (idx >= 0) {
      const before = text[idx - 1] || "", after = text[idx + sym.length] || "";
      const standalone = !NEEDS_BOUNDARY.test(sym) ||
        (!/[A-Za-z]/.test(before) && !/[A-Za-z]/.test(after));
      // "C$" must not be read when it's actually part of "CA$", etc. (handled by order)
      if (standalone) return codes.slice();
      idx = text.indexOf(sym, idx + 1);
    }
  }
  // 3. Currency words.
  for (const [re, codes] of WORDS) if (re.test(text)) return codes.slice();
  return [];
}

/**
 * @param {string} text selected text
 * @param {string[]} knownCodes currency codes the rate source knows
 * @param {string} hostname page hostname, for TLD hints
 * @param {string} fallback currency to suggest when nothing is detected
 * @returns {{amount:number|null, candidates:string[], guess:string, confident:boolean}}
 */
function detectCurrency(text, knownCodes = [], hostname = "", fallback = "EUR") {
  const amount = parseAmount(text);
  let candidates = findCandidates(text, knownCodes);
  if (knownCodes.length) {
    const known = new Set(knownCodes);
    candidates = candidates.filter((c) => known.has(c));
  }
  const confident = candidates.length === 1;
  if (candidates.length > 1) {
    const tld = (hostname.split(".").pop() || "").toLowerCase();
    const hint = TLD_HINT[tld];
    if (hint && candidates.includes(hint)) {
      candidates = [hint, ...candidates.filter((c) => c !== hint)];
    }
  }
  const guess = candidates[0] || fallback;
  return { amount, candidates, guess, confident };
}

if (typeof module !== "undefined") {
  module.exports = { detectCurrency, parseNumber, parseAmount };
}
