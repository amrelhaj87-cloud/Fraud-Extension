/**
 * Fraud Extension — page blocker.
 * Before a high-risk page loads in a tab, redirect it to warning.html
 * (like uBlock's "page blocked" screen). The user can go back or proceed;
 * "proceed" allows the site for this browser session, and the checkbox
 * allows it permanently.
 */

import { analyzeDomain } from "./scoring.js";
import { getDomainAgeDays, getRegistrableDomain } from "./rdap.js";

const SETTINGS_KEY = "fe:settings";
const ALLOW_ALWAYS_KEY = "fe:allow-always";
const ALLOW_SESSION_KEY = "fe:allow-session";
const DEFAULT_SETTINGS = { blockHigh: true, lang: "ar" };
const RECENT_MS = 3000;

// tabId -> { url, at } so onBeforeNavigate + onCommitted don't double-handle.
const recent = new Map();

// ---------------------------------------------------------------------------
// Settings and allowlists
// ---------------------------------------------------------------------------

export async function getSettings() {
  try {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

function sessionArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function readList(area, key) {
  try {
    const data = await area.get(key);
    return Array.isArray(data[key]) ? data[key] : [];
  } catch {
    return [];
  }
}

async function isAllowed(hostname) {
  const host = normalizeHost(hostname);
  const [always, session] = await Promise.all([
    readList(chrome.storage.local, ALLOW_ALWAYS_KEY),
    readList(sessionArea(), ALLOW_SESSION_KEY)
  ]);
  return always.includes(host) || session.includes(host);
}

async function allowHost(hostname, permanent) {
  const host = normalizeHost(hostname);
  const area = permanent ? chrome.storage.local : sessionArea();
  const key = permanent ? ALLOW_ALWAYS_KEY : ALLOW_SESSION_KEY;
  const list = await readList(area, key);
  if (!list.includes(host)) list.push(host);
  await area.set({ [key]: list });
}

function normalizeHost(hostname) {
  return String(hostname || "").toLowerCase().replace(/^www\./, "");
}

// ---------------------------------------------------------------------------
// Analysis used for blocking: rules first, RDAP only when it can change the
// outcome (medium), so most navigations are decided instantly.
// ---------------------------------------------------------------------------

export async function analyzeForBlock(url) {
  const parsed = new URL(url);
  const { lang } = await getSettings();
  const opts = { protocol: parsed.protocol, path: parsed.pathname, lang };
  let result = analyzeDomain(parsed.hostname, opts);
  let ageDays = null;

  if (result.level === "medium") {
    const domain = getRegistrableDomain(parsed.hostname);
    ageDays = domain ? await getDomainAgeDays(domain).catch(() => null) : null;
    result = analyzeDomain(parsed.hostname, { ...opts, ageDays });
  }

  return { url, hostname: parsed.hostname, ageDays, ...result };
}

async function maybeBlock(tabId, url) {
  try {
    if (!/^https?:/i.test(url)) return;

    const last = recent.get(tabId);
    if (last && last.url === url && Date.now() - last.at < RECENT_MS) return;
    recent.set(tabId, { url, at: Date.now() });

    const settings = await getSettings();
    if (!settings.blockHigh) return;

    const parsed = new URL(url);
    if (await isAllowed(parsed.hostname)) return;

    const result = await analyzeForBlock(url);
    if (result.level !== "high") return;

    const warning = `${chrome.runtime.getURL("warning.html")}?u=${encodeURIComponent(url)}`;
    await chrome.tabs.update(tabId, { url: warning });
  } catch (error) {
    console.warn("[Fraud Extension] Block check failed:", error);
  }
}

function pickSettings(message) {
  const patch = {};
  if (typeof message.blockHigh === "boolean") patch.blockHigh = message.blockHigh;
  if (message.lang === "ar" || message.lang === "en") patch.lang = message.lang;
  return patch;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export function initBlocker() {
  if (typeof chrome === "undefined" || !chrome.webNavigation) return;

  // Early: before the request is sent.
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) void maybeBlock(details.tabId, details.url);
  });

  // Late: catches server-side redirects (e.g. short links) to a bad domain.
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) void maybeBlock(details.tabId, details.url);
  });

  chrome.tabs.onRemoved.addListener((tabId) => recent.delete(tabId));

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    const reply = (promise) => {
      promise
        .then((value) => sendResponse(value))
        .catch(() => sendResponse(null));
      return true;
    };

    switch (message.type) {
      case "GET_WARNING":
        return reply(analyzeForBlock(String(message.url)));
      case "ALLOW_SITE":
        return reply(
          allowHost(new URL(String(message.url)).hostname, Boolean(message.permanent))
            .then(() => ({ ok: true }))
        );
      case "GET_SETTINGS":
        return reply(getSettings());
      case "SET_SETTINGS":
        return reply(setSettings(pickSettings(message)));
      default:
        return false;
    }
  });
}
