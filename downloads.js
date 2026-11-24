/**
 * FraudShield — download guard.
 * When a dangerous file type starts downloading (.exe, .msi, .scr, .ps1, .apk...)
 * it is paused at once, then checked:
 *   - Is the page or the file host suspicious (medium/high, new domain...)?
 *   - Did the download start by itself, with no click or key press first?
 * If so, it stays paused (or is deleted if it already finished) and a warning
 * tab opens, where the user can delete it or keep it. Otherwise it resumes.
 */

import { analyzeForBlock, getSettings, isAllowed } from "./blocker.js";
import "./i18n.js";

const I18N = globalThis.FE_I18N;

const DANGEROUS = new Set([
  "exe", "msi", "msix", "msixbundle", "appx", "appinstaller", "scr", "pif", "com", "bat", "cmd",
  "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "lnk", "cpl", "reg", "jar",
  "apk", "xapk", "iso", "img", "vhd", "vhdx", "dmg", "pkg", "dll", "sys"
]);
const ARCHIVES = new Set(["zip", "rar", "7z", "cab", "gz", "tgz", "xz"]);
const DANGEROUS_MIME = /x-msdownload|x-msi|x-ms-installer|vnd\.microsoft\.portable-executable|x-dosexec|android\.package-archive|x-sh|x-bat/i;

const ACTIVITY_WINDOW_MS = 8000;
const PENDING_KEY = "fe:downloads";

// host -> last click / key press time, reported by content-page.js
const activity = new Map();

export function noteActivity(url) {
  try {
    activity.set(new URL(url).hostname, Date.now());
  } catch {
    // Ignore bad URLs.
  }
}

function extOf(name) {
  const clean = String(name || "").split(/[?#]/)[0];
  const base = clean.split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function fileKind(item) {
  const ext = extOf(item.filename) || extOf(safePath(item.finalUrl || item.url));
  if (DANGEROUS.has(ext)) return { kind: "dangerous", ext };
  if (ARCHIVES.has(ext)) return { kind: "archive", ext };
  if (DANGEROUS_MIME.test(item.mime || "")) return { kind: "dangerous", ext: ext || "exe" };
  return { kind: ext ? "normal" : "unknown", ext };
}

function safePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function httpUrl(url) {
  return /^https?:/i.test(String(url || "")) ? String(url) : null;
}

async function waitForFilename(id, tries = 15) {
  for (let i = 0; i < tries; i += 1) {
    const [item] = await chrome.downloads.search({ id });
    if (!item) return null;
    if (item.filename) return item;
    await new Promise((r) => setTimeout(r, 100));
  }
  const [item] = await chrome.downloads.search({ id });
  return item || null;
}

async function savePending(id, info) {
  try {
    const area = chrome.storage.session || chrome.storage.local;
    const data = await area.get(PENDING_KEY);
    const all = data[PENDING_KEY] || {};
    all[id] = info;
    await area.set({ [PENDING_KEY]: all });
  } catch {
    // Ignore.
  }
}

async function loadPending(id) {
  try {
    const area = chrome.storage.session || chrome.storage.local;
    const data = await area.get(PENDING_KEY);
    return (data[PENDING_KEY] || {})[id] || null;
  } catch {
    return null;
  }
}

async function handleCreated(created) {
  const settings = await getSettings();
  if (!settings.blockHigh) return;

  let item = created;
  let kind = fileKind(item);
  if (kind.kind === "normal") return;

  // Pause first, decide second: a malicious file must not finish while we check.
  let paused = false;
  try {
    if (item.state === "in_progress") {
      await chrome.downloads.pause(item.id);
      paused = true;
    }
  } catch {
    // Already finished or not pausable.
  }

  if (kind.kind === "unknown") {
    item = (await waitForFilename(item.id)) || item;
    kind = fileKind(item);
  }
  if (kind.kind === "normal" || kind.kind === "unknown") {
    if (paused) chrome.downloads.resume(item.id).catch(() => {});
    return;
  }

  const lang = I18N.resolve(settings.lang);
  const t = (key, params) => I18N.t(key, lang, params);
  const pageUrl = httpUrl(item.referrer);
  const fileUrl = httpUrl(item.finalUrl || item.url);

  // Score the page that started it and the host that serves the file.
  const verdicts = [];
  for (const url of [pageUrl, fileUrl]) {
    if (!url) continue;
    try {
      verdicts.push(await analyzeForBlock(url));
    } catch {
      // Ignore one failed lookup.
    }
  }
  const worst = verdicts.sort((a, b) => b.score - a.score)[0] || null;

  const pageHost = pageUrl ? new URL(pageUrl).hostname : "";
  const lastActive = pageHost ? activity.get(pageHost) || 0 : Date.now();
  const automatic = Boolean(pageHost) && Date.now() - lastActive > ACTIVITY_WINDOW_MS;

  const allowedHost = (pageHost && (await isAllowed(pageHost))) ||
    (fileUrl && (await isAllowed(new URL(fileUrl).hostname)));
  const risky = worst && (worst.level === "medium" || worst.level === "high");
  const block = !allowedHost && (
    (kind.kind === "dangerous" && (risky || automatic)) ||
    (kind.kind === "archive" && worst && worst.level === "high")
  );

  if (!block) {
    if (paused) chrome.downloads.resume(item.id).catch(() => {});
    return;
  }

  const reasons = [t(kind.kind === "dangerous" ? "dlExecutable" : "dlArchive", { ext: kind.ext })];
  if (automatic) reasons.push(t("dlAuto"));
  if (worst) {
    for (const r of worst.reasons) {
      if (!I18N.isReason(r, "ageUnknown") && !reasons.includes(r)) reasons.push(r);
    }
  }
  const score = Math.min(100, Math.max(worst ? worst.score : 0, 60) + (automatic ? 20 : 0));

  // If it already finished, delete the file from disk.
  let removed = false;
  const [now] = await chrome.downloads.search({ id: item.id });
  if (now && now.state === "complete") {
    await chrome.downloads.removeFile(item.id).catch(() => {});
    removed = true;
  }

  const filename = (now && now.filename ? now.filename : item.filename || "").split(/[\\/]/).pop() ||
    safePath(fileUrl || "").split("/").pop() || "file";

  await savePending(item.id, {
    id: item.id,
    filename,
    source: pageUrl || fileUrl || "",
    fileUrl: fileUrl || "",
    score,
    reasons,
    removed
  });

  const warning =
    `${chrome.runtime.getURL("warning.html")}?d=${item.id}` +
    `&u=${encodeURIComponent(pageUrl || fileUrl || "")}`;
  await chrome.tabs.create({ url: warning, active: true });
}

export function initDownloadGuard() {
  if (typeof chrome === "undefined" || !chrome.downloads) return;

  chrome.downloads.onCreated.addListener((item) => {
    handleCreated(item).catch((error) =>
      console.warn("[FraudShield] Download check failed:", error)
    );
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    if (message.type === "USER_ACTIVITY") {
      noteActivity(message.url || (sender.tab && sender.tab.url));
      return false;
    }

    if (message.type === "GET_DOWNLOAD") {
      loadPending(Number(message.id)).then(sendResponse, () => sendResponse(null));
      return true;
    }

    if (message.type === "DOWNLOAD_DECISION") {
      const id = Number(message.id);
      const done = (ok) => sendResponse({ ok });
      if (message.action === "keep") {
        chrome.downloads.resume(id).then(() => done(true), () => done(false));
      } else {
        chrome.downloads
          .cancel(id)
          .catch(() => chrome.downloads.removeFile(id))
          .catch(() => {})
          .then(() => chrome.downloads.erase({ id }))
          .then(() => done(true), () => done(false));
      }
      return true;
    }

    return false;
  });
}
