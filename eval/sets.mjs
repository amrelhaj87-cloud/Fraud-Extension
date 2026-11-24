/**
 * The scale's labelled data sets, shared by run.mjs and fetch-ages.mjs.
 */

import { readFileSync } from "node:fs";

const DATA = new URL("./data/", import.meta.url);

const readText = (name) =>
  readFileSync(new URL(name, DATA), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

const golden = JSON.parse(readFileSync(new URL("uae-golden.json", DATA), "utf8")).cases;
const openphish = JSON.parse(readFileSync(new URL("phish-openphish.json", DATA), "utf8"));
const phishdb = JSON.parse(readFileSync(new URL("phish-phishingdb.json", DATA), "utf8"));
const tranco = readText("legit-tranco-top5000.txt").map((d) => `https://${d}/`);

export const SETS = [
  { name: "UAE scams (hand-labelled)", kind: "scam", urls: golden.filter((c) => c.truth === "phish").map((c) => c.url) },
  { name: "Global phishing, TRAIN half", kind: "scam", urls: openphish.train, train: true },
  { name: "Global phishing, TEST half", kind: "scam", urls: openphish.test },
  // Test-only: never used to design rules.
  { name: "Phishing.Database links (sample 2000)", kind: "scam", urls: phishdb.links, holdout: true },
  { name: "Phishing.Database domains (sample 2000)", kind: "scam", urls: phishdb.domains, holdout: true },
  { name: "Phishing.Database links naming UAE / .ae (600)", kind: "scam", urls: phishdb.uae.links, holdout: true },
  { name: "UAE legit + hard negatives (hand-labelled)", kind: "legit", urls: golden.filter((c) => c.truth !== "phish").map((c) => c.url) },
  { name: "UAE legit sites", kind: "legit", urls: readText("legit-uae.txt") },
  { name: "Top 5000 sites (Tranco)", kind: "legit", urls: tranco, big: true },
  { name: "Legit free hosting + brand subdomains", kind: "legit", urls: readText("legit-free-hosting.txt") }
];

// Fixed random sample of the top 5000 for the domain-age layer (RDAP is slow,
// and 5000 lookups would hammer the registries). Seeded, so always the same.
export function legitTrancoSample(size = 400, seed = 7) {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const copy = [...tranco];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, size);
}

// Every URL except the full top-5000 list.
export function allEvalUrls() {
  return SETS.filter((s) => !s.big).flatMap((s) => s.urls);
}
