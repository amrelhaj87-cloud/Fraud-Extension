/**
 * Fraud Extension — who owns an IP address?
 *
 * Layer 1 (local, instant): Google's own service ranges (ip-ranges.js) mean
 * the address is Google itself (Search, Gmail...), not a rented cloud server.
 * Layer 2 (RDAP, cached): the registry record names the network owner, which
 * is then classified as:
 *   service  a big company's own network that is not rented out (Apple, Meta)
 *   hosting  a cloud / hosting provider: anyone can rent a server there
 *   isp      a home or mobile internet connection (often a hacked device)
 *   other    known owner, no category
 *
 * Only the IP address itself is sent (to the RDAP registry), nothing else.
 */

import { GOOGLE_SERVICE_V4, GOOGLE_SERVICE_V6 } from "./ip-ranges.js";

const RDAP_IP_URL = "https://rdap.arin.net/registry/ip/"; // redirects to RIPE/APNIC/...
const CACHE_PREFIX = "ipowner:";
const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

// Companies whose own networks are not rented to the public.
const SERVICE_OWNERS = /\b(apple inc|facebook|meta platforms)\b/i;

const HOSTING_OWNERS = new RegExp(
  [
    "amazon", "\\baws\\b", "digitalocean", "digital ocean", "hetzner", "\\bovh", "linode",
    "akamai", "vultr", "choopa", "contabo", "microsoft", "azure", "alibaba", "aliyun",
    "tencent", "oracle", "leaseweb", "hostinger", "godaddy", "namecheap", "cloudflare",
    "\\bm247\\b", "ionos", "scaleway", "hostwinds", "kamatera", "google", "fastly",
    "hosting", "\\bhost(?!master)", "server", "data ?cent(er|re)", "\\bcloud", "\\bvps\\b",
    "\\bcolo", "datacamp", "psychz", "quadranet", "selectel", "timeweb", "baxet"
  ].join("|"),
  "i"
);

const ISP_OWNERS = new RegExp(
  [
    "telecom", "telekom", "telecommunication", "broadband", "\\bcable", "mobile",
    "wireless", "\\bdsl\\b", "comcast", "verizon", "at&t", "charter", "spectrum",
    "\\bcox\\b", "etisalat", "emirates integrated", "\\beitc\\b", "vodafone", "orange",
    "airtel", "\\bjio\\b", "reliance", "bsnl", "unicom", "chinanet", "china mobile",
    "telefonica", "\\bstc\\b", "\\bzain\\b", "mobily", "ooredoo", "\\bisp\\b",
    "internet service", "residential", "\\btelco", "communications"
  ].join("|"),
  "i"
);

// ---------------------------------------------------------------------------
// Layer 1: Google service ranges
// ---------------------------------------------------------------------------

const RANGES_V4 = GOOGLE_SERVICE_V4.map(parseCidr);
const RANGES_V6 = GOOGLE_SERVICE_V6.map(parseCidr);

export function isGoogleServiceIp(ip) {
  const addr = parseIp(ip);
  if (!addr) return false;
  const ranges = addr.v6 ? RANGES_V6 : RANGES_V4;
  return ranges.some(
    (r) => addr.value >> (r.bits - r.prefix) === r.value >> (r.bits - r.prefix)
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {string} ip  bare IPv4 / IPv6 (brackets allowed)
 * @returns {Promise<{kind: "service"|"hosting"|"isp"|"other", owner: string}|null>}
 *          null when the owner could not be found.
 */
export async function getIpOwner(ip, options = {}) {
  const host = String(ip || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (!parseIp(host) || isLocalIp(host)) return null;

  if (isGoogleServiceIp(host)) return { kind: "service", owner: "Google" };

  const key = `${CACHE_PREFIX}${host}`;
  const cached = await readCache(key);
  if (cached !== undefined) return cached;

  let result = null;
  try {
    const fetchImpl = options.fetch || fetch;
    const data = await fetchRdap(fetchImpl, `${RDAP_IP_URL}${encodeURIComponent(host)}`);
    result = classifyRdap(data);
  } catch {
    result = null;
  }
  await writeCache(key, result);
  return result;
}

/** Turn an RDAP IP-network record into {kind, owner}. Exported for tests. */
export function classifyRdap(data) {
  if (!data || typeof data !== "object") return null;

  const fns = [];
  const registrants = [];
  for (const entity of data.entities || []) {
    const fn = vcardName(entity);
    if (!fn) continue;
    fns.push(fn);
    if ((entity.roles || []).includes("registrant")) registrants.push(fn);
  }
  const remarks = (data.remarks || [])
    .flatMap((r) => (Array.isArray(r.description) ? r.description : []))
    .filter((line) => line && !/^[*\s-]+$/.test(line) && !/geofeed|https?:\/\//i.test(line))
    .slice(0, 2);

  const owner = pickOwnerName([...registrants, ...fns, ...remarks, data.name || ""]);
  const text = [data.name || "", ...fns, ...remarks].join(" | ");
  if (!owner && !text.trim()) return null;

  let kind = "other";
  if (SERVICE_OWNERS.test(text)) kind = "service";
  else if (HOSTING_OWNERS.test(text)) kind = "hosting";
  else if (ISP_OWNERS.test(text)) kind = "isp";

  return { kind, owner: owner || String(data.name || "") };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function vcardName(entity) {
  const card = entity && entity.vcardArray;
  if (!Array.isArray(card) || !Array.isArray(card[1])) return "";
  const fn = card[1].find((field) => Array.isArray(field) && field[0] === "fn");
  return fn && typeof fn[3] === "string" ? fn[3].trim() : "";
}

// A readable company name, not a registry handle (MNT-GOOG-PROD) or a role.
function pickOwnerName(candidates) {
  return (
    candidates.find(
      (c) => /\s/.test(c) && !/(role|hostmaster|abuse|contact|noc)\b/i.test(c)
    ) || ""
  ).slice(0, 80);
}

async function fetchRdap(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "application/rdap+json, application/json" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// Local network / loopback: never sent to RDAP (the scorer ignores them anyway).
function isLocalIp(host) {
  if (/^(10|127|0)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true;
  return host === "::1" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
}

function parseIp(text) {
  const host = String(text || "").replace(/^\[|\]$/g, "");
  const v4 = host.split(".");
  if (v4.length === 4 && v4.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) {
    return { v6: false, bits: 32n, value: v4.reduce((acc, p) => (acc << 8n) | BigInt(p), 0n) };
  }
  if (!host.includes(":") || !/^[0-9a-f:.]+$/i.test(host)) return null;

  let groups;
  const [head, tail, extra] = host.split("::");
  if (extra !== undefined) return null;
  const toGroups = (part) => (part ? part.split(":") : []);
  let h = toGroups(head);
  let t = toGroups(tail);
  // Embedded IPv4 (::ffff:1.2.3.4).
  const last = (t.length ? t : h).at(-1);
  if (last && last.includes(".")) {
    const v4value = parseIp(last);
    if (!v4value || v4value.v6) return null;
    const hi = ((v4value.value >> 16n) & 0xffffn).toString(16);
    const lo = (v4value.value & 0xffffn).toString(16);
    if (t.length) t = [...t.slice(0, -1), hi, lo];
    else h = [...h.slice(0, -1), hi, lo];
  }
  if (tail === undefined) {
    groups = h;
  } else {
    const fill = 8 - h.length - t.length;
    if (fill < 0) return null;
    groups = [...h, ...Array(fill).fill("0"), ...t];
  }
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return {
    v6: true,
    bits: 128n,
    value: groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n)
  };
}

function parseCidr(cidr) {
  const [ip, len] = cidr.split("/");
  const addr = parseIp(ip);
  return { ...addr, prefix: BigInt(len) };
}

function hasStorage() {
  return (
    typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
  );
}

async function readCache(key) {
  if (!hasStorage()) return undefined;
  try {
    const data = await chrome.storage.local.get(key);
    const entry = data[key];
    if (!entry || typeof entry.at !== "number") return undefined;
    const ttl = entry.value ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
    return Date.now() - entry.at < ttl ? entry.value : undefined;
  } catch {
    return undefined;
  }
}

async function writeCache(key, value) {
  if (!hasStorage()) return;
  try {
    await chrome.storage.local.set({ [key]: { at: Date.now(), value } });
  } catch {
    // Cache is optional.
  }
}
