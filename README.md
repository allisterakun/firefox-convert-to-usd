# Convert to USD — Firefox extension

Select a foreign price on any web page, right-click, and choose **Convert “…” to USD**. A small card appears next to the selection with the amount in US dollars.

## Features

- Detects ISO codes (`EUR`, `SEK`, `CHF`…), symbols (`€`, `£`, `₩`, `₹`, `R$`, `CA$`, `zł`…) and words ("yen", "euros", "pesos").
- Understands local number formats: `1.234,56`, `1,234.50`, `1 499,00`, `2.5k`, `3 million`.
- Ambiguous symbols (`$`, `¥`, `kr`, "rupees") show a highlighted dropdown so you can pick the currency. The site's country domain is used to choose the first guess.
- Edit the amount or switch currency and the result updates instantly.
- Remembers the last currency you picked.
- Light and dark mode.

## Privacy

No tracking, no data collection. The only network request downloads public exchange rates from [ExchangeRate-API](https://www.exchangerate-api.com) (`open.er-api.com`), cached for 6 hours. Your selected text never leaves the browser, and the extension only runs on a page when you use its menu item.

## Install for development

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and select `usd-converter/manifest.json`.

Temporary add-ons are removed when Firefox restarts.

## Project layout

| File | Purpose |
| --- | --- |
| `usd-converter/manifest.json` | Extension manifest (Manifest V2, Firefox 142+) |
| `usd-converter/background.js` | Context menu, rate fetching and caching |
| `usd-converter/parse.js` | Amount and currency detection |
| `usd-converter/overlay.js` | The card shown on the page |

## Build and lint

```bash
cd usd-converter
npx web-ext lint
npx web-ext build
```

## Credits

Rates By [Exchange Rate API](https://www.exchangerate-api.com).

## License

[MIT](LICENSE)
