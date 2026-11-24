/**
 * FraudShield — accuracy scale ("الميزان").
 *
 * Runs the scorer (scoring.js) on labelled data and reports two numbers:
 *   detection    share of scam links flagged (medium or high)
 *   false alarms share of legitimate links flagged
 *
 * Main table: URL only. Second table (after `node eval/fetch-ages.mjs`):
 * URL + domain age, as in the browser. No IP owner or page scan in either.
 *
 * Usage (from the project root):
 *   node eval/run.mjs              summary table
 *   node eval/run.mjs --details    + missed scams (TRAIN half only) and false alarms
 *   node eval/run.mjs --write      also writes eval/RESULTS.md
 *
 * Rule changes must be designed by looking at the TRAIN half of the global
 * phishing set only; the TEST half shows whether a change generalises.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { analyzeDomain } from "../scoring.js";
import { getRegistrableDomain } from "../rdap.js";
import { SETS, legitTrancoSample } from "./sets.mjs";

const args = new Set(process.argv.slice(2));
const version = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8")).version;

// Domain ages from `node eval/fetch-ages.mjs` (optional).
const AGES_FILE = new URL("./data/rdap-ages.json", import.meta.url);
const ageCache = existsSync(AGES_FILE) ? JSON.parse(readFileSync(AGES_FILE, "utf8")) : null;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function score(url, withAge) {
  const parsed = new URL(url);
  const opts = { protocol: parsed.protocol, path: `${parsed.pathname}${parsed.search}`, lang: "en" };
  let known = false;
  if (withAge) {
    const domain = getRegistrableDomain(parsed.hostname);
    const age = domain ? ageCache.ages[domain] : undefined;
    if (Number.isFinite(age)) {
      opts.ageDays = age;
      known = true;
    }
  }
  return { ...analyzeDomain(parsed.hostname, opts), ageKnown: known };
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—");

function measure(sets, withAge, details) {
  const rows = [];
  for (const set of sets) {
    let flagged = 0;
    let high = 0;
    let total = 0;
    let aged = 0;
    for (const url of set.urls) {
      let result;
      try {
        result = score(url, withAge);
      } catch {
        continue; // unparsable URL
      }
      total += 1;
      if (result.ageKnown) aged += 1;
      const isFlagged = result.level === "medium" || result.level === "high";
      if (isFlagged) flagged += 1;
      if (result.level === "high") high += 1;
      if (!details) continue;
      if (set.kind === "scam" && !isFlagged && (set.train || (!set.name.startsWith("Global") && !set.holdout))) {
        details.missed.push({ set: set.name, url, score: result.score });
      }
      if (set.kind === "legit" && isFlagged) {
        details.falseAlarms.push({ set: set.name, url, score: result.score, reasons: result.reasons });
      }
    }
    rows.push({ ...set, total, flagged, high, aged });
  }
  return rows;
}

const details = { missed: [], falseAlarms: [] };
const rows = measure(SETS, false, details);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const scamRows = rows.filter((r) => r.kind === "scam");
const legitRows = rows.filter((r) => r.kind === "legit");
const legitTotal = legitRows.reduce((s, r) => s + r.total, 0);
const legitFlagged = legitRows.reduce((s, r) => s + r.flagged, 0);

const lines = [];
lines.push(`# FraudShield accuracy (v${version})`, "");
lines.push("URL only: no domain-age lookup, no IP owner, no page scan.", "");
lines.push("| Scam links | Count | Detected (medium+high) | High only |");
lines.push("|---|---|---|---|");
for (const r of scamRows) lines.push(`| ${r.name} | ${r.total} | **${pct(r.flagged, r.total)}** | ${pct(r.high, r.total)} |`);
lines.push("", "| Legitimate links | Count | False alarms (medium+high) | High only |");
lines.push("|---|---|---|---|");
for (const r of legitRows) lines.push(`| ${r.name} | ${r.total} | **${pct(r.flagged, r.total)}** | ${pct(r.high, r.total)} |`);
lines.push(`| **All legitimate** | ${legitTotal} | **${pct(legitFlagged, legitTotal)}** (${legitFlagged}) | |`);

// URL + domain age (the layer the browser adds), when ages were fetched.
if (ageCache) {
  const ageSets = SETS.map((set) =>
    set.big ? { ...set, name: "Top sites, fixed sample of 400 (Tranco)", urls: legitTrancoSample() } : set
  );
  const ageRows = measure(ageSets, true, null);
  lines.push("", `## URL + domain age (RDAP ages fetched ${ageCache.fetchedAt})`, "");
  lines.push("Domains under 30 days old are high risk on their own; under 180 days add points. " +
    "\"Age known\" is how many links had a registry record (taken-down and reserved domains have none; " +
    "free hosting reports the host's own age, e.g. pages.dev).", "");
  lines.push("| Set | Count | Age known | Flagged (medium+high) | High only |");
  lines.push("|---|---|---|---|---|");
  for (const r of ageRows) {
    const label = r.kind === "scam" ? "detected" : "false alarms";
    lines.push(`| ${r.name} | ${r.total} | ${pct(r.aged, r.total)} | **${pct(r.flagged, r.total)}** ${label} | ${pct(r.high, r.total)} |`);
  }
}

if (args.has("--details") || args.has("--write")) {
  lines.push("", "## Missed scams (UAE set and TRAIN half only), grouped by domain ending", "");
  const groups = new Map();
  for (const m of details.missed) {
    const labels = new URL(m.url).hostname.split(".");
    const key = labels.slice(-2).join(".");
    groups.set(key, [...(groups.get(key) || []), m]);
  }
  for (const [key, list] of [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
    lines.push(`- **${key}** (${list.length}): \`${list[0].url}\``);
  }
  lines.push("", "## False alarms (legitimate links flagged)", "");
  for (const f of details.falseAlarms.slice(0, 60)) {
    lines.push(`- ${f.score} \`${f.url}\` (${f.set}): ${f.reasons.filter((r) => !/age unknown/i.test(r)).join("; ")}`);
  }
  if (details.falseAlarms.length > 60) lines.push(`- … and ${details.falseAlarms.length - 60} more`);
}

const text = lines.join("\n");
console.log(text);
if (args.has("--write")) {
  writeFileSync(new URL("./RESULTS.md", import.meta.url), `${text}\n`);
  console.log("\nWrote eval/RESULTS.md");
}
