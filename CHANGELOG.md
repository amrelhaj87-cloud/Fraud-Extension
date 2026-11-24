# Changelog

Every change raises the version, gets an entry here, and gets a git tag.

- **From 2.3 on, versions have two parts:** every change adds one to the second number (2.3 → 2.4 … 2.9), and a big update moves to the next first number (3.0). `manifest.json` holds `X.Y`, `package.json` holds `X.Y.0` (npm needs three parts), and the tag is `vX.Y`.
- Up to 2.2.0: minor (1.2.0 → 1.3.0) for a feature or rule, patch (1.2.0 → 1.2.1) for a fix.

## [2.4] - 2026-11-24

### Added
- **Phishing.Database in the accuracy scale, as a test-only set** (`eval/data/phish-phishingdb.json`): fixed samples of 2000 links, 2000 domains, and 600 links that name a UAE body, city or `.ae`. Source: github.com/Phishing-Database/Phishing.Database (MIT), ACTIVE lists as of its last update on 2026-10-02, so many entries are already dead.

### Accuracy scale (URL only)
| Phishing.Database | Detected |
|---|---|
| Links (2000) | 13.1% |
| Domains (2000) | 33.6% |
| Links naming UAE / `.ae` (600) | 19.2% |

Why links score so low, out of the 1739 missed: **973 have nothing suspicious in the link at all**, 398 are on free hosting / site builders without a brand in the name, 308 are hacked legitimate sites with the brand only in the path (`/reg-ebill-etisalat/…`), 60 are WordPress-style hacked paths. These need a list lookup or the page scan, not more URL rules. No rule was changed for this set.

## [2.3] - 2026-11-24

### Changed
- **Two-part versions from now on** (2.3, 2.4 … 2.9, then 3.0 for a big update). `manifest.json` holds `2.3`, `package.json` holds `2.3.0` for npm, and the tag is `v2.3`.

### Added
- **Domain age in the accuracy scale.** `node eval/fetch-ages.mjs` looks up registry ages with the extension's own `rdap.js` and caches them in `eval/data/rdap-ages.json`; `npm run eval` then shows a second table, **URL + domain age**, the way the browser scores. Data sets moved to `eval/sets.mjs`, shared by both scripts.

### Accuracy scale
| | URL only | URL + domain age |
|---|---|---|
| Global phishing, TRAIN half | 69.3% | **77.3%** (age known for 92.7%) |
| Global phishing, **TEST half** | 60.0% | **67.3%** (age known for 91.3%) |
| Flagged high, TEST half | 15.3% | 22.0% |
| False alarms, top sites (sample of 400) | 0% | 0.5% (2: young `.live` sites) |
| False alarms, UAE legit sites | 0% | 0% |

### Found
- **`.ae` and `.gov.ae` domains have no public RDAP record** (51 of the 89 UAE sites had no age). The domain-age check, including "under 30 days = high risk", never fires for `.ae` domains. A new `.ae` scam domain is only caught by its name or its page. Fix later in the backend (the .ae registry's WHOIS, which a browser extension cannot reach).

## [2.2.0] - 2026-11-24

### Added (designed on the TRAIN half only)
- **Global brand misspelt on purpose** (`steamconmmunity.life`, `e-docssign.net`): +45. Brands of 7+ letters only, one letter off, same first letter. Look-alike tricks count too (`instagrarn` = rn→m). Sibling brands (Mercado Libre / Livre) and brands' own services (`telegra.ph`) are excluded.
- **Global brand as a subdomain of an unrelated site** (`walletconnect.wallet-veriffy.com`, `bbva.e-docssign.net`): +30. Not on the brand's own site, its country sites (`amazon.co.jp`, `shopee.com.br`), or customer-portal platforms (Zendesk, SharePoint, Salesforce…).
- **Risk word misspelt by an added or dropped letter** (`veriffy`, `acount`): +15. A swapped letter does not count (`postal` is a real word), nor a plain ending (`updates`, `secured`).
- **Global brand + risk word in the domain** (`instagram-verify.com`, `paypal-login.net`): +40. The brand alone is not enough (fan sites). Not in the dataset; covered by tests.
- The scale's legit set now includes 19 real brand subdomains (`developer.paypal.com`, `help.netflix.com`, `aws.amazon.com`…), because the top-5000 list has home pages only.
- 16 regression tests (178 total).

### Accuracy scale (URL only)
| | v2.1.0 | v2.2.0 |
|---|---|---|
| Global phishing, TRAIN half (150) | 64.0% | **69.3%** |
| Global phishing, **TEST half** (150) | 56.0% | **60.0%** |
| Flagged as high (TRAIN / TEST) | 17.3% / 12.0% | 22.0% / 15.3% |
| UAE scams (14) | 92.9% | 92.9% |
| False alarms, all legitimate | 1 of 5134 | **1 of 5153** |

The first version of these rules raised false alarms to 16 (Amazon/Shopee country sites, Mercado Libre vs Livre, `telegra.ph`); all were fixed before release.

## [2.1.0] - 2026-11-24

### Added (designed on the TRAIN half of the global phishing set only)
- **Globally phished brands** (PayPal, Netflix, Instagram, Facebook, WhatsApp, Roblox, Microsoft, Apple/iCloud, Amazon, Binance, Coinbase, MetaMask, Shopee, Mercado Livre, Vodafone, DHL, HSBC…), separate from the UAE list:
  - **On free hosting** (`instagramrecovery.blogspot.com`, `vodafone-admin-app.netlify.app`): +40. The brand must be a whole word or glued to a risk word / digits, so `pineapple` or `metadata` never count. A code-host account named exactly like the brand (`facebook.github.io`) is the brand's own and is not flagged.
  - **A single-site brand on another ending** (`roblox.ss`, `roblox.com.bo`, `paypal.co`): +50. Brands' own extra domains (`facebook.net`, `netflix.net`, `roblox.net`, `icloud.com.cn`) are listed as official.
- **Machine-generated throw-away names on free hosting** (`7h9u4-5zb-xqvi-ynb8i-20-10-2026-aa.pages.dev`): +20.
- **IP address hidden in a name** (`217-77-5-150.sslip.io`, nip.io…): scored like a raw IP (+45).
- More free hosts: `workers.dev`, `godaddysites.com`, `web.app`, `firebaseapp.com`, `glitch.me`, `framer.website`.
- 20 regression tests (162 total).

### Accuracy scale (URL only)
| | v2.0.3 | v2.1.0 |
|---|---|---|
| Global phishing, TRAIN half (150) | 36.7% | **64.0%** |
| Global phishing, **TEST half** (150, never looked at) | 34.7% | **56.0%** |
| Flagged as high (TRAIN / TEST) | 0% / 0% | 17.3% / 12.0% |
| UAE scams (14) | 92.9% | 92.9% |
| False alarms, all legitimate (5134) | 1 | **1** |

The TEST half rose almost as much as the TRAIN half, so the rules generalise rather than memorise. Caveats: the false-alarm fixes for `facebook.net` & co. were made by looking at the legit set, and the legit free-hosting set is small (27 pages).

## [2.0.3] - 2026-11-24

### Fixed (found by the accuracy scale)
- **Mashreq's real site `mashreq.com` was flagged as impersonating Mashreq.** Added `mashreq.com`, plus `etihadwe.ae` (Etihad Water & Electricity, not the airline) and `etihadrail.ae`, to the official list.
- **Sites written in their own script (Thai, Arabic, Chinese…) were flagged as homograph attacks.** The rule now fires only for names disguised as Latin: a label that mixes Latin with another script (`аdcb`, `mаshreq`), or one made entirely of Latin look-alikes (`аррӏе`).

### Added
- UAE body names **written in Arabic inside a domain** count as impersonation (+45): `شرطة-أبوظبي.com`, `المشرق-تحديث.com`, `سالك-شحن.xyz`. Spelling variants (أ/ا, ة/ه) match. Before, these were only caught by the old blanket non-Latin rule.
- 14 regression tests (142 total).

### Accuracy scale
| | v2.0.2 | v2.0.3 |
|---|---|---|
| False alarms, all legitimate (5134) | 7 | **1** |
| False alarms, UAE legit sites (89) | 2.2% | **0.0%** |
| Detection, UAE scams / global train / global test | 92.9% / 36.7% / 34.7% | unchanged |

The one remaining false alarm is `dubaipolice-museum.example.org` from the team's hard-negative set: a made-up domain with "dubaipolice" in its name. Flagging a non-official domain that carries a police name is intended.

## [2.0.2] - 2026-11-24

### Added
- **Accuracy scale** (`eval/`, `npm run eval`). Runs the scorer on labelled data and reports detection and false alarms. See `eval/README.md`.
  - Data: the team's hand-labelled UAE set (32), 300 real OpenPhish URLs split train / test, the top 5000 sites (Tranco), 89 real UAE sites, 27 legitimate pages on free hosting.
  - Baseline, URL only (no domain age, IP owner or page scan):

| | Detection | | False alarms |
|---|---|---|---|
| UAE scams (14) | 92.9% | Top 5000 sites | 0.1% |
| Global phishing, train (150) | 36.7% | UAE legit sites (89) | 2.2% |
| Global phishing, test (150) | 34.7% | All legitimate (5134) | 0.1% (7) |

### Found by the scale (not fixed yet)
- `mashreq.com` (Mashreq's real site) and `etihadwe.ae` (Etihad Water & Electricity) are flagged as impersonation.
- Legitimate Thai sites with non-Latin domain names are flagged as homograph attacks.
- About 40% of missed global phishing is on free hosting (pages.dev, blogspot, vercel.app, workers.dev) with no UAE brand in it.

## [2.0.1] - 2026-11-24

### Added
- Demo helper, hidden on purpose: on the report page, **double-click a report number** (e.g. `FS-0001`) in "My reports" to delete that report. If it was the place or site on the page, the form comes back, so the same scam can be reported again during a demo. Numbers continue from the highest one left, so deleting everything starts again at `FS-0001`.

## [2.0.0] - 2026-11-24

Major version: tonight's work turns FraudShield from a link checker into a tool for the scams that actually hit people in the UAE (fake Maps listings, fake customer-service numbers, fake UAE PASS pages), and lets the user report them.

### Added
- **🚩 Report button** on the Maps banner (medium/high places), the warning page, and the popup (medium/high sites). It opens `report.html` with the site or place filled in: name, phone, address, score and reasons.
- **Sign-in before reporting**, so reports are not random or malicious. Protection never needs sign-in.
  - Demo: "Sign in with UAE PASS (demo)" is one click with no real account. In the real version this is the official UAE PASS sign-in.
  - The popup shows who is signed in, with "My reports" and "Sign out".
- **Report page:** optional note ("they called and asked for the OTP"), required consent, report number (`FS-0001`), one report per site or place per user, and a "My reports" list.
- Demo: reports are saved on this device. After the merge, `sendReport()` in `report.js` posts them to the team backend's citizen-reports API.

### Since 1.5.0 (all tonight)
- 1.5.1 / 1.6.0: raw IP links are rated by who owns the address (Google's own services vs rented cloud vs home connections).
- 1.6.1: renamed to FraudShield.
- 1.7.0: fake UAE PASS sign-in pages are detected and blocked.
- 1.8.0: a known UAE name with a personal mobile number is high risk in Maps and Search.
- 1.8.1: Maps reads only the open place (it had shown a "دفع المخالفات" scam as verified official); government payment services with a mobile number are high risk.

## [1.8.1] - 2026-11-24

### Fixed
- **Maps read the wrong place and called a scam "verified official".** Found on real Google Maps: with the results list and a place open side by side, the scanner took the first heading on the page ("Results") as the name, and, because the place had no website, borrowed the first link on the page, a real police listing's `adpolice.gov.ae`. A "دفع المخالفات" listing with a mobile number showed ✅ 0/100.
  - The scanner now reads only the open place panel (`[role="main"]` with the place's heading, not the `[role="feed"]` results list).
  - The website comes only from the place's own "Website" button. The "any link on the page" fallback is removed.
  - With only the results list open, nothing is shown.

### Added
- Maps: a **government payment service** in the place name ("دفع المخالفات", "سداد", fines, Salik) with a personal mobile number is +60 (high). Visa / residency / Emirates ID services with a mobile are +35 (medium), because typing centres offer them legitimately.
- Maps: a government service filed under an unrelated category (warehouse, shop, flat, restaurant…) adds +15.
- Maps: "Claim this business" (unverified listing) is shown as a reason when the place is already suspicious.
- Demo: the Maps mock now has a results list with real police websites beside the panel (like real Maps), and a copy of the real "دفع المخالفات" listing (warehouse, 056 number). It scores 75 (high).

## [1.8.0] - 2026-11-24

### Added
- **Fake "customer service" numbers** (`phone-claims.js`). Banks, police and government bodies publish landlines and 800 / 600 numbers, never a personal mobile. A known UAE name (English or Arabic) together with a UAE mobile number (`05x`, `+9715x`, `009715x`, Arabic digits too) is now:
  - **Google Maps:** +60, high on its own, **with or without a website**. Before, a place like "شرطة أبوظبي - مكتب سداد المخالفات" with only a mobile number scored 25 (low).
  - **Google Search:** the title and snippet of each result are checked too; a non-official result with a known name and a mobile number gets +60 (high).
  - Short or common words (`fab`, `du`, `e&`, `تم`) do not count as a claim, to avoid false alarms.
- Demo: Maps has a new "شرطة برقم جوال" tab; Search has a fake "ADCB Customer Care" result with a mobile number.

### Changed
- Maps: a personal mobile number on a bank / government / courier category place (no known name) is now +35 (medium) instead of +25.

## [1.7.0] - 2026-11-24

### Added
- **Fake UAE PASS sign-in detection** (page scanner). A page is flagged (+70, high, blocked) when all three hold:
  1. It presents itself as UAE PASS in its **title, headings or logo** ("UAE PASS", "الهوية الرقمية"). A plain "Sign in with UAE PASS" button or link does not count, because many real sites have one that goes to uaepass.ae.
  2. It shows an **Emirates ID field** (name/id with emirates/eid/identity, or a `784-` placeholder), a **password field**, or a **one-time-code (OTP) field**.
  3. It is **not on uaepass.ae**. Official domains (`*.gov.ae`, banks on the official list) are never affected.
- Demo page `demo/uaepass-mock.html`: a harmless fake UAE PASS sign-in ("your traffic fine is overdue") with Emirates ID and OTP fields. It has no form action and sends nothing.

## [1.6.1] - 2026-11-24

### Changed
- **Renamed to FraudShield**, the same name as the team's backend and web app, so the extension and the server read as one product. The new name shows in the toolbar, popup, warning and download pages, Search and Maps labels, and console logs. Internal message IDs and the GitHub repo name are unchanged.

## [1.6.0] - 2026-11-24

### Added
- **IP owner check (`ip-intel.js`).** A link that uses an IP address now gets a second look: who owns that address?
  - **Layer 1, local and instant:** Google publishes its address ranges (`goog.json`) and the subset it rents out as Google Cloud (`cloud.json`). The difference is Google itself (Search, Gmail, YouTube, 8.8.8.8). It ships as `ip-ranges.js` (297 IPv4 + 98 IPv6 prefixes) and is rebuilt with `node tools/update-ip-ranges.js`. `142.250.201.110` is now **low risk** with the reason "IP belongs to Google's own services".
  - **Layer 2, RDAP (cached 7 days):** the registry record of the network (ARIN, redirected to RIPE/APNIC/... as needed) names the owner, which is classified:
    - Apple / Meta own networks: IP points removed.
    - Cloud or hosting (Amazon, Google Cloud, Microsoft, Cloudflare, DigitalOcean, Hetzner, OVH, Linode…): stays medium, and the reason names the provider ("anyone can rent a server there").
    - Home or mobile internet (du, Etisalat, Telefonica, Vodafone…): +20 more, so **high** (often a hacked device).
  - Local network addresses are never sent anywhere.
- The auto-blocker now always runs the owner check for IP links, so Google's own IPs are no longer blocked over HTTP.

## [1.5.1] - 2026-11-24

### Fixed
- **Links that use a raw IP address were rated "Low risk".** A public IP now adds 45 points (medium on its own) instead of 10. With plain HTTP (+15) it reaches high (60) and is blocked by auto-block. Hex/decimal forms (`http://0x8efac96e/`) are covered because the URL parser turns them into dotted form first.
- Local network and loopback addresses (`192.168.x.x`, `10.x`, `172.16–31.x`, `127.0.0.1`, `::1`, `fc00::/7`, `fe80::/10`) are not penalised, so router pages and local dev servers are not flagged. They show the reason "Local network address".

## [1.5.0] - 2026-11-23

### Added
- **Download guard** (`downloads.js`): dangerous file types (`.exe`, `.msi`, `.scr`, `.bat`, `.ps1`, `.hta`, `.apk`, `.iso`…) are paused the moment they start.
  - They stay paused when the page or file host is medium/high risk, or when the download **started by itself** with no click first (drive-by).
  - Archives from high-risk sites are paused too.
  - If the file already finished, it is deleted from disk.
  - A warning tab explains why and offers **Delete the file** or **Keep it anyway**.
- **Clipboard guard (ClickFix):** a page that silently copies a command (PowerShell, `cmd /c`, mshta, `curl | sh`…) to the clipboard is stopped. The copy is dropped, so nothing harmful can be pasted, and the page is scored high (+80) and blocked. Normal copying is untouched.
- **Scareware detection:** fullscreen together with keyboard/mouse lock or a loop of pop-up messages, on a page without a video player (fake "tech support" pages), adds +70.
- **Trap detection:** any two of a pop-up message loop, a "leave this page?" prompt, or Back-button flooding adds +60.
- Popups opened without a click (+10/+20) and notification-permission requests on suspicious sites (+15).
- Demo pages: `demo/scareware-mock.html` (fullscreen fake alert) and `demo/download-mock.html` (automatic harmless "exe").

### Notes
- The ClickFix demo page does not copy anything. A version that copied a harmless command was flagged by Windows Defender as ClickFix malware, so it was removed rather than disguised.

## [1.4.0] - 2026-11-23

### Added
- **Page scanner** (`content-page.js`) on every page. It looks at what the page asks for, not only its link:
  - A phone field with "not a robot / verify / prize / OTP" bait or a +971 prefix (mobile-billing subscription and OTP-theft scams)
  - Bank-card fields on an already suspicious domain
  - **ClickFix** instructions (Win+R, cmd, Ctrl+V with a fake "human verification")

  These signals are added to the domain score, and the page is blocked if the total reaches high.
- **URL rules:** a link that targets a UAE carrier (`op=ae-etisalat`, `carrier=du`) adds +30. A random-looking subdomain (`96dknvhyhd73dazre.fantex.online`) adds +15.
- **Colored toolbar icon** per tab:
  - 🟡 Yellow with the score for medium risk (be careful)
  - 🔴 Red for high risk, or "!" when the page was blocked
  - Normal icon for everything else
- The popup and the warning page show the combined verdict (domain + page).
- Demo pages: `demo/phone-mock.html` (yellow on localhost) and `demo/clickfix-mock.html` (blocked).

## [1.3.0] - 2026-11-23

### Changed
- Any domain registered less than 30 days ago is now **high risk** (score of at least 70), even with no other signal. Before this, a 1-day-old `.buzz` ClickFix page (`nvq.aidev-future.buzz`) scored only 55 (medium).
- The blocker checks domain age (RDAP, cached) for every site that isn't official, not only medium ones, so brand-new scam domains get blocked. In testing, the ClickFix page was replaced by the warning page about 1.6 s after navigation.

## [1.2.0] - 2026-11-23

### Added
- Arabic / English interface with an **ع / EN** switch in the popup (Arabic is the default). Badges, hover card, Maps banner, popup, warning page and every reason follow the chosen language and direction.
- Each warning names the impersonated UAE entity and its sector: digital identity, UAE bank, telecom, government service, law enforcement, post & courier, utilities, transport, airline.
- New brands: ICP and Emirates ID.
- The popup shows the version number.

## [1.1.0] - 2026-11-23

### Added
- High-risk sites are blocked before they load and replaced by a warning page with the reasons, next steps (including Abu Dhabi Police's Aman service, 8002626), "go back safely" and "proceed anyway". Proceed allows the site for this session, and a checkbox allows it permanently.
- A popup switch to turn blocking on or off.
- Detection of an official domain hidden inside a subdomain (`bankfab.com.wallet-studio.icu`), and of subdomains shaped like a full domain.
- New brands: FAB (`bankfab.com`), ADIB, Emirates Islamic, NBF and Etihad. New risk words: wallet, otp, kyc, auth, account, reward, prize, bonus, gift and recharge.

## [1.0.0] - 2026-11-23

### Added
- Rules engine that scores domains for UAE impersonation: typosquats, brand names, risk words, abused TLDs, free hosting, homographs, structure checks and HTTP.
- Domain age through the IANA RDAP bootstrap, cached for 7 days.
- Google Search badges (🟢 🟡 🔴) with a hover card and sponsored-result detection.
- Google Maps banner: free sites for banks or government bodies, places named after a brand that link elsewhere, and personal mobile numbers.
- Popup with the current page, a manual check and the page's results.
- Offline demo pages and 38 false-positive guard tests.
- An LLM hook for the team that receives the result title and snippet.

[1.5.0]: https://github.com/amrelhaj87-cloud/Fraud-Extension/releases/tag/v1.5.0
[1.4.0]: https://github.com/amrelhaj87-cloud/Fraud-Extension/releases/tag/v1.4.0
[1.3.0]: https://github.com/amrelhaj87-cloud/Fraud-Extension/releases/tag/v1.3.0
[1.2.0]: https://github.com/amrelhaj87-cloud/Fraud-Extension/releases/tag/v1.2.0
[1.1.0]: https://github.com/amrelhaj87-cloud/Fraud-Extension/releases/tag/v1.1.0
[1.0.0]: https://github.com/amrelhaj87-cloud/Fraud-Extension/releases/tag/v1.0.0
