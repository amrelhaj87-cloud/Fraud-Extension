# FraudShield: technical details

The short overview is in the [README](../README.md). This page keeps the full details.

## Accuracy (measured, not guessed)

`npm run eval` scores the same rules on labelled links. Rules were designed on half of the global set, and the other half (TEST) was never looked at.

| Set | Links | Result |
|---|---|---|
| UAE scam links (hand-labelled, small set) | 14 | **92.9% detected** |
| Global phishing, TEST half (URL only) | 150 | **60.0% detected** |
| Global phishing, TEST half (URL + domain age) | 150 | **67.3% detected** |
| Legitimate sites: top 5000 worldwide, 89 UAE sites, free hosting | 5153 | **1 false alarm** |

Honest limits:
- On the older Phishing.Database list, it flags 13–34%. Many of those links have no clue in the URL at all, and are only caught by a blocklist or by scanning the page.
- `.ae` domains have no public registry API (RDAP), so their age is unknown.

Full tables are in [eval/RESULTS.md](eval/RESULTS.md).


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
- A government payment service in the name ("دفع المخالفات", traffic fines, Salik) with a personal mobile: +60 (high)
- A personal mobile number on a bank / government / courier category place, or a visa / ID service: +35
- A government service listed under an unrelated category (warehouse, shop, flat): +15
- The scanner reads only the open place panel and its own "Website" button; it never borrows a website from the results list

Search results get the same check on their title and snippet: a known name plus a personal mobile number on a non-official site is +60 (high). Official 800 / 600 numbers and landlines never count. The matcher is `phone-claims.js`.

## Report button (demo sign-in)

Risky results have a **🚩 Report** button: on the Maps banner, on the warning page, and in the popup. It opens `report.html` with the site or place already filled in (name, number, address, score, reasons).

- Reporting needs a signed-in user, so reports are not random or malicious. Protection itself never needs sign-in.
- **Demo:** "Sign in with UAE PASS (demo)" signs in with one click, with no real account. In the real version this is the official UAE PASS sign-in, so every report comes from a verified identity.
- The user adds an optional note ("they called and asked for the OTP"), ticks consent, and gets a report number (`FS-0001`). The same site or place is only reported once per user. "My reports" lists them.
- **Demo:** reports are saved on this device (`chrome.storage.local`). Next step: `sendReport()` in `report.js` posts them to a police reports server.
- Sign out from the popup or the report page.

## Technical choices, tools, APIs and data

| Choice | Why |
|---|---|
| **Chrome extension, Manifest V3**, plain JavaScript (ES modules), no framework, no dependencies | No build step, about 100 KB, easy to audit. It runs where the scam is seen: in the browser, inside Search and Maps. |
| **Explainable rules engine** (`scoring.js`) instead of a black-box model | Every warning says *who* is impersonated and *why*, in Arabic or English. It works offline and is instant. No labelled UAE scam data existed to train a model on, so the rules are tested on real data instead (see Accuracy). |
| **Private by design:** no server, no account, no API key | The browsing history never leaves the device. The only network calls are the public RDAP lookups listed below. |
| **Built for the UAE** | Lists of official UAE domains and phone formats (800 / 600 numbers vs. personal 05x mobiles), Arabic brand names, Arabic-first right-to-left interface. |

APIs and data used:

- **RDAP** (the public successor of WHOIS): the domain's registration date, through the IANA bootstrap (`data.iana.org/rdap/dns.json`), and the IP owner through `rdap.arin.net`, which forwards to RIPE or APNIC. Results are cached for 7 days.
- **Google's published IP ranges** (`goog.json` minus `cloud.json`), to tell Google's own servers from rented cloud machines. Refresh them with `node dev/tools/update-ip-ranges.js`.
- **Chrome APIs:** `tabs`, `webNavigation` (block before load), `downloads`, `storage`.
- **Evaluation data** (`dev/eval/data/`): an OpenPhish snapshot, Phishing.Database (MIT), the Tranco top 5000, and hand-labelled UAE scam and legitimate links.

## How to build and run

**Requirements:** Google Chrome (or Edge/Brave). [Node.js](https://nodejs.org) 18+ only for the tests. Python only for the demo pages.

**Run the extension (no build needed):**

1. Clone the repo: `git clone https://github.com/amrelhaj87-cloud/FraudShield.git`
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the cloned folder (the one with `manifest.json`).
4. Pin the FraudShield icon. In the popup, choose ع / EN, and keep "block high-risk sites" on.
5. Search Google, open Google Maps, or paste any link into the popup's **Check a link** box.

**Build the release zip** (Windows PowerShell):

```powershell
npm run build
```

This writes `dist/FraudShield-vX.Y.zip` with only the files Chrome needs.

**Run the tests and the accuracy scale:**

```powershell
npm test
```

```powershell
npm run eval
```

## Demo (no internet surprises)

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Run it from the project folder, then open:

- Search: http://127.0.0.1:8765/dev/demo/search-mock.html. It has 8 results: 2 official, 1 normal news site, and 5 scams (a sponsored ad, a typosquat, brand + `.top`, an Emirates Post page on `linktr.ee`, and a fake "ADCB customer care" result with a mobile number).
- UAE PASS: http://127.0.0.1:8765/dev/demo/uaepass-mock.html. A fake UAE PASS sign-in that asks for the Emirates ID and an OTP; it is blocked as high risk. Nothing on the page is sent anywhere.
- Maps: http://127.0.0.1:8765/dev/demo/maps-mock.html. Click the tabs to switch between an official bank, a bank on a free link with a mobile number, an impersonating courier site, a fake "Abu Dhabi Police" office with no website and only a mobile number, a real-world copy of a "دفع المخالفات" listing filed as a warehouse with a mobile number, and a normal shop. A results list with real police websites sits next to the panel, like on real Maps.

After the demo pages, show the same extension on real Google Search and Maps. A one-minute video script is in [DEMO.md](DEMO.md). The finished video and the presentation are in [submission/](../submission/).

Tests in detail: `node dev/test.js` runs 178 tests (scoring, IP owner, phone numbers, false-alarm guards); `node dev/test-rdap.js` runs a live RDAP lookup (needs internet).

## Next steps

- Send reports to a police dashboard, and use verified report counts as an extra signal (never block on reports alone).
- Add `.ae` WHOIS on a server, since `.ae` has no public RDAP.
- Add an AI second opinion for the gray zone, through the hook below. The API key stays on a server.
- Check phone numbers on any page and in WhatsApp Web.

## AI hook (for the next step)

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

Keep API keys on a server, never in the extension.

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
| `ip-ranges.js` | Generated list of Google's own service ranges (`node dev/tools/update-ip-ranges.js`) |
| `page-hooks.js` | In-page hooks: clipboard guard, fullscreen/locks, traps, popups |
| `downloads.js` | Download guard |
| `content-page.js` | Page scanner (phone / card / ClickFix) |
| `content-search.js`, `content.css` | Google Search badges |
| `content-maps.js`, `content-maps.css` | Google Maps banner |
| `reports.js` | Report button plumbing: saves the draft, opens the report page |
| `report.html`, `report.js`, `report.css` | Report page: demo UAE PASS sign-in, report form, "My reports" |
| `phone-claims.js` | Known UAE body + personal mobile number matcher (Search and Maps) |
| `blocker.js` | Blocks high-risk navigations before they load |
| `warning.html`, `warning.js`, `warning.css` | The blocking page |
| `popup.html`, `popup.js`, `popup.css` | Toolbar popup |
| `submission/` | Hackathon submission: one-minute demo video and the presentation (not in the release zip) |
| `dev/` | Developer files, not in the release zip: `DEMO.md` one-minute video script, `build.ps1` release zip (`npm run build`), `demo/` offline demo pages, `eval/` accuracy scale, `test.js`, `test-rdap.js`, `tools/` |
