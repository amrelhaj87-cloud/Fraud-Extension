/**
 * Fraud Extension — RDAP domain-age lookup.
 * Uses the IANA RDAP bootstrap to find the authoritative registry per TLD.
 * No public RDAP proxy dependency. Every failure is non-fatal: callers get null.
 */

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_CACHE_KEY = "rdap:bootstrap";
const BOOTSTRAP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const CACHE_PREFIX = "rdap:";
const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FAILURE_TTL_MS = 60 * 60 * 1000; // 1 hour

const REQUEST_TIMEOUT_MS = 4000; // per HTTP request
const TOTAL_BUDGET_MS = 8000; // bootstrap + registry request
const DAY_MS = 24 * 60 * 60 * 1000;

// Public suffixes that need three labels for the registrable domain.
const MULTI_LEVEL_SUFFIXES = new Set([
  "gov.ae",
  "co.ae",
  "com.ae",
  "net.ae",
  "org.ae",
  "co.uk",
  "com.au"
]);

// Used only when the IANA bootstrap cannot be loaded. URLs are the current
// authoritative RDAP bases for these TLDs (verified against the IANA file).
const FALLBACK_RDAP_URLS = Object.freeze({
  com: "https://rdap.verisign.com/com/v1/",
  net: "https://rdap.verisign.com/net/v1/",
  org: "https://rdap.publicinterestregistry.org/rdap/",
  xyz: "https://rdap.centralnic.com/xyz/",
  top: "https://rdap.zdnsgtld.com/top/",
  shop: "https://rdap.gmoregistry.net/rdap/",
  online: "https://rdap.radix.host/rdap/",
  site: "https://rdap.radix.host/rdap/",
  click: "https://rdap.registry.click/rdap/",
  icu: "https://rdap.centralnic.com/icu/",
  vip: "https://rdap.nic.vip/",
  live: "https://rdap.identitydigital.services/rdap/",
  buzz: "https://rdap.nic.buzz/"
});

const FALLBACK_BOOTSTRAP = new Map(
  Object.entries(FALLBACK_RDAP_URLS).map(([tld, url]) => [
    tld,
    ensureTrailingSlash(url)
  ])
);

// Parsed TLD -> base URL map. Survival across calls avoids repeated fetches
// inside the same service-worker lifetime.
let bootstrapMemory = null;

/**
 * Extract the registrable part of a hostname.
 * Examples: portal.tamm.abudhabi -> tamm.abudhabi
 *           www.adcb.com -> adcb.com
 *           a.example.co.uk -> example.co.uk
 *
 * @param {string} hostname
 * @returns {string} registrable domain, or "" for IPs/invalid input
 */
export function getRegistrableDomain(hostname) {
  const host = normalizeHostname(hostname);
  if (!host || isIpAddress(host)) return "";

  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return "";

  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_LEVEL_SUFFIXES.has(lastTwo)) {
    if (labels.length < 3) return "";
    return labels.slice(-3).join(".");
  }

  return labels.slice(-2).join(".");
}

/**
 * Return the domain age in days, or null when unavailable.
 * Successes are cached for 7 days, failures for 1 hour.
 *
 * @param {string} registrableDomain
 * @param {{debug?: boolean}} [options]
 * @returns {Promise<number|null>}
 */
export async function getDomainAgeDays(registrableDomain, options = {}) {
  const debug = Boolean(options && options.debug);
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  try {
    const domain = getRegistrableDomain(registrableDomain);
    if (!domain) {
      debugLog(debug, "Invalid or unsupported hostname", registrableDomain);
      return null;
    }

    const cacheKey = `${CACHE_PREFIX}${domain}`;
    const cached = await readCache(cacheKey);
    if (cached) {
      debugLog(
        debug,
        `Domain cache hit for ${domain}`,
        cached.ageDays === null
          ? "cached failure (null)"
          : `${cached.ageDays} days`
      );
      return cached.ageDays;
    }

    const tld = getTld(domain);
    const bootstrap = await loadBootstrapMap(deadline, debug);
    const baseUrl = bootstrap.get(tld);

    if (!baseUrl) {
      debugLog(debug, `No RDAP service for TLD ".${tld}"`, domain);
      await writeCache(cacheKey, null);
      return null;
    }

    const requestUrl = `${ensureTrailingSlash(baseUrl)}domain/${encodeURIComponent(domain)}`;

    try {
      const data = await fetchJson(requestUrl, deadline, debug, "registry");
      const ageDays = extractRegistrationAgeDays(data);

      if (!Number.isFinite(ageDays)) {
        throw new Error("No registration event in RDAP response");
      }

      await writeCache(cacheKey, ageDays);
      debugLog(debug, `RDAP age resolved for ${domain}`, `${ageDays} days`);
      return ageDays;
    } catch (error) {
      debugLog(debug, `RDAP registry lookup failed for ${domain}`, describeError(error));
      await writeCache(cacheKey, null);
      return null;
    }
  } catch (error) {
    debugLog(debug, "Unexpected RDAP failure", describeError(error));
    return null;
  }
}

// ---------------------------------------------------------------------------
// IANA bootstrap
// ---------------------------------------------------------------------------

async function loadBootstrapMap(deadline, debug) {
  try {
    return await loadIanaBootstrapMap(deadline, debug);
  } catch (error) {
    debugLog(
      debug,
      "IANA bootstrap failed; using hardcoded fallback map",
      `${describeError(error)} (${FALLBACK_BOOTSTRAP.size} TLDs)`
    );
    return FALLBACK_BOOTSTRAP;
  }
}

async function loadIanaBootstrapMap(deadline, debug) {
  if (bootstrapMemory && isBootstrapFresh(bootstrapMemory.cachedAt)) {
    debugLog(debug, "Using in-memory RDAP bootstrap", `${bootstrapMemory.map.size} TLDs`);
    return bootstrapMemory.map;
  }

  if (bootstrapMemory) bootstrapMemory = null;

  const stored = await readBootstrapCache(debug);
  if (stored) return stored;

  const data = await fetchJson(BOOTSTRAP_URL, deadline, debug, "IANA bootstrap");
  const map = buildBootstrapMap(data);

  if (map.size === 0) {
    throw new Error("IANA bootstrap contains no usable HTTPS services");
  }

  const entry = {
    cachedAt: Date.now(),
    tlds: Object.fromEntries(map)
  };

  bootstrapMemory = { cachedAt: entry.cachedAt, map };
  await writeBootstrapCache(entry);

  debugLog(debug, "RDAP bootstrap loaded from IANA", `${map.size} TLDs`);
  return map;
}

/**
 * Parse services: [[ [tlds...], [baseUrls...] ], ...].
 * The first HTTPS base URL wins.
 */
function buildBootstrapMap(data) {
  const map = new Map();
  if (!data || !Array.isArray(data.services)) return map;

  for (const service of data.services) {
    if (!Array.isArray(service) || service.length < 2) continue;

    const tlds = service[0];
    const urls = service[1];
    if (!Array.isArray(tlds) || !Array.isArray(urls)) continue;

    const httpsBase = urls.find(
      (url) => typeof url === "string" && /^https:\/\//i.test(url.trim())
    );
    if (!httpsBase) continue;

    const baseUrl = ensureTrailingSlash(httpsBase.trim());

    for (const tld of tlds) {
      if (typeof tld !== "string" || !tld.trim()) continue;
      const key = tld.trim().toLowerCase();
      if (!map.has(key)) map.set(key, baseUrl);
    }
  }

  return map;
}

async function readBootstrapCache(debug) {
  if (!hasLocalStorage()) return null;

  try {
    const data = await chrome.storage.local.get(BOOTSTRAP_CACHE_KEY);
    const entry = data && data[BOOTSTRAP_CACHE_KEY];

    if (!entry || !Number.isFinite(entry.cachedAt)) return null;
    if (!entry.tlds || typeof entry.tlds !== "object") return null;

    const elapsed = Date.now() - entry.cachedAt;
    if (elapsed < 0 || elapsed >= BOOTSTRAP_TTL_MS) {
      removeCacheKey(BOOTSTRAP_CACHE_KEY);
      return null;
    }

    const map = new Map();
    for (const [tld, url] of Object.entries(entry.tlds)) {
      if (
        typeof tld === "string" &&
        typeof url === "string" &&
        /^https:\/\//i.test(url)
      ) {
        map.set(tld.toLowerCase(), ensureTrailingSlash(url));
      }
    }

    if (map.size === 0) return null;

    bootstrapMemory = { cachedAt: entry.cachedAt, map };
    debugLog(debug, "RDAP bootstrap cache hit", `${map.size} TLDs`);
    return map;
  } catch {
    return null;
  }
}

async function writeBootstrapCache(entry) {
  if (!hasLocalStorage()) return;

  try {
    await chrome.storage.local.set({ [BOOTSTRAP_CACHE_KEY]: entry });
  } catch {
    // The in-memory copy still works for this service-worker lifetime.
  }
}

function isBootstrapFresh(cachedAt) {
  if (!Number.isFinite(cachedAt)) return false;
  const elapsed = Date.now() - cachedAt;
  return elapsed >= 0 && elapsed < BOOTSTRAP_TTL_MS;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function fetchJson(url, deadline, debug, label) {
  const remaining = deadline - Date.now();

  if (remaining <= 0) {
    const error = new Error("Total 8s RDAP budget exhausted");
    debugLog(debug, `Skipped ${label} request`, `${url} — ${describeError(error)}`);
    throw error;
  }

  const timeoutMs = Math.min(REQUEST_TIMEOUT_MS, remaining);
  const controller = new AbortController();
  let status = null;
  let timer = null;

  debugLog(debug, `RDAP ${label} request`, `${url} (timeout ${timeoutMs}ms)`);

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          Accept: "application/rdap+json, application/json"
        }
      }),
      timeoutPromise
    ]);

    status = response.status;
    const contentType =
      response.headers && typeof response.headers.get === "function"
        ? response.headers.get("content-type") || ""
        : "";

    debugLog(
      debug,
      `RDAP ${label} response`,
      `status=${status} content-type="${contentType || "missing"}"`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${status}`);
    }

    if (!/json/i.test(contentType)) {
      throw new Error(`Non-JSON response (${contentType || "missing content-type"})`);
    }

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON body");
    }
  } catch (error) {
    debugLog(
      debug,
      `RDAP ${label} error`,
      `status=${status === null ? "no response" : status}; ${describeError(error)}`
    );
    throw error;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// RDAP parsing
// ---------------------------------------------------------------------------

function extractRegistrationAgeDays(data) {
  if (!data || !Array.isArray(data.events)) return null;

  const registration = data.events.find(
    (event) =>
      event &&
      typeof event.eventAction === "string" &&
      event.eventAction.toLowerCase() === "registration"
  );

  if (!registration || typeof registration.eventDate !== "string") return null;

  const registeredAt = Date.parse(registration.eventDate);
  if (!Number.isFinite(registeredAt)) return null;

  const days = Math.floor((Date.now() - registeredAt) / DAY_MS);
  return Math.max(0, days);
}

// ---------------------------------------------------------------------------
// Domain-age cache (chrome.storage.local)
// ---------------------------------------------------------------------------

function hasLocalStorage() {
  try {
    return (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    );
  } catch {
    return false;
  }
}

async function readCache(key) {
  if (!hasLocalStorage()) return null;

  try {
    const data = await chrome.storage.local.get(key);
    const entry = data && data[key];

    if (!entry || typeof entry !== "object") return null;
    if (!Number.isFinite(entry.cachedAt)) return null;

    const hasAge =
      entry.ageDays !== null &&
      entry.ageDays !== undefined &&
      Number.isFinite(Number(entry.ageDays));
    const ok = entry.ok !== false && hasAge;
    const ttl = ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
    const elapsed = Date.now() - entry.cachedAt;

    if (elapsed < 0 || elapsed >= ttl) {
      removeCacheKey(key);
      return null;
    }

    if (!ok) return { ageDays: null };

    return {
      ageDays: Math.max(0, Math.floor(Number(entry.ageDays)))
    };
  } catch {
    return null;
  }
}

async function writeCache(key, ageDays) {
  if (!hasLocalStorage()) return;

  const ok = Number.isFinite(ageDays);
  const entry = {
    ok,
    ageDays: ok ? Math.max(0, Math.floor(ageDays)) : null,
    cachedAt: Date.now()
  };

  try {
    await chrome.storage.local.set({ [key]: entry });
  } catch {
    // Storage failures must not break analysis.
  }
}

function removeCacheKey(key) {
  if (!hasLocalStorage()) return;

  try {
    const result = chrome.storage.local.remove(key);
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    // Ignore cleanup failures.
  }
}

// ---------------------------------------------------------------------------
// Hostname helpers
// ---------------------------------------------------------------------------

function normalizeHostname(input) {
  if (typeof input !== "string") return "";

  let value = input.trim().toLowerCase();
  if (!value) return "";

  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
      ? value
      : `http://${value}`;
    value = new URL(withScheme).hostname;
  } catch {
    value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0];
    value = value.split("@").pop() || "";
    value = value.replace(/:\d+$/, "");
  }

  value = value.replace(/\.+$/, "");
  if (value.startsWith("www.")) value = value.slice(4);
  return value;
}

function isIpAddress(host) {
  const v4 = host.split(".");
  if (
    v4.length === 4 &&
    v4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  ) {
    return true;
  }

  return host.includes(":") && /^\[?[0-9a-f:.]+\]?$/i.test(host);
}

function getTld(domain) {
  const labels = domain.split(".").filter(Boolean);
  return labels.length > 0 ? labels[labels.length - 1].toLowerCase() : "";
}

function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

// ---------------------------------------------------------------------------
// Debug helpers
// ---------------------------------------------------------------------------

function debugLog(enabled, message, detail) {
  if (!enabled) return;

  try {
    if (detail === undefined) {
      console.warn(`[Fraud Extension] RDAP: ${message}`);
    } else {
      console.warn(`[Fraud Extension] RDAP: ${message} —`, detail);
    }
  } catch {
    // Debug logging must never affect analysis.
  }
}

function describeError(error) {
  if (!error) return "unknown error";
  if (typeof error === "string") return error;
  const name = error.name || "Error";
  const message = error.message || String(error);
  return `${name}: ${message}`;
}
