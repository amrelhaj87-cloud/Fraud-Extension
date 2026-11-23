/**
 * Plain Node test runner for the domain scorer.
 * Run with: node test.js
 */

import { analyzeDomain } from "./scoring.js";

let passed = 0;
let failed = 0;

function check(name, condition, result) {
  if (condition) {
    console.log(`PASS  ${name}`);
    passed += 1;
    return;
  }

  console.error(`FAIL  ${name}`);
  console.assert(condition, `Unexpected result: ${JSON.stringify(result)}`);
  failed += 1;
}

function expectOfficial(hostname) {
  const result = analyzeDomain(hostname);
  check(
    `${hostname} -> safe (score 0)`,
    result.score === 0 &&
      result.level === "safe" &&
      result.reasons.includes("دومين رسمي موثّق"),
    result
  );
}

function expectHigh(hostname) {
  const result = analyzeDomain(hostname);
  check(
    `${hostname} -> high`,
    result.level === "high" && result.score >= 60,
    result
  );
  return result;
}

// 1) Official domains and subdomains.
expectOfficial("adpolice.gov.ae");
expectOfficial("portal.tamm.abudhabi");
expectOfficial("www.adcb.com");

// 2) Clear fraud patterns.
expectHigh("adpolice-fines.xyz");
expectHigh("adp0lice.com");
expectHigh("tamm-pay.top");
expectHigh("emiratespost.linktr.ee");

// 3) IDN homograph of "adcb" (Cyrillic а -> punycode).
const homograph = expectHigh("xn--dcb-5cd.com");
check(
  "punycode homograph reports a non-Latin reason",
  homograph.reasons.some((reason) => reason.includes("غير لاتينية")),
  homograph
);

// 4) Brand + verification wording can be medium or high, but never safe/low.
const uaePass = analyzeDomain("uaepass-verify.com");
check(
  "uaepass-verify.com -> medium or high",
  uaePass.level === "medium" || uaePass.level === "high",
  uaePass
);

// 5) Well-known neutral domains must not be flagged high.
for (const hostname of [
  "google.com",
  "github.com",
  "wikipedia.org",
  "amazon.ae",
  "noon.com"
]) {
  const result = analyzeDomain(hostname);
  check(`${hostname} -> not high`, result.level !== "high", result);
}

// 6) A very new domain must add risk points.
const neutral = analyzeDomain("example.com");
const veryNew = analyzeDomain("example.com", { ageDays: 3 });
check(
  "ageDays: 3 increases the score",
  veryNew.score > neutral.score,
  { neutral, veryNew }
);
check(
  "ageDays: 3 adds at least 35 points",
  veryNew.score - neutral.score >= 35,
  { neutral, veryNew }
);
check(
  "unknown age is reported without points",
  neutral.reasons.includes("عمر الدومين غير معروف") &&
    neutral.score === 0,
  neutral
);

// 7) HTTP and score cap behavior.
const httpResult = analyzeDomain("example.com", { protocol: "http:" });
check(
  "HTTP increases the score",
  httpResult.score > neutral.score,
  { neutral, httpResult }
);

const capped = analyzeDomain("adpolice-fines-pay-verify-login.xyz", {
  protocol: "http:",
  ageDays: 2
});
check(
  "score is capped at 100",
  capped.score === 100 && capped.level === "high",
  capped
);

// 8) Level thresholds are reachable and sane.
check(
  "official is the only safe level",
  analyzeDomain("example.com").level === "low",
  analyzeDomain("example.com")
);

// 9) False positives: common legitimate domains must never be medium/high.
const LEGIT = [
  "dewalt.com", "stammer.com", "amazon.ae", "noon.com", "careem.com",
  "talabat.com", "emirates.com", "etihad.com", "dubizzle.com", "bayut.com",
  "amex.com", "band.com", "sand.com", "dw.com", "mod.uk", "moz.com",
  "icq.com", "ikea.com", "seandiego.com", "salt.com", "sales.com",
  "malik.com", "java.com", "bbc.com", "youtube.com", "paypal.com",
  "booking.com", "khaleejtimes.com", "gulfnews.com", "carrefouruae.com",
  "sharafdg.com", "deliveroo.ae", "trackingmore.com", "securelist.com",
  "dubaicustoms.gov.ae", "u.ae", "adnoc.ae", "thenationalnews.com"
];
for (const hostname of LEGIT) {
  const result = analyzeDomain(hostname, { protocol: "https:" });
  check(
    `${hostname} -> not medium/high (false positive guard)`,
    result.level === "low" || result.level === "safe",
    result
  );
}

// 10) Realistic UAE phishing patterns must stay high.
for (const hostname of [
  "tammpay.top", "adcb-login.com", "emiratespost-delivery.com",
  "aramex-track.online", "dubaipolice-fines.com", "salik-pay.com",
  "enbd-verify.com", "moi-fines.com"
]) {
  expectHigh(hostname);
}

console.log("");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
