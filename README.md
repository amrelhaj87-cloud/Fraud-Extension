# FraudShield (browser extension)

Chrome extension (Manifest V3) that flags fraudulent links **before the user clicks**, in Google Search results and Google Maps place cards. It focuses on scams that impersonate UAE entities (Abu Dhabi Police, TAMM, UAE PASS, local banks, Emirates Post, etc.).

Built for the **ScamShield AI** hackathon (42 Abu Dhabi × Abu Dhabi Police).

Everything runs locally: no server and no API key. The only outbound requests are public RDAP lookups: a domain's registration date, and the owner of an IP address when a link uses one.

## Built for the UAE

FraudShield is not a generic link checker. Its rules and wording are built around the scams that target people in the UAE:

| Sector | Entities it knows (official domains are trusted, look-alikes are flagged) |
|---|---|
| Digital identity | UAE PASS, ICP / Emirates ID |
| Government services | TAMM, all `*.gov.ae` domains |
| Law enforcement | Abu Dhabi Police, Dubai Police, Ministry of Interior |
| UAE banks | ADCB, FAB, Emirates NBD, Mashreq, RAKBANK, ADIB, DIB, Emirates Islamic, CBD, NBF |
| Telecom | e& (Etisalat), du |
| Post & courier | Emirates Post, Aramex |
| Utilities & transport | DEWA, ADDC, Salik, RTA |

Every warning names **who** is being impersonated and **which sector** they belong to, for example *"Impersonates UAE PASS (digital identity) but is not its official site"*. The warning page also points victims to Abu Dhabi Police's Aman service (8002626).

**Bilingual:** the whole interface works in Arabic (RTL) or English (LTR): badges, hover cards, the Maps banner, the popup and the warning page. Switch between them with the **ع / EN** button in the popup. Arabic is the default.

## What it does

| Where | What you see |
|---|---|
| Google Search | 🟢 / 🟡 / 🔴 badge with a 0–100 score next to each result. Hovering shows the reasons in Arabic. Sponsored results get flagged and scored higher. High-risk results get a red outline. |
| Google Maps | A floating banner on the open place: official ✅, warning 🟡, or danger 🔴. |
| Any page | **Blocking:** a high-risk site never loads. It's replaced by a warning page (like uBlock's) with the reasons and next steps, plus "go back safely" and "proceed anyway". Proceed allows the site for this session, and the checkbox allows it permanently. This can be turned off in the popup. |
| Every page | **Page scanner:** detects phone-number capture (subscription / OTP scams), card forms on suspicious sites, and ClickFix "Win+R, Ctrl+V" pages. These signals add to the score and can block the page. |
| Downloads | Dangerous files (`.exe`, `.msi`, `.apk`…) are paused when they come from a risky site or start by themselves. A warning tab offers **Delete** or **Keep**. |
| Clipboard | A page that copies a hidden command to your clipboard (ClickFix) is stopped: the copy is dropped and the page is blocked. |
| Toolbar icon | 🟡 yellow with the score when caution is needed, 🔴 red when the page is high risk or blocked, normal otherwise. |
| Popup | The verdict for the current tab, a manual "check a link" box, and every link analyzed on the page, sorted by risk. |

## How the score works (`scoring.js`)

| Signal | Points |
|---|---|
| Official UAE domain, or any `*.gov.ae` | safe (0), checked first |
| Official domain hidden in a subdomain (`bankfab.com.wallet-studio.icu`) | +50 |
| Subdomain shaped like a full domain (`x.com.evil.net`) | +30 |
| Typosquat of a brand (`adp0lice`, `adpolce`) | +50 |
| Brand name inside a non-official domain (`adpolice-fines`) | +45 |
| Risk word (`pay`, `fines`, `verify`, `login`, `delivery`…) | +15, plus another +20 with a brand |
| Abused TLD (`.xyz`, `.top`, `.online`…) | +20 |
| Free hosting (`linktr.ee`, `blogspot`, `netlify`…) with a brand | +40 |
| Homograph (Cyrillic or Greek letters) | +40 |
| Domain younger than 30 days (RDAP) | +35, and always **high** (at least 70) |
| Domain younger than 180 days | +15 |
| Sponsored search result | +15 |
| Link targets a UAE carrier (`op=ae-etisalat`) | +30 |
| Random-looking subdomain | +15 |
| Raw public IP instead of a domain | +45 (medium; high with HTTP) |
| IP of Google's own services, Apple or Meta (local list + RDAP owner) | IP points removed |
| IP of a cloud / hosting provider | +45, reason names the provider |
| IP of a home or mobile connection (ISP) | +45 +20 (high) |
| Local network IP (`192.168.x`, `10.x`, `127.0.0.1`) | 0 |
| Page: fake UAE PASS sign-in (UAE PASS title/heading/logo + Emirates ID, password or OTP field, not on `uaepass.ae`) | +70 (high, blocked) |
| Page: ClickFix instructions | +70 |
| Page: phone capture with bait | +40 (+20 on an otherwise clean domain) |
| Page: card form on a suspicious domain | +25 |
| Page: copies a command to the clipboard (blocked) | +80 |
| Page: fullscreen + keyboard/mouse lock (scareware) | +70 |
| Page: traps the user (2 of: message loop, leave prompt, Back flooding) | +60 |
| Page: popups without a click | +10 / +20 |
| Page: notification request on a suspicious site | +15 |
| HTTP, IP host, many hyphens or subdomains, very long name | +10 to +15 each |

Levels: `low` < 30 ≤ `medium` < 60 ≤ `high`.

Maps adds three rules of its own:
- A free site for a bank, government or courier place
- A place named after a known brand that links to a site that isn't the brand's official one
- A known bank, police or government name with a personal mobile number (05x / +9715x): +60, high on its own, website or not (the fake "customer service" scam)
- A personal mobile number on a bank / government / courier category place: +35

Search results get the same check on their title and snippet: a known name plus a personal mobile number on a non-official site is +60 (high). Official 800 / 600 numbers and landlines never count. The matcher is `phone-claims.js`.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and pick this folder (the one with `manifest.json`)

## Demo (no internet surprises)

```powershell
cd "Fraud Extension"
python -m http.server 8765 --bind 127.0.0.1
```

- Search: http://127.0.0.1:8765/demo/search-mock.html. It has 8 results: 2 official, 1 normal news site, and 5 scams (a sponsored ad, a typosquat, brand + `.top`, an Emirates Post page on `linktr.ee`, and a fake "ADCB customer care" result with a mobile number).
- UAE PASS: http://127.0.0.1:8765/demo/uaepass-mock.html. A fake UAE PASS sign-in that asks for the Emirates ID and an OTP; it is blocked as high risk. Nothing on the page is sent anywhere.
- Maps: http://127.0.0.1:8765/demo/maps-mock.html. Click the tabs to switch between an official bank, a bank on a free link with a mobile number, an impersonating courier site, a fake "Abu Dhabi Police" office with no website and only a mobile number, and a normal shop.

After the demo pages, show the same extension on real Google Search and Maps.

## Tests

```powershell
node test.js        # 86 scoring tests, including 38 false-positive guards
node test-rdap.js   # live RDAP lookup (needs internet)
```

## Team LLM hook

`background.js` exports `llmAnalyze({ url, title, snippet })`. Gray-zone results (`medium`) are sent there with a 6-second timeout.

What the hook receives:
- **Search:** the result title and its visible snippet (up to 400 characters)
- **Maps:** the place name as `title`, and `"category | phone: … | source: Google Maps"` as `snippet`

Return `{ score, reasons }` or `null`. The final score is `max(rulesScore, llmScore)`, and any reasons you return are appended to the rule-based ones.

Example:

```js
export async function llmAnalyze({ url, title, snippet }) {
  const res = await fetch("http://127.0.0.1:8000/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, title, snippet })
  });
  return res.ok ? res.json() : null; // { score: 0-100, reasons: ["…"] }
}
```

Keep API keys in the team's server, never in the extension.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 config |
| `background.js` | Service worker: scoring, RDAP, per-tab results, LLM hook |
| `CHANGELOG.md` | Version history (every change bumps the version) |
| `i18n.js` | Arabic / English strings, UAE brand names and sectors |
| `scoring.js` | Rules engine (pure ES module, also runs in Node) |
| `rdap.js` | Domain age via the IANA RDAP bootstrap, cached for 7 days |
| `ip-intel.js` | Who owns an IP: Google service ranges + RDAP owner, cached for 7 days |
| `ip-ranges.js` | Generated list of Google's own service ranges (`node tools/update-ip-ranges.js`) |
| `page-hooks.js` | In-page hooks: clipboard guard, fullscreen/locks, traps, popups |
| `downloads.js` | Download guard |
| `content-page.js` | Page scanner (phone / card / ClickFix) |
| `content-search.js`, `content.css` | Google Search badges |
| `content-maps.js`, `content-maps.css` | Google Maps banner |
| `phone-claims.js` | Known UAE body + personal mobile number matcher (Search and Maps) |
| `blocker.js` | Blocks high-risk navigations before they load |
| `warning.html`, `warning.js`, `warning.css` | The blocking page |
| `popup.html`, `popup.js`, `popup.css` | Toolbar popup |
| `demo/` | Offline demo pages |
