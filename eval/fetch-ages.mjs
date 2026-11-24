/**
 * Looks up domain ages (RDAP) for the scale's links and caches them in
 * eval/data/rdap-ages.json, so `node eval/run.mjs` can measure the
 * "URL + domain age" layer without network access.
 *
 * Uses the extension's own rdap.js, so it measures exactly what the browser
 * does. Only public registry data is requested (the domain name).
 *
 *   node eval/fetch-ages.mjs            fetch what is missing
 *   node eval/fetch-ages.mjs --refresh  fetch everything again
 *
 * Ages are relative to the fetch date stored in the file. The phishing
 * snapshot is from 2026-11-23, so ages are close to what a victim saw.
 * Domains already taken down often have no record: they count as "unknown".
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

// rdap.js caches in chrome.storage; give it an in-memory store in Node.
const memory = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => (key in memory ? { [key]: memory[key] } : {}),
      set: async (items) => Object.assign(memory, items),
      remove: async (key) => [].concat(key).forEach((k) => delete memory[k])
    }
  }
};
const { getDomainAgeDays, getRegistrableDomain } = await import("../rdap.js");
const { legitTrancoSample, allEvalUrls } = await import("./sets.mjs");

const CACHE = new URL("./data/rdap-ages.json", import.meta.url);
const refresh = process.argv.includes("--refresh");
const cache = existsSync(CACHE) && !refresh ? JSON.parse(readFileSync(CACHE, "utf8")) : { fetchedAt: "", ages: {} };

const domains = new Set();
for (const url of [...allEvalUrls(), ...legitTrancoSample()]) {
  try {
    const domain = getRegistrableDomain(new URL(url).hostname);
    if (domain && !(domain in cache.ages)) domains.add(domain);
  } catch {
    // unparsable URL
  }
}

const list = [...domains];
console.log(`Looking up ${list.length} domains (cached: ${Object.keys(cache.ages).length})…`);

let done = 0;
const CONCURRENCY = 4;
async function worker() {
  while (list.length) {
    const domain = list.shift();
    const age = await getDomainAgeDays(domain).catch(() => null);
    cache.ages[domain] = Number.isFinite(age) ? Math.floor(age) : null;
    done += 1;
    if (done % 50 === 0) {
      cache.fetchedAt = new Date().toISOString().slice(0, 10);
      writeFileSync(CACHE, `${JSON.stringify(cache, null, 1)}\n`);
      console.log(`  ${done} done`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

cache.fetchedAt = new Date().toISOString().slice(0, 10);
writeFileSync(CACHE, `${JSON.stringify(cache, null, 1)}\n`);
const known = Object.values(cache.ages).filter((a) => a !== null).length;
console.log(`Done. ${known} of ${Object.keys(cache.ages).length} domains have an age.`);
