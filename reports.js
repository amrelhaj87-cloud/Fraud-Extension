/**
 * FraudShield — report button plumbing (background side).
 *
 * Any part of the extension (Maps banner, warning page, popup) sends
 *   { type: "OPEN_REPORT", draft: {...} }
 * and this module saves the draft and opens report.html, where the user signs
 * in (demo UAE PASS) and sends it. Demo build: reports are saved on this
 * device only. After the merge with the team backend, report.js sends them to
 * the citizen-reports API instead.
 */

const DRAFT_PREFIX = "fs:draft:";
const MAX_TEXT = 300;
const MAX_REASONS = 8;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export function initReports() {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "OPEN_REPORT") return false;
    openReport(message.draft, sender)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  });
}

async function openReport(rawDraft, sender) {
  const draft = cleanDraft(rawDraft);
  await dropOldDrafts();
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await chrome.storage.local.set({ [`${DRAFT_PREFIX}${id}`]: { ...draft, at: Date.now() } });

  const url = `${chrome.runtime.getURL("report.html")}?d=${id}`;
  const fromTab = sender && sender.tab;
  await chrome.tabs.create({
    url,
    ...(fromTab && Number.isInteger(fromTab.index) ? { index: fromTab.index + 1 } : {})
  });
}

// Drafts the user never sent are removed after a day.
async function dropOldDrafts() {
  try {
    const all = await chrome.storage.local.get(null);
    const old = Object.keys(all).filter(
      (key) => key.startsWith(DRAFT_PREFIX) && Date.now() - ((all[key] && all[key].at) || 0) > DRAFT_TTL_MS
    );
    if (old.length) await chrome.storage.local.remove(old);
  } catch {
    // Cleanup is optional.
  }
}

// Keep only known fields, as short plain text: drafts can come from content
// scripts running on any page.
function cleanDraft(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const text = (value) => String(value || "").slice(0, MAX_TEXT);
  const level = ["safe", "low", "medium", "high"].includes(d.level) ? d.level : "";
  const score = Number(d.score);
  return {
    kind: d.kind === "place" ? "place" : "site",
    url: /^https?:\/\//i.test(String(d.url || "")) ? text(d.url) : "",
    name: text(d.name),
    phone: text(d.phone).replace(/[^\d+]/g, ""),
    address: text(d.address),
    website: /^https?:\/\//i.test(String(d.website || "")) ? text(d.website) : "",
    level,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
    reasons: Array.isArray(d.reasons) ? d.reasons.slice(0, MAX_REASONS).map(text) : []
  };
}
