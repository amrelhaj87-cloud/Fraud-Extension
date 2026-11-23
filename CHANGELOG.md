# Changelog

Every change raises the version in `manifest.json` and `package.json`, gets an entry here, and gets a git tag (`vX.Y.Z`).

- **Minor** (1.2.0 → 1.3.0): a new feature or a new detection rule.
- **Patch** (1.2.0 → 1.2.1): a fix or small tweak.

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

[1.2.0]: https://github.com/amrelhaj87-cloud/Fraud-Extension/releases/tag/v1.2.0
[1.1.0]: https://github.com/amrelhaj87-cloud/Fraud-Extension/releases/tag/v1.1.0
[1.0.0]: https://github.com/amrelhaj87-cloud/Fraud-Extension/releases/tag/v1.0.0
