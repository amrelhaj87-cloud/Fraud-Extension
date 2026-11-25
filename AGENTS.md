# AGENTS.md — how to work on Yaqiz

Read this first. It is the working contract for any AI agent (or person) changing this project. Follow it exactly and the result will match the rest of the codebase.

**Yaqiz – Scam Alerts for Search & Maps** (Arabic: **يقظ**) is a Chrome extension (Manifest V3, plain JavaScript) that warns people about scam links, sites and phone numbers in Google Search, Google Maps and on any page, with Arabic-first explanations. Users can sign in with Google and report scams; the owner reviews reports; approved ones go into a shared list every copy of the extension downloads. It is the personal product of **zerocold** (GitHub: `amrelhaj87-cloud`).

Project story: [dev/HISTORY.md](dev/HISTORY.md). What is left: [dev/ROADMAP.md](dev/ROADMAP.md). Technical details: [dev/DETAILS.md](dev/DETAILS.md).

---

## 1. Talking to the owner

- **Reply in Sudanese Arabic**, simple and direct. Technical names (files, buttons, console menus) stay as they appear on screen.
- The owner is not a full-time developer. For anything they must do in a console (Firebase, Google Cloud, Vercel, Chrome Web Store), give **numbered click-by-click steps** with the exact menu names, and a direct link when there is one. Ask for a screenshot if something fails.
- Give a recommendation, not a list of options. Explain the "why" in one line.
- Say plainly what was **not** tested (for example "not tried in Chrome yet").
- **Never publish to the Chrome Web Store, deploy, delete data or send anything outside this repo without an explicit yes** for that action.
- Do not bring up the old hackathon team or the team repo `42JumpStreet`; work happens only in this repo.

## 2. Every change: version, changelog, tag, push

This is mandatory for **every** change, even docs-only ones.

1. **Version has two parts**: `X.Y`. Each change adds one to `Y` (3.4 → 3.5 … 3.9 → 3.10). A big change (new product stage, rename, major feature set) moves to the next `X` (3.x → 4.0).
2. Update **both**: `manifest.json` → `"version": "X.Y"`, and `package.json` → `"version": "X.Y.0"` (npm needs three parts).
3. Add an entry at the **top** of [CHANGELOG.md](CHANGELOG.md) (under the intro, above the previous version):
   ```
   ## [X.Y] - YYYY-MM-DD

   ### Added / Changed / Fixed / Removed
   - **Short bold summary.** Then what changed and why, in plain English. Mention anything the owner must do (e.g. publish rules).
   ```
4. Run `npm test` — must end with `0 failed`.
5. Commit (message `vX.Y: short summary`), tag `vX.Y`, push `main` and the tag to `origin` (`https://github.com/amrelhaj87-cloud/FraudShield.git`). Only this remote.
6. If the change finishes a roadmap item, tick it in [dev/ROADMAP.md](dev/ROADMAP.md); for a milestone, add a line to [dev/HISTORY.md](dev/HISTORY.md).

## 3. Code rules

- **No libraries, no build step, no remote code.** Plain JS that runs as is. Talk to Firebase over **REST** with `fetch` (see `cloud.js`, `community.js`), never the Firebase SDK.
- **Every user-facing text goes in [i18n.js](i18n.js)**, in **both** `ar` and `en` blocks (same key). Pages use `data-i18n`, `data-i18n-placeholder`, `data-i18n-title`; scripts use `T("key", params)`.
- **Brand in Arabic is «يقظ»** — a masculine noun: «أوقف «يقظ»…», «منع «يقظ»…», «واعتمده «يقظ»…». In English: Yaqiz.
- **Styling** uses CSS variables. Extension pages load [theme.js](theme.js) in `<head>` (Auto / Dark / Light → `<html data-theme>`); define tokens for both themes. RTL first: use logical properties (`inset-inline-start`, `padding-inline-start`, `margin-inline-*`).
- **Messages** between pages and the service worker: `{ type: "UPPER_SNAKE" }`. Cloud messages (`CLOUD_*`) must only answer extension pages (sender URL starts with `chrome.runtime.getURL("")`), never content scripts.
- **Scoring**: `scoring.js` (domain rules), `background.js` (search results), `blocker.js` (pages being opened), `content-maps.js` (Maps places), `community.js` (shared list: listed → at least 85, high). **Official domains scored `safe` are never overridden.**
- Keep comments short and useful: a header block per file saying what it does, and a line on any non-obvious decision.
- Prefer small, surgical edits over rewrites. Match the existing style.

## 4. Data, privacy and security

- **Firebase project** `fraudshield-f6aaf`, Firestore region **me-central1 (Doha)**. Config in [config.js](config.js) (`FIREBASE.apiKey` is a public identifier, not a secret; access is controlled by the rules).
- **Collections**: `reports/{uid}_{hash}` (one per user per site/place, status `pending|approved|rejected`), `admins/{uid}` (owner, set by hand), `public/blocklist` (approved list, public read), `limits/{uid}` (daily counter, max 20).
- **Rules** live in [dev/firebase/firestore.rules](dev/firebase/firestore.rules). **Any change there must be published by the owner by hand** (Firebase → Firestore → Rules → paste → Publish). Always tell them, in the CHANGELOG and in the reply.
- **Never put the owner's email or any personal data in the repo.** The owner is identified by UID only.
- **The extension's private key** (fixed dev ID `eadmfiahjcllmfhnncnfdfghkbgpaeen`) lives in `F:\GitHub\FraudShield-keys`, outside the repo. Never commit `*.pem` (it is in `.gitignore`).
- **Privacy policy must stay true.** If you add any network call or store any new data, update `site/privacy.html` (both languages) and `dev/store/LISTING.md` (permissions / data use) in the same change.
- New permissions in `manifest.json` need a justification line in `dev/store/LISTING.md`.

## 5. Layout

| Path | What |
|---|---|
| `manifest.json` | MV3 manifest (name, version, permissions, `key`, `oauth2`) |
| `background.js` | Service worker: messages, search-result analysis; starts the modules below |
| `scoring.js`, `rdap.js`, `ip-intel.js`, `ip-ranges.js`, `phone-claims.js` | Local scoring: domain rules, domain age (RDAP), IP owner, phone numbers |
| `blocker.js`, `warning.*` | Block high-risk pages before they load; warning page |
| `downloads.js` | Pause dangerous downloads |
| `content-search.js`, `content-maps.js`, `content-page.js`, `page-hooks.js`, `content*.css` | Content scripts (Search badges, Maps banner, page signals) |
| `cloud.js` | Google sign-in + Firestore (reports, owner tools, daily limit) |
| `community.js` | Hourly shared-list sync and matching |
| `config.js` | Firebase / Google client / About links |
| `popup.*` | Toolbar popup: main view + settings view |
| `report.*`, `reports.js` | Report page and report plumbing |
| `admin.*` | Owner review page |
| `i18n.js`, `theme.js` | Texts (AR/EN) and theme |
| `site/` | Public website (landing + privacy), deployed by Vercel from `main` automatically |
| `dev/` | Tests, demo pages, eval data, docs, Firebase rules/setup, store texts — not shipped |

The release zip (`npm run build`) skips `dev/`, `site/`, `dist/`, docs and `package.json`.

## 6. Testing and checking

- `npm test` → `dev/test.js` (scoring, IP owner, phones, shared-list matching). Add tests for any new pure logic.
- `node dev/check-community.mjs` reads the live shared list.
- Syntax check: `node --check file.js` (classic scripts) or `node --input-type=module --check < file.js` (modules: `background.js`, `blocker.js`, `cloud.js`, `community.js`, `config.js`, …).
- To see a page's layout without the extension, render it with headless Chrome (`chrome --headless=new --screenshot=… file:///…`) and look at the image.
- Remind the owner: after a change, **reload the extension** in `chrome://extensions` (⟳) and **refresh open tabs** (content scripts in already-open tabs keep the old code).

## 7. Known facts

| | |
|---|---|
| Live site | https://fraudshield-site-xi.vercel.app (privacy: `/privacy.html`) |
| Repo | https://github.com/amrelhaj87-cloud/FraudShield (name kept for now) |
| Chrome OAuth client | in `manifest.json` → `oauth2.client_id` |
| Web OAuth client | `config.js` → `GOOGLE.webClientId` (empty until the owner creates it) |
| Support link | https://ko-fi.com/zerocold |
| Owner brand | zerocold — footer "Yaqiz vX.Y · by zerocold" |

## 8. Environment tips (Windows)

- Paths contain a space (`F:\GitHub\Fraud Extension`): quote them.
- Long multi-line edits from Bash heredocs can break on quotes; write the edit script to a temp file and run it, or use the editor tools.
- Git warns about LF → CRLF; that is expected and harmless.
