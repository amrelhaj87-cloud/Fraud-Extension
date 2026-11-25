# Before publishing: checklist

Everything that can be done in code is done. These steps need your accounts (Google Cloud, Firebase, Vercel, Chrome Web Store), so they are yours.

## Must do

- [ ] **Publish the new Firestore rules** (from 2.25): Firebase > Firestore > Rules > paste [`../firebase/firestore.rules`](../firebase/firestore.rules) > Publish. Without them, sending a report fails, because the report is now written together with the daily counter (`limits/{uid}`).
- [ ] **Sign-in with any Google account** (optional but recommended): create a second OAuth client of type **Web application** (steps in [`../firebase/SETUP.md`](../firebase/SETUP.md), section 2b) and put its client ID in `config.js` > `GOOGLE.webClientId`. Until then, sign-in uses the account signed into Chrome.
- [ ] **Deploy the website** on Vercel: New Project > import the `FraudShield` repo > **Root Directory: `site`** > Framework: Other > Deploy. Then put the address in `config.js` > `LINKS.privacy` (as `https://.../privacy.html`).
- [ ] **OAuth consent screen**: Google Auth Platform > Branding: app name, logo, home page = the Vercel site, privacy policy = `.../privacy.html`, authorized domain = the Vercel domain. Then Audience > **Publish app** (Testing → In production). With only `openid`, `email`, `profile`, Google usually does not require a review.
- [ ] **Choose the name** (see below).

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

"FraudShield" is already used for fraud-prevention products:
- a registered US trademark **FRAUDSHIELD** for fraud-prevention software (Reg. No. 2518088);
- Experian sells **Fraud Shield**; AuthenticID and a Shopify app use "Fraud Shield" too.

No Chrome extension with that exact name was found, but a trademark complaint could get the listing taken down later. Options: keep it (low risk while small), or pick a distinct name before publishing, for example an Arabic-first name. Renaming is a small code change (name, icons text, site).
