/**
 * FraudShield — Google sign-in and shared reports (Firebase, plain REST).
 *
 * Sign-in: chrome.identity gives a Google access token for this extension's
 * OAuth client; Firebase Auth exchanges it for a Firebase session
 * (ID token valid 1 hour + refresh token). No Firebase SDK, no remote code.
 *
 * Reports: one Firestore document per user and target, id "<uid>_<hash>", so
 * the same user cannot report the same site or place twice. New reports are
 * "pending" until the owner approves them (rules in dev/firebase/firestore.rules).
 *
 * Messages (from report.html / popup):
 *   CLOUD_STATE    -> { configured, user: { uid, name, email } | null }
 *   CLOUD_SIGN_IN  -> same, after an interactive Google sign-in
 *   CLOUD_SIGN_OUT -> { ok }
 *   CLOUD_REPORT   { report } -> { ok, id, already } | { ok: false, error }
 */

import { FIREBASE, cloudConfigured } from "./config.js";

const SESSION_KEY = "fs:cloud-session";
const AUTH_URL = "https://identitytoolkit.googleapis.com/v1";
const TOKEN_URL = "https://securetoken.googleapis.com/v1/token";

// ---- Session storage -------------------------------------------------------

async function loadSession() {
  const data = await chrome.storage.local.get(SESSION_KEY);
  return data[SESSION_KEY] || null;
}

async function saveSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

function publicUser(session) {
  return session ? { uid: session.uid, name: session.name, email: session.email } : null;
}

// ---- Google + Firebase sign-in --------------------------------------------

function googleToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      // Chrome 105+ returns { token }, older versions the token string.
      const token = typeof result === "string" ? result : result && result.token;
      if (!token) return reject(new Error("No Google token"));
      resolve(token);
    });
  });
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
  return data;
}

async function signIn() {
  const accessToken = await googleToken(true);
  const data = await postJson(`${AUTH_URL}/accounts:signInWithIdp?key=${FIREBASE.apiKey}`, {
    postBody: `access_token=${encodeURIComponent(accessToken)}&providerId=google.com`,
    requestUri: "http://localhost",
    returnSecureToken: true,
    returnIdpCredential: true
  });
  const session = {
    uid: data.localId,
    name: data.displayName || data.fullName || "",
    email: data.email || "",
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000
  };
  await saveSession(session);
  return session;
}

async function signOut() {
  const session = await loadSession();
  await chrome.storage.local.remove(SESSION_KEY);
  try {
    const token = await googleToken(false);
    await new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
    // Revoke so the next sign-in can pick another Google account.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    // No cached token; nothing to clear.
  }
  return Boolean(session);
}

// A valid Firebase ID token, refreshed when it is about to expire.
async function idToken() {
  const session = await loadSession();
  if (!session) return null;
  if (Date.now() < session.expiresAt - 60_000) return session.idToken;

  const res = await fetch(`${TOKEN_URL}?key=${FIREBASE.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`
  });
  if (!res.ok) {
    // Refresh token revoked or expired: the user must sign in again.
    await chrome.storage.local.remove(SESSION_KEY);
    return null;
  }
  const data = await res.json();
  session.idToken = data.id_token;
  session.refreshToken = data.refresh_token || session.refreshToken;
  session.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  await saveSession(session);
  return session.idToken;
}

// ---- Firestore ---------------------------------------------------------------

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Plain JS value -> Firestore REST value.
function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  return { stringValue: String(value) };
}

const clip = (value, max) => String(value || "").slice(0, max);

async function sendReport(raw) {
  const session = await loadSession();
  const token = await idToken();
  if (!session || !token) return { ok: false, error: "signed-out" };

  const r = raw && typeof raw === "object" ? raw : {};
  const target = r.target && typeof r.target === "object" ? r.target : {};
  const key = clip(r.key, 400);
  if (!key) return { ok: false, error: "bad-report" };

  let host = "";
  try {
    host = target.url ? new URL(target.url).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }

  const docId = `${session.uid}_${(await sha256Hex(key)).slice(0, 32)}`;
  const fields = {
    uid: session.uid,
    key,
    kind: target.kind === "place" ? "place" : "site",
    url: clip(target.url, 300),
    host: clip(host, 253),
    name: clip(target.name, 300),
    phone: clip(target.phone, 30),
    address: clip(target.address, 300),
    website: clip(target.website, 300),
    level: clip(target.level, 10),
    score: Number.isFinite(target.score) ? target.score : null,
    reasons: Array.isArray(target.reasons) ? target.reasons.slice(0, 8).map((x) => clip(x, 300)) : [],
    note: clip(r.note, 600),
    status: "pending",
    createdAt: new Date(),
    appVersion: chrome.runtime.getManifest().version
  };
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) };

  const url =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}` +
    `/databases/(default)/documents/reports?documentId=${docId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  if (res.status === 409) return { ok: true, id: docId, already: true };
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: (data.error && data.error.message) || `HTTP ${res.status}` };
  }
  return { ok: true, id: docId, already: false };
}

// ---- Messages ----------------------------------------------------------------

async function state() {
  if (!cloudConfigured()) return { configured: false, user: null };
  const token = await idToken().catch(() => null);
  return { configured: true, user: token ? publicUser(await loadSession()) : null };
}

export function initCloud() {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string" || !message.type.startsWith("CLOUD_")) return false;
    // Only the extension's own pages may use these (not content scripts on web pages).
    if (sender.id !== chrome.runtime.id || !String(sender.url || "").startsWith(chrome.runtime.getURL(""))) {
      return false;
    }

    const reply = (promise) =>
      promise.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error && error.message || error) }));

    if (message.type === "CLOUD_STATE") {
      reply(state());
      return true;
    }
    if (message.type === "CLOUD_SIGN_IN") {
      if (!cloudConfigured()) {
        sendResponse({ configured: false, user: null });
        return false;
      }
      reply(signIn().then((session) => ({ configured: true, user: publicUser(session) })));
      return true;
    }
    if (message.type === "CLOUD_SIGN_OUT") {
      reply(signOut().then(() => ({ ok: true })));
      return true;
    }
    if (message.type === "CLOUD_REPORT") {
      if (!cloudConfigured()) {
        sendResponse({ ok: false, error: "not-configured" });
        return false;
      }
      reply(sendReport(message.report));
      return true;
    }
    return false;
  });
}
