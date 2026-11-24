/**
 * FraudShield — accuracy scale ("الميزان").
 *
 * Runs the scorer (scoring.js) on labelled data and reports two numbers:
 *   detection    share of scam links flagged (medium or high)
 *   false alarms share of legitimate links flagged
 *
 * URL ONLY: no domain-age lookup, no IP owner, no page scan. In the browser
 * those layers add more, so real detection is higher than what this measures.
 *
 * Usage (from the project root):
 *   node eval/run.mjs              summary table
 *   node eval/run.mjs --details    + missed scams (TRAIN half only) and false alarms
 *   node eval/run.mjs --write      also writes eval/RESULTS.md
 *
 * Rule changes must be designed by looking at the TRAIN half of the global
 * phishing set only; the TEST half shows whether a change generalises.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { analyzeDomain } from "../scoring.js";

const DATA = new URL("./data/", import.meta.url);
const args = new Set(process.argv.slice(2));
const version = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8")).version;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const readText = (name) =>
  readFileSync(new URL(name, DATA), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

const golden = JSON.parse(readFileSync(new URL("uae-golden.json", DATA), "utf8")).cases;
const openphish = JSON.parse(readFileSync(new URL("phish-openphish.json", DATA), "utf8"));

const SETS = [
  { name: "UAE scams (hand-labelled)", kind: "scam", urls: golden.filter((c) => c.truth === "phish").map((c) => c.url) },
  { name: "Global phishing, TRAIN half", kind: "scam", urls: openphish.train, train: true },
  { name: "Global phishing, TEST half", kind: "scam", urls: openphish.test },
  { name: "UAE legit + hard negatives (hand-labelled)", kind: "legit", urls: golden.filter((c) => c.truth !== "phish").map((c) => c.url) },
  { name: "UAE legit sites", kind: "legit", urls: readText("legit-uae.txt") },
  { name: "Top 5000 sites (Tranco)", kind: "legit", urls: readText("legit-tranco-top5000.txt").map((d) => `https://${d}/`) },
  { name: "Legit pages on free hosting", kind: "legit", urls: readText("legit-free-hosting.txt") }
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function score(url) {
  const parsed = new URL(url);
  return analyzeDomain(parsed.hostname, {
    protocol: parsed.protocol,
    path: `${parsed.pathname}${parsed.search}`,
    lang: "en"
  });
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—");

const rows = [];
const details = { missed: [], falseAlarms: [] };

for (const set of SETS) {
  let flagged = 0;
  let high = 0;
  let total = 0;
  for (const url of set.urls) {
    let result;
    try {
      result = score(url);
    } catch {
      continue; // unparsable URL
    }
    total += 1;
    const isFlagged = result.level === "medium" || result.level === "high";
    if (isFlagged) flagged += 1;
    if (result.level === "high") high += 1;
    if (set.kind === "scam" && !isFlagged && (set.train || !set.name.startsWith("Global"))) {
      details.missed.push({ set: set.name, url, score: result.score });
    }
    if (set.kind === "legit" && isFlagged) {
      details.falseAlarms.push({ set: set.name, url, score: result.score, reasons: result.reasons });
    }
  }
  rows.push({ ...set, total, flagged, high });
}

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
