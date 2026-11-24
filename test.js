/**
 * Plain Node test runner for the domain scorer.
 * Run with: node test.js
 */

import { analyzeDomain } from "./scoring.js";
import "./phone-claims.js";
import { getIpOwner, isGoogleServiceIp, classifyRdap } from "./ip-intel.js";

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

expectOfficial("www.bankfab.com");
expectOfficial("etihad.com");

// 8b) Bilingual reasons with UAE sector labels.
const en = analyzeDomain("bankfab.com.wallet-studio.icu", { lang: "en" });
check(
  "English reasons name the impersonated UAE bank",
  en.level === "high" &&
    en.reasons.some((r) => r.includes("First Abu Dhabi Bank (UAE bank)")) &&
    en.reasons.every((r) => !/[؀-ۿ]/.test(r)),
  en
);
const ar = analyzeDomain("uaepass-verify.com", { lang: "ar" });
check(
  "Arabic reasons name the sector (digital identity)",
  ar.reasons.some((r) => r.includes("UAE PASS (الهوية الرقمية)")),
  ar
);
check(
  "English official reason",
  analyzeDomain("adcb.com", { lang: "en" }).reasons[0] === "Verified official domain",
  analyzeDomain("adcb.com", { lang: "en" })
);

// 8c) Any domain under 30 days old is high risk, even with no other signal.
for (const days of [0, 1, 29]) {
  const r = analyzeDomain("aidev-future.buzz", { ageDays: days });
  check(`${days}-day-old domain -> high`, r.level === "high" && r.score >= 70, r);
}
const plainNew = analyzeDomain("example-shop.com", { ageDays: 5 });
check("new domain with no other signals -> high", plainNew.level === "high", plainNew);
const thirtyDays = analyzeDomain("example-shop.com", { ageDays: 30 });
check("30-day-old plain domain -> not high", thirtyDays.level !== "high", thirtyDays);

// 8d) Mobile-billing subscription scams and random subdomains.
const subscription = analyzeDomain("96dknvhyhd73dazre.fantex.online", {
  protocol: "https:",
  path: "/ce13l2k.php?key=e4hvmpydltlpjn4r8sb7&op=ae-etisalat&visitor_id=1148"
});
check("carrier-targeted link with random subdomain -> high", subscription.level === "high", subscription);
for (const [host, path] of [
  ["www.google.com", "/search?q=du+recharge"],
  ["en.wikipedia.org", "/wiki/Du_(company)"],
  ["www.etisalat.ae", "/?op=ae-etisalat"]
]) {
  const r = analyzeDomain(host, { protocol: "https:", path });
  check(`${host}${path} -> no carrier false positive`, r.level === "low" || r.level === "safe", r);
}

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
  "enbd-verify.com", "moi-fines.com",
  // Official domain hidden inside a subdomain of another site.
  "bankfab.com.wallet-studio.icu", "www.adpolice.gov.ae.fines-pay.com",
  "uaepass.ae.auth-check.site", "adib-online.xyz", "etihad-refund.com"
]) {
  expectHigh(hostname);
}

// 11) Raw IP links: public IPs are at least medium, high over plain HTTP;
//     local network / loopback addresses are not flagged.
for (const ip of ["142.250.201.110", "45.33.32.156"]) {
  const https = analyzeDomain(ip, { protocol: "https:" });
  check(`${ip} over https -> medium`, https.level === "medium", https);
  const http = analyzeDomain(`http://${ip}/login`, { protocol: "http:" });
  check(`${ip} over http -> high`, http.level === "high", http);
}
for (const local of ["192.168.1.1", "127.0.0.1", "10.0.0.5", "172.20.1.1", "[::1]"]) {
  const result = analyzeDomain(local, { protocol: "https:" });
  check(`${local} (local network) -> low`, result.level === "low", result);
}
// Hex / decimal IP forms are normalised to dotted form by the URL parser.
const hexIp = analyzeDomain("http://0x8efac96e/", { protocol: "http:" });
check("hex IP 0x8efac96e -> high", hexIp.level === "high", hexIp);

// 12) Who owns the IP? Google's own service ranges vs rented / home addresses.
check("142.250.201.110 is a Google service IP", isGoogleServiceIp("142.250.201.110"), null);
check("8.8.8.8 is a Google service IP", isGoogleServiceIp("8.8.8.8"), null);
check("34.117.59.81 (Google Cloud) is NOT a Google service IP", !isGoogleServiceIp("34.117.59.81"), null);
check("2a00:1450:4001:80b::200e is a Google service IP", isGoogleServiceIp("2a00:1450:4001:80b::200e"), null);
check("[2a00:1450:4001:80b::200e] (brackets) handled", isGoogleServiceIp("[2a00:1450:4001:80b::200e]"), null);

const rdap = (name, registrant, extra = {}) => ({
  name,
  entities: [{ roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", registrant]]] }],
  ...extra
});
const owners = [
  ["AWS", rdap("AT-88-Z", "Amazon Technologies Inc."), "hosting"],
  ["Google Cloud", rdap("GOOGL-2", "Google LLC"), "hosting"],
  ["Apple", rdap("APPLE-WWNET", "Apple Inc."), "service"],
  ["Meta", rdap("THEFA-3", "Facebook, Inc."), "service"],
  ["Telefonica (RIPE, with Hostmaster role)", {
    name: "DE-MEDIAWAYS-20120425",
    entities: [
      { roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", "MDA-Z"]]] },
      { roles: ["abuse"], vcardArray: ["vcard", [["fn", {}, "text", "mediaWays Hostmaster"]]] },
      { roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", "Telefonica Germany GmbH & Co.OHG"]]] }
    ]
  }, "isp"],
  ["du (owner only in remarks)", {
    name: "DIC-NET",
    entities: [{ roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", "DIC-MNT"]]] }],
    remarks: [{ description: ["Emirates Integrated Telecommunications Company PJSC (EITC-DU)", "*****"] }]
  }, "isp"]
];
for (const [label, data, kind] of owners) {
  const owner = classifyRdap(data);
  check(`RDAP owner ${label} -> ${kind} (${owner && owner.owner})`, owner && owner.kind === kind, owner);
}
const geo = classifyRdap({ name: "LINODE-US", entities: [{ roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", "Akamai Technologies, Inc."]]] }], remarks: [{ description: ["Geofeed https://ipgeo.akamai.com/linode-geofeed.csv"] }] });
check("Geofeed remark is not used as the owner name", geo.owner === "Akamai Technologies, Inc." && geo.kind === "hosting", geo);
const du = classifyRdap(owners[5][1]);
check("du owner name read from remarks", du.owner.startsWith("Emirates Integrated"), du);

// getIpOwner: Google service IPs and local IPs never hit the network.
let fetchCalls = 0;
const fakeFetch = async () => {
  fetchCalls += 1;
  return { ok: true, json: async () => rdap("AT-88-Z", "Amazon Technologies Inc.") };
};
const googleOwner = await getIpOwner("142.250.201.110", { fetch: fakeFetch });
check("getIpOwner(142.250.201.110) -> Google service, no network", googleOwner.kind === "service" && fetchCalls === 0, googleOwner);
check("getIpOwner(192.168.1.1) -> null, no network", (await getIpOwner("192.168.1.1", { fetch: fakeFetch })) === null && fetchCalls === 0, null);
check("getIpOwner(example.com) -> null (not an IP)", (await getIpOwner("example.com", { fetch: fakeFetch })) === null, null);
const awsOwner = await getIpOwner("52.95.110.1", { fetch: fakeFetch });
check("getIpOwner(52.95.110.1) -> hosting via RDAP", awsOwner.kind === "hosting" && fetchCalls === 1, awsOwner);
const failOwner = await getIpOwner("52.95.110.2", { fetch: async () => { throw new Error("offline"); } });
check("getIpOwner offline -> null (no crash)", failOwner === null, failOwner);

// Scoring with the owner.
const gService = analyzeDomain("142.250.201.110", { protocol: "https:", ipOwner: googleOwner });
check("Google's own IP -> low with 'own services' reason", gService.level === "low" && gService.score === 0 && gService.reasons.some((r) => r.includes("Google")), gService);
const gHttp = analyzeDomain("http://142.250.201.110/", { protocol: "http:", ipOwner: googleOwner });
check("Google's own IP over http -> still low (http only)", gHttp.level === "low", gHttp);
const rented = analyzeDomain("34.117.59.81", { protocol: "https:", ipOwner: { kind: "hosting", owner: "Google LLC" }, lang: "en" });
check("rented cloud IP -> medium with 'rented server' reason", rented.level === "medium" && rented.reasons.some((r) => r.startsWith("Rented server at Google LLC")), rented);
const home = analyzeDomain("94.200.1.1", { protocol: "https:", ipOwner: { kind: "isp", owner: "EITC-DU" } });
check("home/mobile connection IP -> high", home.level === "high", home);
const unknownOwner = analyzeDomain("45.33.32.156", { protocol: "https:", ipOwner: null });
check("owner unknown -> medium (unchanged)", unknownOwner.level === "medium", unknownOwner);

// 13) Known body + personal mobile number (fake "customer service").
const PH = globalThis.FE_PHONE;
const phoneCases = [
  ["ADCB Customer Care: call 055 123 4567", { brand: "adcb", phone: "0551234567" }],
  ["شرطة أبوظبي — اتصل على +971 50 123 4567", { brand: "adpolice", phone: "+971501234567" }],
  ["Emirates Post delivery: 00971-52-765-4321", { brand: "emiratespost", phone: "+971527654321" }],
  ["بريد الإمارات ٠٥٠١٢٣٤٥٦٧", { brand: "emiratespost", phone: "0501234567" }],
  ["ADCB contact centre 600 50 2030", null],          // official 600 number
  ["Abu Dhabi Police 800 2626", null],                // official 800 number
  ["Abu Dhabi Police landline 02 512 2222", null],    // landline
  ["My bakery, call 050 123 4567", null],             // no brand claimed
  ["fab deals, call 050 123 4567", null]              // 'fab' alone is not the bank
];
for (const [text, expected] of phoneCases) {
  const got = PH.findBrandMobile(text);
  check(`brand+mobile: "${text}" -> ${JSON.stringify(expected)}`,
    JSON.stringify(got) === JSON.stringify(expected), got);
}

console.log("");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
