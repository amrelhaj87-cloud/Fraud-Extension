/**
 * Regenerates ip-ranges.js: Google's own service addresses
 * (goog.json minus the rentable Google Cloud ranges in cloud.json).
 * Run from the project root: node tools/update-ip-ranges.js
 */

import { writeFileSync } from "node:fs";

const GOOG_URL = "https://www.gstatic.com/ipranges/goog.json";
const CLOUD_URL = "https://www.gstatic.com/ipranges/cloud.json";

const [goog, cloud] = await Promise.all(
  [GOOG_URL, CLOUD_URL].map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  })
);

const toNets = (list) =>
  list.prefixes.map((p) => parseCidr(p.ipv4Prefix || p.ipv6Prefix));

const cloudNets = toNets(cloud);
const service = [];
for (const net of toNets(goog)) {
  let parts = [net];
  for (const c of cloudNets) {
    if (c.v6 !== net.v6) continue;
    const next = [];
    for (const p of parts) {
      if (contains(c, p)) continue; // whole part is cloud
      if (contains(p, c)) next.push(...exclude(p, c));
      else next.push(p);
    }
    parts = next;
  }
  service.push(...parts);
}

const v4 = collapse(service.filter((n) => !n.v6)).map(format);
const v6 = collapse(service.filter((n) => n.v6)).map(format);
const list = (items) =>
  wrap(items.map((x) => JSON.stringify(x)).join(", "));

const date = String(goog.creationTime || "").slice(0, 10);
writeFileSync(
  new URL("../ip-ranges.js", import.meta.url),
  `/**
 * Google's own service addresses (Search, Gmail, YouTube...): the ranges in
 * ${GOOG_URL} minus the rentable Google Cloud
 * ranges in ${CLOUD_URL}.
 * Generated from the lists dated ${date}. Regenerate with:
 *   node tools/update-ip-ranges.js
 * GENERATED FILE: do not edit by hand.
 */

export const GOOGLE_SERVICE_V4 = Object.freeze([
${list(v4)}
]);

export const GOOGLE_SERVICE_V6 = Object.freeze([
${list(v6)}
]);
`
);
console.log(`ip-ranges.js: ${v4.length} IPv4 + ${v6.length} IPv6 prefixes (${date})`);

// ---------------------------------------------------------------------------

function parseCidr(cidr) {
  const [ip, len] = cidr.split("/");
  const v6 = ip.includes(":");
  const bits = v6 ? 128n : 32n;
  const prefix = BigInt(len);
  let value = 0n;
  if (v6) {
    const [head, tail = ""] = ip.split("::");
    const h = head ? head.split(":") : [];
    const t = tail ? tail.split(":") : [];
    const groups = ip.includes("::")
      ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t]
      : h;
    for (const g of groups) value = (value << 16n) | BigInt(parseInt(g || "0", 16));
  } else {
    for (const part of ip.split(".")) value = (value << 8n) | BigInt(part);
  }
  return { v6, bits, prefix, value };
}

function size(n) {
  return 1n << (n.bits - n.prefix);
}

function contains(outer, inner) {
  return (
    outer.prefix <= inner.prefix &&
    inner.value >= outer.value &&
    inner.value < outer.value + size(outer)
  );
}

function exclude(net, hole) {
  // Split net in halves until the hole is isolated.
  if (net.prefix === hole.prefix) return [];
  const half = { ...net, prefix: net.prefix + 1n };
  const low = { ...half, value: net.value };
  const high = { ...half, value: net.value + size(half) };
  return contains(low, hole)
    ? [...exclude(low, hole), high]
    : [low, ...exclude(high, hole)];
}

function collapse(nets) {
  const sorted = [...nets].sort((a, b) =>
    a.value < b.value ? -1 : a.value > b.value ? 1 : Number(a.prefix - b.prefix)
  );
  const out = [];
  for (const n of sorted) {
    if (out.length && contains(out[out.length - 1], n)) continue;
    out.push(n);
  }
  return out;
}

function format(n) {
  if (!n.v6) {
    const parts = [];
    for (let i = 3n; i >= 0n; i -= 1n) parts.push(Number((n.value >> (i * 8n)) & 255n));
    return `${parts.join(".")}/${n.prefix}`;
  }
  const groups = [];
  for (let i = 7n; i >= 0n; i -= 1n) groups.push(((n.value >> (i * 16n)) & 0xffffn).toString(16));
  let text = groups.join(":").replace(/(^|:)0(:0)+(:|$)/, "::");
  text = text.replace(/:{3,}/, "::");
  return `${text}/${n.prefix}`;
}

function wrap(text) {
  const lines = [];
  let line = " ";
  for (const item of text.split(", ")) {
    if (line.length + item.length + 2 > 100) {
      lines.push(line.replace(/,$/, ","));
      line = " ";
    }
    line += ` ${item},`;
  }
  lines.push(line.replace(/,$/, ""));
  return lines.join("\n");
}
