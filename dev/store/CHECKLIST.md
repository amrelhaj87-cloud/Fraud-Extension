# Before publishing: checklist

Everything that can be done in code is done. These steps need your accounts (Google Cloud, Firebase, Vercel, Chrome Web Store), so they are yours.

## Must do

- [ ] **Publish the new Firestore rules** (from 2.25): Firebase > Firestore > Rules > paste [`../firebase/firestore.rules`](../firebase/firestore.rules) > Publish. Without them, sending a report fails, because the report is now written together with the daily counter (`limits/{uid}`).
- [ ] **Sign-in with any Google account** (optional but recommended): create a second OAuth client of type **Web application** (steps in [`../firebase/SETUP.md`](../firebase/SETUP.md), section 2b) and put its client ID in `config.js` > `GOOGLE.webClientId`. Until then, sign-in uses the account signed into Chrome.
- [ ] **Deploy the website** on Vercel: New Project > import the project's GitHub repo > **Root Directory: `site`** > Framework: Other > Deploy. Then put the address in `config.js` > `LINKS.privacy` (as `https://.../privacy.html`).
- [ ] **OAuth consent screen**: Google Auth Platform > Branding: app name, logo, home page = the Vercel site, privacy policy = `.../privacy.html`, authorized domain = the Vercel domain. Then Audience > **Publish app** (Testing → In production). With only `openid`, `email`, `profile`, Google usually does not require a review.

## At publish time (store)

- [ ] Chrome Web Store developer account: one-time US$5 fee.
- [ ] Build the zip: `npm run build` (the `key` in `manifest.json` is fine to upload; the store keeps its own ID).
- [ ] Fill the listing from [`LISTING.md`](LISTING.md), add screenshots.
- [ ] After the first upload the store shows the item's **ID**. If it differs from `eadmfiahjcllmfhnncnfdfghkbgpaeen`: create a Chrome Extension OAuth client for the new ID (and add `https://<new id>.chromiumapp.org/` to the Web client's redirect URIs), then update `manifest.json` > `oauth2.client_id`, and add the new client ID to Firebase's safelist.
- [ ] Expect a longer review because of `https://*/*` and content scripts on all sites.

## Recommended

- [ ] **Restrict the API key**: Google Cloud > APIs & Services > Credentials > the "Browser key" > API restrictions: Identity Toolkit API, Token Service API, Cloud Firestore API. (Do not add HTTP-referrer restrictions: extensions do not send one.)
- [ ] **Coffee / portfolio links**: fill `config.js` > `LINKS.coffee` and `LINKS.portfolio`; they appear in Settings > About.
- [ ] Firebase > Usage and billing: set a budget alert (stays on the free Spark plan).

## The name

Decided on 2026-11-25: **Yaqiz – Scam Alerts for Search & Maps** (Arabic: يقظ). "FraudShield" was dropped because it is a registered US trademark for fraud-prevention software and Experian sells "Fraud Shield". No product named "Yaqiz" was found.

Optional: rename the GitHub repo from `FraudShield` to `Yaqiz` (GitHub redirects the old address, but update the links in `config.js`, `site/`, `README.md` and `LISTING.md` afterwards).
