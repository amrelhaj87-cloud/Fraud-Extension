/**
 * Yaqiz — shared list of approved reports ("community list").
 *
 * The owner approves reports (admin.html); approved ones are published as one
 * Firestore document, public/blocklist. Every copy of the extension downloads
 * that one document about once an hour (one read, no sign-in, nothing about
 * the user is sent) and checks sites and phone numbers against it locally.
 *
 * A listed site or number becomes high risk (score at least 85) with the
 * reason "reported by N users and confirmed". Official domains that the
 * scorer marks safe are never overridden, so a mistaken approval can not
 * block a real bank or government site.
 */

import { FIREBASE, cloudConfigured } from "./config.js";

const STORE_KEY = "fs:community";
const SYNC_MINUTES = 60;
const ALARM = "fs:community-sync";
export const COMMUNITY_FLOOR = 85;

let index = null; // { version, fetchedAt, sites: {host: n}, phones: {phone: n} }
let loading = null;

// ---- Pure helpers (also used by dev/test.js) ---------------------------------

/** Phone number -> one form for matching: UAE numbers as 05xxxxxxxx, others digits only. */
export function canonicalPhone(raw) {
  let digits = String(raw || "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("971")) digits = `0${digits.slice(3).replace(/^0/, "")}`;
  return digits.length >= 7 ? digits : "";
}

/** Host for matching: lower case, no "www.", no trailing dot. */
export function canonicalHost(raw) {
  return String(raw || "").toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/** Build the lookup index from the public/blocklist entries. */
export function buildIndex(entries, version = 0) {
  const sites = {};
  const phones = {};
  for (const e of Array.isArray(entries) ? entries : []) {
    const n = Math.max(1, Number(e && e.reports) || 1);
    if (e.kind === "site") {
      const host = canonicalHost(e.host);
      if (host.includes(".")) sites[host] = (sites[host] || 0) + n;
    } else if (e.kind === "place") {
      // A place is matched by its phone number only: its "host" may be the
      // Google Maps page it was reported from.
      const phone = canonicalPhone(e.phone);
      if (phone) phones[phone] = (phones[phone] || 0) + n;
    }
  }
  return { version, fetchedAt: Date.now(), sites, phones };
}

/** Reports for this host or any parent domain on the list (evil.example.com -> example.com). */
export function lookupHostIn(idx, hostname) {
  if (!idx) return 0;
  const parts = canonicalHost(hostname).split(".");
  for (let i = 0; i < parts.length - 1; i += 1) {
    const n = idx.sites[parts.slice(i).join(".")];
    if (n) return n;
  }
  return 0;
}

export function lookupPhoneIn(idx, phone) {
  const key = canonicalPhone(phone);
  return idx && key ? idx.phones[key] || 0 : 0;
}

/** UAE mobile / landline / 800 numbers in free text, as canonical phones. */
export function phonesInText(text) {
  const found = new Set();
  const normal = String(text || "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  for (const m of normal.matchAll(/(?:\+|00)?\d[\d\s-]{6,16}\d/g)) {
    const phone = canonicalPhone(m[0]);
    if (phone) found.add(phone);
  }
  return [...found];
}

/**
 * Raise a scored result when the host or a phone number is on the list.
 * `scored` is { score, level, reasons }; safe (official) results stay safe.
 */
export function applyCommunityWith(idx, scored, { hostname = "", text = "", phone = "" } = {}, reasonFor) {
  if (!idx || !scored || scored.level === "safe") return scored;
  let n = hostname ? lookupHostIn(idx, hostname) : 0;
  if (!n) {
    for (const p of [phone, ...phonesInText(text)]) {
      n = lookupPhoneIn(idx, p);
      if (n) break;
    }
  }
  if (!n) return scored;
  const reason = reasonFor(n);
  const score = Math.max(scored.score, COMMUNITY_FLOOR);
  return {
    ...scored,
    score,
    level: "high",
    reasons: scored.reasons.includes(reason) ? scored.reasons : [reason, ...scored.reasons],
    community: n
  };
}

// ---- Sync (service worker) ---------------------------------------------------

async function loadIndex() {
  if (index) return index;
  if (!loading) {
    loading = chrome.storage.local
      .get(STORE_KEY)
      .then((data) => {
        index = data[STORE_KEY] || null;
        return index;
      })
      .catch(() => null)
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

function fromValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) {
    return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  }
  return null;
}

/** Download public/blocklist and keep the index. Returns the entry count, or null on failure. */
export async function syncCommunity() {
  if (!cloudConfigured()) return null;
  try {
    const url =
      `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}` +
      `/databases/(default)/documents/public/blocklist?key=${FIREBASE.apiKey}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) {
      index = buildIndex([], 0);
    } else if (res.ok) {
      const doc = await res.json();
      const fields = doc.fields || {};
      index = buildIndex(fromValue(fields.entries) || [], fromValue(fields.version) || 0);
    } else {
      return null;
    }
    await chrome.storage.local.set({ [STORE_KEY]: index });
    return Object.keys(index.sites).length + Object.keys(index.phones).length;
  } catch {
    return null;
  }
}

export async function applyCommunity(scored, where, reasonFor) {
  return applyCommunityWith(await loadIndex(), scored, where, reasonFor);
}

export async function communityStatus() {
  const idx = await loadIndex();
  return idx
    ? { fetchedAt: idx.fetchedAt, sites: Object.keys(idx.sites).length, phones: Object.keys(idx.phones).length }
    : null;
}

export function initCommunity() {
  if (typeof chrome === "undefined" || !chrome.runtime) return;

  if (chrome.alarms) {
    chrome.alarms.get(ALARM).then((alarm) => {
      if (!alarm) chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: SYNC_MINUTES });
    });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM) void syncCommunity();
    });
  }
  // First run, or the list is older than the sync period: fetch now.
  void loadIndex().then((idx) => {
    if (!idx || Date.now() - idx.fetchedAt > SYNC_MINUTES * 60 * 1000) void syncCommunity();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "COMMUNITY_STATUS") {
      communityStatus().then(sendResponse, () => sendResponse(null));
      return true;
    }
    if (!message || message.type !== "COMMUNITY_PHONE") return false;
    // Maps places without a website: the content script asks about the phone number.
    loadIndex().then((idx) => sendResponse({ reports: lookupPhoneIn(idx, message.phone) }));
    return true;
  });
}
