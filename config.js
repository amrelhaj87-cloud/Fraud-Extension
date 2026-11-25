/**
 * FraudShield — cloud settings (Firebase).
 * Fill these in from Firebase console > Project settings > General
 * (see dev/firebase/SETUP.md). While they are empty, reports stay on this
 * device and nothing is sent anywhere.
 *
 * The Web API key is not a secret: it only names the project. Access is
 * controlled by the Firestore security rules (dev/firebase/firestore.rules).
 */
export const FIREBASE = {
  apiKey: "AIzaSyCjiMM19Va5F7xF_EWQCoM25x9_bNQjs9k",
  projectId: "fraudshield-f6aaf"
};

/**
 * Google sign-in with an account picker (any Google account, even when Chrome
 * itself is not signed in). Needs an OAuth client of type "Web application"
 * whose redirect URI is https://<extension id>.chromiumapp.org/ (see
 * dev/firebase/SETUP.md). Empty: falls back to the Chrome profile's account
 * (manifest oauth2 client).
 */
export const GOOGLE = {
  webClientId: ""
};

/**
 * Links shown in Settings > About. Leave one empty to hide it.
 * coffee: a "Buy me a coffee" / Ko-fi / PayPal.me page.
 */
export const LINKS = {
  github: "https://github.com/amrelhaj87-cloud/FraudShield",
  portfolio: "",
  privacy: "",
  coffee: ""
};

export function cloudConfigured() {
  return Boolean(FIREBASE.apiKey && FIREBASE.projectId);
}
