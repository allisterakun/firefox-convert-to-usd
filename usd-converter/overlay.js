// Injected into the page on demand. Shows a small card next to the selection.
(() => {
  if (window.__fxUsdOverlayLoaded) return;
  window.__fxUsdOverlayLoaded = true;

  let host = null;

  const CSS = `
    :host { all: initial; }
    .card {
      --bg: #ffffff; --fg: #1d1d1f; --muted: #6b6b70; --line: #d9d9de;
      --accent: #1f7a4d; --warn-bg: #fff4d6; --warn-fg: #7a5500; --warn-line: #e0a800;
      position: absolute; z-index: 2147483647; width: 300px; box-sizing: border-box;
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      background: var(--bg); color: var(--fg); border: 1px solid var(--line);
      border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.18); padding: 12px;
    }
    @media (prefers-color-scheme: dark) {
      .card { --bg: #2b2a33; --fg: #f4f4f6; --muted: #a8a8b3; --line: #4a4955;
              --accent: #4cc38a; --warn-bg: #3d3420; --warn-fg: #ffd77a; --warn-line: #b38600; }
    }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .title { font-weight: 600; }
    .x { all: unset; cursor: pointer; color: var(--muted); font-size: 18px; line-height: 1; padding: 0 4px; }
    .x:hover { color: var(--fg); }
    .src { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px; }
    .row { display: flex; gap: 6px; }
    input, select {
      font: inherit; color: var(--fg); background: var(--bg);
      border: 1px solid var(--line); border-radius: 6px; padding: 5px 7px; min-width: 0;
    }
    input { flex: 1 1 45%; }
    select { flex: 1 1 55%; }
    select.unsure { border-color: var(--warn-line); box-shadow: 0 0 0 2px var(--warn-bg); }
    .warn { display: none; margin-top: 8px; padding: 6px 8px; border-radius: 6px;
            background: var(--warn-bg); color: var(--warn-fg); font-size: 12px; }
    .warn.show { display: block; }
    .out { margin-top: 10px; font-size: 22px; font-weight: 650; color: var(--accent); }
    .foot { margin-top: 4px; color: var(--muted); font-size: 11px; }
    .credit { margin-top: 6px; font-size: 10px; }
    .credit a { color: var(--muted); text-decoration: underline; }
    .credit a:hover { color: var(--fg); }
    .err { color: #c0392b; }
  `;

  function close() {
    if (host) host.remove();
    host = null;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function onOutside(e) {
    if (host && !e.composedPath().includes(host)) close();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }

  function anchorRect() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width || r.height) return r;
    }
    const el = document.activeElement; // selection inside an <input>/<textarea>
    if (el && el !== document.body) return el.getBoundingClientRect();
    return null;
  }

  function currencyName(code) {
    try {
      return new Intl.DisplayNames(["en"], { type: "currency" }).of(code);
    } catch { return code; }
  }

  function readAmount(str) {
    const n = Number(String(str).replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  function show(msg) {
    close();
    host = document.createElement("div");
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="head"><span class="title">Convert to USD</span><button class="x" title="Close">×</button></div>
      <div class="src"></div>
      <div class="row">
        <input class="amt" type="text" inputmode="decimal" placeholder="Amount" aria-label="Amount">
        <select class="cur" aria-label="Currency"></select>
      </div>
      <div class="warn">Couldn't tell which currency this is. Pick one from the list.</div>
      <div class="out"></div>
      <div class="foot"></div>
      <div class="credit"><a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a></div>`;
    root.append(style, card);
    document.documentElement.appendChild(host);

    const $ = (s) => card.querySelector(s);
    $(".x").addEventListener("click", close);
    $(".src").textContent = `“${msg.text}”`;
    $(".src").title = msg.text;

    if (msg.error) {
      $(".row").remove();
      $(".out").innerHTML = "";
      $(".out").className = "out err";
      $(".out").style.fontSize = "13px";
      $(".out").textContent = msg.error;
    } else {
      const amt = $(".amt"), cur = $(".cur"), out = $(".out"), foot = $(".foot");
      const codes = Object.keys(msg.rates).sort();

      const addGroup = (label, list) => {
        const g = document.createElement("optgroup");
        g.label = label;
        for (const c of list) {
          const o = document.createElement("option");
          o.value = c;
          o.textContent = `${c} – ${currencyName(c)}`;
          g.appendChild(o);
        }
        cur.appendChild(g);
      };
      const likely = msg.candidates.length ? msg.candidates : [msg.guess];
      addGroup(msg.confident ? "Detected" : "Likely", likely);
      addGroup("All currencies", codes.filter((c) => !likely.includes(c)));
      cur.value = msg.guess;

      if (!msg.confident) {
        cur.classList.add("unsure");
        $(".warn").classList.add("show");
        if (msg.candidates.length > 1) {
          $(".warn").textContent =
            `This symbol is used by several currencies (${msg.candidates.join(", ")}). Check the selection below.`;
        }
      }
      if (msg.amount != null) amt.value = String(+msg.amount.toFixed(6));

      const update = () => {
        const a = readAmount(amt.value);
        const rate = msg.rates[cur.value];
        if (a == null || !rate) { out.textContent = "—"; foot.textContent = ""; return; }
        out.textContent = usdFmt.format(a / rate);
        const per = 1 / rate;
        foot.textContent = `1 ${cur.value} = ${per < 0.01 ? per.toPrecision(3) : per.toFixed(4)} USD` +
          (msg.updated ? ` · rates from ${new Date(msg.updated).toLocaleDateString()}` : "") +
          (msg.stale ? " (offline, cached)" : "");
      };
      amt.addEventListener("input", update);
      cur.addEventListener("change", () => {
        cur.classList.remove("unsure");
        $(".warn").classList.remove("show");
        try { browser.storage.local.set({ lastCurrency: cur.value }); } catch {}
        update();
      });
      update();
      setTimeout(() => (msg.confident ? null : cur.focus()), 0);
    }

    // Position next to the selection, kept inside the viewport.
    const r = anchorRect();
    const w = 300, h = card.offsetHeight || 180, pad = 8;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    let left = r ? r.left : vw - w - 16;
    let top = r ? r.bottom + pad : 16;
    if (r && top + h > vh) top = Math.max(pad, r.top - h - pad);
    left = Math.min(Math.max(pad, left), vw - w - pad);
    card.style.left = `${left + window.scrollX}px`;
    card.style.top = `${top + window.scrollY}px`;

    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "fxusd-show") show(msg);
  });
})();
