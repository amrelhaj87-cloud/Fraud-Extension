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
  apiKey: "",
  projectId: ""
};

export function cloudConfigured() {
  return Boolean(FIREBASE.apiKey && FIREBASE.projectId);
}
