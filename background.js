/**
 * Fraud Extension — MV3 service worker.
 * Coordinates rules scoring, RDAP age lookup, tab result storage and the
 * optional team LLM hook. No remote code and no API keys.
 */

import { analyzeDomain } from "./scoring.js";
import { getDomainAgeDays, getRegistrableDomain } from "./rdap.js";
import { initBlocker } from "./blocker.js";

// Redirect high-risk navigations to warning.html (see blocker.js).
initBlocker();

const MAX_CONCURRENT_DOMAINS = 5;
const MAX_TAB_RESULTS = 250;
const TAB_STORAGE_PREFIX = "fe:tab-results:";
const LLM_TIMEOUT_MS = 6000;

// Last known results per tab. Storage is the crash/restart-safe backup.
const tabResultsMemory = new Map();
const tabMergeQueues = new Map();

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    try {
      if (message.type === "ANALYZE") {
        handleAnalyzeMessage(message, sender)
          .then((results) => safeRespond(sendResponse, results))
          .catch((error) => {
            console.warn("[Fraud Extension] Analyze failed:", error);
            safeRespond(sendResponse, []);
          });
        return true;
      }

      if (message.type === "GET_TAB_RESULTS") {
        getTabResults(message, sender)
          .then((payload) => safeRespond(sendResponse, payload))
          .catch(() => safeRespond(sendResponse, emptyTabPayload(null)));
        return true;
      }
    } catch (error) {
      console.warn("[Fraud Extension] Message handler failed:", error);
      safeRespond(sendResponse, message.type === "ANALYZE" ? [] : emptyTabPayload(null));
      return false;
    }

    return false;
  });

  if (chrome.tabs && chrome.tabs.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId) => {
      void clearTabResults(tabId);
    });
  }

  // A real navigation starts a new page; drop the previous page's results.
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo && changeInfo.status === "loading" && changeInfo.url) {
        void clearTabResults(tabId);
      }
    });
  }
}

async function handleAnalyzeMessage(message, sender) {
  const rawUrls = Array.isArray(message.urls) ? message.urls : [];
  const targets = prepareTargets(rawUrls, message.sponsoredUrls, message.meta);
  if (targets.length === 0) return [];

  // One RDAP lookup per registrable domain, shared by all of its URLs.
  const ageLookups = new Map();
  const getAge = (hostname) => {
    const domain = getRegistrableDomain(hostname);
    if (!domain) return Promise.resolve(null);

    if (!ageLookups.has(domain)) {
      ageLookups.set(
        domain,
        getDomainAgeDays(domain).catch(() => null)
      );
    }
    return ageLookups.get(domain);
  };

  const analyzed = await mapWithConcurrency(
    targets,
    MAX_CONCURRENT_DOMAINS,
    async (target) => analyzeTarget(target, getAge)
  );

  const results = analyzed.filter(Boolean);
  const tabId = resolveAnalyzeTabId(message, sender);

  if (tabId !== null && results.length > 0) {
    await mergeTabResults(tabId, results);
  }

  return results;
}

async function analyzeTarget(target, getAge) {
  const { url, parsed } = target;
  const hostname = parsed.hostname;
  const scoringOptions = {
    protocol: parsed.protocol,
    path: `${parsed.pathname}${parsed.search}`
  };

  try {
    // Immediate rules result (RDAP has not answered yet).
    let scored = analyzeDomain(hostname, scoringOptions);

    // The lookup is shared/cached; scoring is re-run with the real age.
    const ageDays = await getAge(hostname);
    scored = analyzeDomain(hostname, { ...scoringOptions, ageDays });

    // Only gray-zone results are eligible for the optional LLM hook.
    if (scored.level === "medium") {
      scored = await blendWithLlm(scored, {
        url,
        title: target.title || "",
        snippet: target.snippet || ""
      });
    }

    // Sponsored result on a non-official domain: +15 after rules and RDAP.
    if (target.sponsored && scored.level !== "safe") {
      scored = applySponsoredBoost(scored);
    }

    return {
      url,
      hostname,
      score: scored.score,
      level: scored.level,
      reasons: scored.reasons,
      ageDays
    };
  } catch {
    return {
      url,
      hostname,
      score: 0,
      level: "low",
      reasons: ["تعذر تحليل الرابط"],
      ageDays: null
    };
  }
}

/**
 * TEAM LLM HOOK: gray-zone (score 30-59) pages are sent here; if result is
 * non-null, blend it: final = max(rulesScore, llmScore).
 *
 * Replace the body with the team's local/remote implementation later. Keep the
 * return shape: { score: number, reasons: string[] } or null. The caller
 * enforces a 6-second timeout and never lets this hook break an analysis.
 *
 * Input comes from the page: Search sends the result title + visible snippet,
 * Maps sends the place name + "category | phone | source: Google Maps".
 *
 * @param {{url: string, title: string, snippet: string}} input
 * @returns {Promise<{score: number, reasons: string[]}|null>}
 */
export async function llmAnalyze({ url, title, snippet }) {
  void url;
  void title;
  void snippet;
  return null;
}

async function blendWithLlm(scored, input) {
  let llmResult = null;

  try {
    llmResult = await withTimeout(
      llmAnalyze(input),
      LLM_TIMEOUT_MS
    );
  } catch {
    return scored;
  }

  if (!llmResult || typeof llmResult !== "object") return scored;

  const llmScore = Number(llmResult.score);
  if (!Number.isFinite(llmScore)) return scored;

  const finalScore = Math.max(
    scored.score,
    clamp(Math.round(llmScore), 0, 100)
  );

  const reasons = scored.reasons.slice();
  if (Array.isArray(llmResult.reasons)) {
    for (const reason of llmResult.reasons) {
      if (
        typeof reason === "string" &&
        reason.trim() &&
        !reasons.includes(reason)
      ) {
        reasons.push(reason);
      }
    }
  }

  return {
    score: finalScore,
    level: levelForScore(finalScore),
    reasons
  };
}

function withTimeout(promise, timeoutMs) {
  let timer = null;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("LLM timeout")), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

function applySponsoredBoost(scored) {
  const score = Math.min(100, scored.score + 15);
  const reason = "نتيجة إعلانية مدفوعة (زيادة 15 نقطة)";
  const reasons = scored.reasons.includes(reason)
    ? scored.reasons
    : [...scored.reasons, reason];

  return {
    score,
    level: levelForScore(score),
    reasons
  };
}

// ---------------------------------------------------------------------------
// Input preparation and bounded concurrency
// ---------------------------------------------------------------------------

function prepareTargets(rawUrls, sponsoredUrls, meta) {
  const metaByUrl = meta && typeof meta === "object" ? meta : {};
  const seen = new Set();
  const targets = [];
  const sponsoredKeys = new Set();

  if (Array.isArray(sponsoredUrls)) {
    for (const sponsoredUrl of sponsoredUrls) {
      if (typeof sponsoredUrl !== "string") continue;
      try {
        const parsed = new URL(sponsoredUrl.trim());
        parsed.hash = "";
        sponsoredKeys.add(parsed.href);
      } catch {
        // Ignore malformed sponsored URLs.
      }
    }
  }

  for (const rawUrl of rawUrls) {
    if (typeof rawUrl !== "string") continue;

    let parsed;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      continue;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;

    // Fragments are irrelevant for a domain analysis.
    parsed.hash = "";
    const key = parsed.href;
    if (seen.has(key)) continue;

    seen.add(key);
    const info = metaByUrl[rawUrl] || metaByUrl[rawUrl.trim()] || metaByUrl[key] || {};
    targets.push({
      url: rawUrl.trim(),
      parsed,
      sponsored: sponsoredKeys.has(key),
      title: typeof info.title === "string" ? info.title.slice(0, 200) : "",
      snippet: typeof info.snippet === "string" ? info.snippet.slice(0, 400) : ""
    });
  }

  return targets;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length).fill(null);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      try {
        results[index] = await worker(items[index], index);
      } catch {
        results[index] = null;
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

// ---------------------------------------------------------------------------
// Per-tab result store (memory + chrome.storage.local)
// ---------------------------------------------------------------------------

function resolveAnalyzeTabId(message, sender) {
  if (sender && sender.tab && Number.isInteger(sender.tab.id)) {
    return sender.tab.id;
  }
  if (Number.isInteger(message.tabId)) return message.tabId;
  return null;
}

/**
 * Serialize reads/merges/writes per tab so two quick MutationObserver batches
 * cannot overwrite each other.
 */
function mergeTabResults(tabId, freshResults) {
  const previous = tabMergeQueues.get(tabId) || Promise.resolve();

  const queued = previous
    .catch(() => {})
    .then(() => performMergeTabResults(tabId, freshResults))
    .catch((error) => {
      console.warn("[Fraud Extension] Saving tab results failed:", error);
    });

  tabMergeQueues.set(tabId, queued);
  queued.finally(() => {
    if (tabMergeQueues.get(tabId) === queued) tabMergeQueues.delete(tabId);
  });

  return queued;
}

async function performMergeTabResults(tabId, freshResults) {
  const state = await loadTabState(tabId);
  const byUrl = new Map();

  for (const result of state.results) {
    if (result && typeof result.url === "string") {
      byUrl.set(resultKey(result.url), result);
    }
  }

  for (const result of freshResults) {
    if (result && typeof result.url === "string") {
      byUrl.set(resultKey(result.url), result);
    }
  }

  const merged = Array.from(byUrl.values())
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, MAX_TAB_RESULTS);

  const nextState = {
    updatedAt: Date.now(),
    results: merged
  };

  tabResultsMemory.set(tabId, nextState);

  try {
    await chrome.storage.local.set({
      [`${TAB_STORAGE_PREFIX}${tabId}`]: nextState
    });
  } catch {
    // Memory still serves the popup while this worker is alive.
  }
}

async function loadTabState(tabId) {
  const cached = tabResultsMemory.get(tabId);
  if (cached) return cached;

  try {
    const key = `${TAB_STORAGE_PREFIX}${tabId}`;
    const data = await chrome.storage.local.get(key);
    const state = data && data[key];

    if (state && Array.isArray(state.results)) {
      const normalized = {
        updatedAt: Number.isFinite(state.updatedAt) ? state.updatedAt : null,
        results: state.results
      };
      tabResultsMemory.set(tabId, normalized);
      return normalized;
    }
  } catch {
    // Ignore storage failures and return an empty state.
  }

  return { updatedAt: null, results: [] };
}

async function getTabResults(message, sender) {
  const tabId = await resolveReadTabId(message, sender);
  if (tabId === null) return emptyTabPayload(null);

  const state = await loadTabState(tabId);
  return {
    ok: true,
    tabId,
    results: state.results,
    updatedAt: state.updatedAt
  };
}

async function resolveReadTabId(message, sender) {
  if (Number.isInteger(message.tabId)) return message.tabId;
  if (sender && sender.tab && Number.isInteger(sender.tab.id)) {
    return sender.tab.id;
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && Number.isInteger(tabs[0].id)) return tabs[0].id;
  } catch {
    // No active tab available.
  }

  return null;
}

async function clearTabResults(tabId) {
  tabResultsMemory.delete(tabId);

  try {
    await chrome.storage.local.remove(`${TAB_STORAGE_PREFIX}${tabId}`);
  } catch {
    // Ignore cleanup failures.
  }
}

function emptyTabPayload(tabId) {
  return {
    ok: false,
    tabId,
    results: [],
    updatedAt: null
  };
}

function resultKey(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return String(url);
  }
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function levelForScore(score) {
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeRespond(sendResponse, payload) {
  try {
    sendResponse(payload);
  } catch {
    // The message port may already be closed (for example after navigation).
  }
}
