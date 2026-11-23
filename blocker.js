/**
 * Fraud Extension — page blocker.
 * Before a high-risk page loads in a tab, redirect it to warning.html
 * (like uBlock's "page blocked" screen). The user can go back or proceed;
 * "proceed" allows the site for this browser session, and the checkbox
 * allows it permanently.
 */

import { analyzeDomain } from "./scoring.js";
import { getDomainAgeDays, getRegistrableDomain } from "./rdap.js";
import "./i18n.js";

const I18N = globalThis.FE_I18N;

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

export async function isAllowed(hostname) {
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
// Analysis used for blocking: rules decide instantly; every non-official site
// also gets a (cached) RDAP age check, because a domain under 30 days old is
// high risk on its own.
// ---------------------------------------------------------------------------

export async function analyzeForBlock(url) {
  const parsed = new URL(url);
  const { lang } = await getSettings();
  const opts = { protocol: parsed.protocol, path: `${parsed.pathname}${parsed.search}`, lang };
  let result = analyzeDomain(parsed.hostname, opts);
  let ageDays = null;

  if (result.level !== "safe" && result.level !== "high") {
    const domain = getRegistrableDomain(parsed.hostname);
    ageDays = domain ? await getDomainAgeDays(domain).catch(() => null) : null;
    result = analyzeDomain(parsed.hostname, { ...opts, ageDays });
  }

  return { url, hostname: parsed.hostname, ageDays, ...result };
}

// ---------------------------------------------------------------------------
// Page signals (content-page.js) combined with the domain score
// ---------------------------------------------------------------------------

const verdicts = new Map(); // url -> last combined verdict
const pageSignals = new Map(); // url -> { phoneCapture, cardForm, clickFix }
const MAX_REMEMBERED = 100;

function remember(map, key, value) {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_REMEMBERED) map.delete(map.keys().next().value);
}

const SIGNAL_NAMES = [
  "phoneCapture", "cardForm", "clickFix", "clipboardCommand",
  "scareware", "trap", "notifications", "popupSpam"
];

function signalsFromList(list) {
  const names = String(list || "").split(",");
  return Object.fromEntries(SIGNAL_NAMES.map((k) => [k, names.includes(k)]));
}

function signalsToList(signals) {
  return SIGNAL_NAMES.filter((k) => signals && signals[k]).join(",");
}

export function combineWithPage(base, signals, lang) {
  if (!signals || base.level === "safe") return base;

  const t = (key) => I18N.t(key, lang);
  let score = base.score;
  const reasons = [...base.reasons];
  const add = (points, key) => {
    score += points;
    reasons.push(t(key));
  };

  // A page that silently copies a command to the clipboard (we blocked the copy).
  if (signals.clipboardCommand) add(80, "pageClipboard");
  // ClickFix ("Win+R, Ctrl+V" with a fake verification) is never legitimate.
  if (signals.clickFix) add(70, "pageClickFix");
  // Tech-support scareware: fullscreen + locked keyboard/mouse or dialog loop.
  if (signals.scareware) add(70, "pageScareware");
  // Trapping the user on the page (dialog loop, leave-page prompt, Back flooding).
  if (signals.trap) add(60, "pageTrap");
  // Popups opened without a click.
  if (signals.popupSpam) add(base.score >= 15 ? 20 : 10, "pagePopups");
  // Push-notification permission is a common scam/ad channel on shady sites.
  if (signals.notifications && base.score >= 30) add(15, "pageNotifications");
  // A phone field with bait text: strong on a suspicious domain, mild otherwise
  // (normal sites also verify phone numbers at login).
  if (signals.phoneCapture) add(base.score >= 15 ? 40 : 20, "pagePhone");
  // Card fields only matter on a domain that is already suspicious.
  if (signals.cardForm && base.score >= 30) add(25, "pageCard");

  score = Math.min(100, score);
  const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { ...base, score, level, reasons, signals };
}

// ---------------------------------------------------------------------------
// Toolbar icon: yellow = be careful, red = high risk / blocked, normal otherwise
// ---------------------------------------------------------------------------

const COLORS = { medium: "#F79009", high: "#D92D20" };
const iconCache = new Map();
let baseBitmap = null;

async function tintedIcon(color) {
  if (iconCache.has(color)) return iconCache.get(color);
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") return null;

  if (!baseBitmap) {
    const blob = await (await fetch(chrome.runtime.getURL("icons/icon48.png"))).blob();
    baseBitmap = await createImageBitmap(blob);
  }

  const images = {};
  for (const size of [16, 32]) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.22);
    ctx.fill();
    const inset = Math.round(size * 0.14);
    ctx.drawImage(baseBitmap, inset, inset, size - inset * 2, size - inset * 2);
    images[size] = ctx.getImageData(0, 0, size, size);
  }
  iconCache.set(color, images);
  return images;
}

async function setTabIndicator(tabId, verdict, lang, blocked = false) {
  if (!Number.isInteger(tabId) || tabId < 0 || !chrome.action) return;
  const level = verdict ? verdict.level : "low";
  const color = COLORS[level];

  try {
    if (!color) {
      await chrome.action.setBadgeText({ tabId, text: "" });
      await chrome.action.setIcon({
        tabId,
        path: { 16: "icons/icon16.png", 48: "icons/icon48.png", 128: "icons/icon128.png" }
      });
      await chrome.action.setTitle({ tabId, title: "Fraud Extension" });
      return;
    }

    const text = blocked ? "!" : String(verdict.score);
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ tabId, color: level === "medium" ? "#1F2430" : "#FFFFFF" });
    }
    const label = blocked ? I18N.t("blockedBadge", lang) : I18N.t(`level_${level}`, lang);
    await chrome.action.setTitle({ tabId, title: `Fraud Extension — ${label} (${verdict.score}/100)` });

    const images = await tintedIcon(color).catch(() => null);
    if (images) await chrome.action.setIcon({ tabId, imageData: images });
  } catch {
    // Tab closed or navigated away; nothing to update.
  }
}

// ---------------------------------------------------------------------------
// Evaluate a top-level page: score, color the icon, block if high
// ---------------------------------------------------------------------------

async function evaluate(tabId, url, signals) {
  if (!/^https?:/i.test(url)) return null;

  const settings = await getSettings();
  const lang = I18N.resolve(settings.lang);
  const verdict = combineWithPage(await analyzeForBlock(url), signals, lang);
  remember(verdicts, url, verdict);

  await setTabIndicator(tabId, verdict, lang);

  if (verdict.level === "high" && settings.blockHigh) {
    const parsed = new URL(url);
    if (!(await isAllowed(parsed.hostname))) {
      const list = signalsToList(signals);
      const warning =
        `${chrome.runtime.getURL("warning.html")}?u=${encodeURIComponent(url)}` +
        (list ? `&s=${list}` : "");
      await chrome.tabs.update(tabId, { url: warning });
    }
  }
  return verdict;
}

async function onNavigation(tabId, url) {
  try {
    if (!/^https?:/i.test(url)) return;
    const last = recent.get(tabId);
    if (last && last.url === url && Date.now() - last.at < RECENT_MS) return;
    recent.set(tabId, { url, at: Date.now() });
    await evaluate(tabId, url, pageSignals.get(url));
  } catch (error) {
    console.warn("[Fraud Extension] Navigation check failed:", error);
  }
}

async function getVerdict(url, signalList) {
  const known = verdicts.get(url);
  if (known) return known;
  const { lang } = await getSettings();
  const signals = signalList ? signalsFromList(signalList) : pageSignals.get(url);
  return combineWithPage(await analyzeForBlock(url), signals, I18N.resolve(lang));
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
    if (details.frameId === 0) void onNavigation(details.tabId, details.url);
  });

  // Late: catches server-side redirects (e.g. short links) to a bad domain.
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) void onNavigation(details.tabId, details.url);
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
      case "GET_VERDICT":
        return reply(getVerdict(String(message.url), message.signals));
      case "PAGE_SIGNALS": {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        const url = String(message.url || (sender && sender.tab && sender.tab.url) || "");
        if (!Number.isInteger(tabId) || !/^https?:/i.test(url)) return false;
        remember(pageSignals, url, message.signals || {});
        return reply(evaluate(tabId, url, message.signals || {}));
      }
      case "MARK_BLOCKED": {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        return reply(
          getSettings().then((st) =>
            setTabIndicator(tabId, { level: "high", score: Number(message.score) || 100 }, I18N.resolve(st.lang), true)
          )
        );
      }
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
