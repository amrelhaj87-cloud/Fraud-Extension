# Firebase setup (Google sign-in + shared reports)

Until these steps are done, `config.js` is empty and reports stay on the device. Nothing is sent anywhere.

The extension ID is fixed by the `key` in `manifest.json`:

```
eadmfiahjcllmfhnncnfdfghkbgpaeen
```

(The private key that matches it is kept outside the repo. Never commit a `.pem` file.)

## 1. Firebase project

1. Go to <https://console.firebase.google.com> and create a project (or use one you have), for example `fraudshield`. Google Analytics is not needed.
2. **Firestore Database** > Create database > **Production mode**. Pick a region close to your users (for example `europe-west1` or `me-central1`). The region cannot be changed later.
3. **Authentication** > Get started > **Sign-in method** > **Google** > Enable > pick a support email > Save.

## 2. Google OAuth client for the extension

Firebase projects are Google Cloud projects, so this happens in the same project.

1. Open <https://console.cloud.google.com/apis/credentials> and select the same project.
2. **OAuth consent screen** (if asked): User type **External**, app name `FraudShield`, your support email, scopes `openid`, `email`, `profile` only. While the app is in "Testing", add your own Gmail under **Test users**. Publish it later, before giving the extension to others.
3. **Create credentials** > **OAuth client ID** > Application type **Chrome Extension** > Item ID: `eadmfiahjcllmfhnncnfdfghkbgpaeen` > Create.
4. Copy the client ID (`....apps.googleusercontent.com`) into `manifest.json` > `oauth2.client_id`.
5. Back in Firebase > Authentication > Sign-in method > Google > **Safelist client IDs from external projects**: add the same client ID and save.

## 2b. Sign-in with any Google account (optional, recommended)

The client above signs in with the account that is signed into Chrome. To let people pick any account:

1. Credentials > **Create credentials** > **OAuth client ID** > Application type **Web application**, name `FraudShield web sign-in`.
2. **Authorized redirect URIs**: add `https://eadmfiahjcllmfhnncnfdfghkbgpaeen.chromiumapp.org/`
3. Create, copy the client ID into `config.js` > `GOOGLE.webClientId`.
4. Firebase > Authentication > Sign-in method > Google > safelist: add this client ID too.

## 3. Connect the extension

1. Firebase console > Project settings (gear) > General: copy **Web API key** and **Project ID**. (If there is no Web API key yet, add a Web app under "Your apps" first.)
2. Paste them into `config.js`:

```js
export const FIREBASE = {
  apiKey: "AIza...",
  projectId: "fraudshield-xxxxx"
};
```

The Web API key is not a secret; the security rules below decide who can read and write.

## 4. Security rules

Firestore Database > **Rules**: replace everything with the content of [`firestore.rules`](firestore.rules) and **Publish**.

What the rules allow:

| Who | Can |
|---|---|
| Anyone | read `public/*` (the approved list, coming in Phase 3) |
| Signed-in user | create one `pending` report per site/place, read only their own reports |
| Owner (admin) | read all reports, set `approved` / `rejected`, write `public/*` |
| Nobody | edit or delete someone else's report, make themselves admin |

## 5. Make yourself the owner

1. Reload the extension, open any report page and sign in with Google once.
2. Firebase > Authentication > Users: copy your **User UID**.
3. Firestore > Start collection `admins` > Document ID = your UID > add any field (for example `role` = `owner`) > Save.

## 6. Test

1. `chrome://extensions` > reload FraudShield (the ID must show `eadmfiahjcllmfhnncnfdfghkbgpaeen`).
2. Open a risky site, press 🚩 Report, sign in with Google, send.
3. Firestore > `reports`: a new document with `status: "pending"`.
4. Sending the same site again says "You already reported this".

## Costs

The free Spark plan is enough to start: 50,000 reads, 20,000 writes per day and 1 GiB storage. Every extension will read the approved list as **one** document (Phase 3), so 1,000 users syncing every hour is about 24,000 reads a day.
