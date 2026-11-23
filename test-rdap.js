/**
 * Manual RDAP diagnostic for Fraud Extension.
 * Run with: node test-rdap.js
 *
 * Uses an in-memory chrome.storage.local shim so the same cache/TTL code paths
 * run outside Chrome. Debug output goes to console.warn (stderr).
 */

const store = Object.create(null);

globalThis.chrome = {
  storage: {
    local: {
      async get(key) {
        if (Array.isArray(key)) {
          return Object.fromEntries(key.map((item) => [item, store[item]]));
        }
        return { [key]: store[key] };
      },
      async set(values) {
        Object.assign(store, values);
      },
      async remove(key) {
        delete store[key];
      }
    }
  }
};

const { getDomainAgeDays } = await import("./rdap.js");

const domains = [
  "google.com",
  "adcb.com",
  "tamm.abudhabi",
  "adpolice.gov.ae",
  "example.xyz"
];

console.log("Fraud Extension — RDAP diagnostics (debug: true)");
console.log("");

for (const domain of domains) {
  const started = Date.now();
  const ageDays = await getDomainAgeDays(domain, { debug: true });
  const elapsed = Date.now() - started;
  const value = ageDays === null ? "null" : `${ageDays} days`;

  console.log(`${domain.padEnd(22)} ${value.padEnd(14)} (${elapsed}ms)`);
}

console.log("");
console.log("Cache keys written:", Object.keys(store).sort().join(", "));
