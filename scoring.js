/**
 * FraudShield — UAE-focused domain risk scorer.
 * Pure ES module: works in Chrome (service worker / content scripts) and Node.
 * No network calls and no browser APIs are used here.
 */

import "./i18n.js";

const I18N = globalThis.FE_I18N;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OFFICIAL_DOMAINS = [
  "adpolice.gov.ae",
  "tamm.abudhabi",
  "abudhabi.ae",
  "moi.gov.ae",
  "uaepass.ae",
  "ica.gov.ae",
  "mohre.gov.ae",
  "dubaipolice.gov.ae",
  "emiratespost.ae",
  "aramex.com",
  "adcb.com",
  "enbd.com",
  "emiratesnbd.com",
  "fab.ae",
  "mashreqbank.com",
  "mashreq.com",
  "dib.ae",
  "rakbank.ae",
  "cbd.ae",
  "etisalat.ae",
  "eand.com",
  "du.ae",
  "dewa.gov.ae",
  "addc.ae",
  "salik.ae",
  "rta.ae",
  "u.ae",
  "bankfab.com",
  "adib.ae",
  "emiratesislamic.ae",
  "nbf.ae",
  "etihad.com",
  "etihadwe.ae", // Etihad Water & Electricity (not the airline)
  "etihadrail.ae",
  "emirates.com",
  "tdra.gov.ae",
  "adnoc.ae"
];

// Points for a link that uses a public IP address instead of a domain name.
const IP_HOST_POINTS = 45;
// Extra points when that IP is a home / mobile connection (often a hacked device).
const IP_ISP_POINTS = 20;

// Registry-restricted suffixes: only government bodies can register these.
const OFFICIAL_SUFFIXES = ["gov.ae"];

const BRANDS = [
  "adpolice",
  "tamm",
  "uaepass",
  "emiratespost",
  "aramex",
  "adcb",
  "enbd",
  "emiratesnbd",
  "mashreq",
  "rakbank",
  "etisalat",
  "eand",
  "du",
  "dewa",
  "salik",
  "moi",
  "ica",
  "dubaipolice",
  "bankfab",
  "fab",
  "adib",
  "emiratesislamic",
  "etihad",
  "icp",
  "emiratesid"
];

// Labels that make a subdomain look like a complete domain (bankfab.com.evil.icu).
const DOMAIN_LIKE_LABELS = new Set(["com", "net", "org", "ae", "gov", "co"]);

const RISK_WORDS = [
  "pay",
  "fine",
  "fines",
  "update",
  "verify",
  "login",
  "secure",
  "refund",
  "claim",
  "track",
  "delivery",
  "wallet",
  "auth",
  "otp",
  "kyc",
  "account",
  "portal",
  "recharge",
  "reward",
  "prize",
  "bonus",
  "gift"
];

const SUSPICIOUS_TLDS = [
  "xyz",
  "top",
  "click",
  "icu",
  "vip",
  "buzz",
  "live",
  "shop",
  "online",
  "site",
  "cc",
  "tk",
  "ml"
];

const FREE_HOSTING = [
  "linktr.ee",
  "blogspot.com",
  "sites.google.com",
  "wixsite.com",
  "weebly.com",
  "github.io",
  "netlify.app",
  "vercel.app",
  "pages.dev"
];

// Free hosting used by throw-away phishing pages too (checked with the scale).
FREE_HOSTING.push("workers.dev", "godaddysites.com", "web.app", "firebaseapp.com", "glitch.me", "framer.website");

// Wildcard DNS services that turn any IP into a name.
const IP_IN_NAME_HOSTS = ["sslip.io", "nip.io", "xip.io", "traefik.me"];

// Brands phished worldwide (the UAE list is BRANDS above).
// single: the brand runs one site only, so roblox.ss or roblox.com.bo is fake.
const GLOBAL_BRANDS = {
  paypal: { name: "PayPal", single: true, sites: ["paypal.com", "paypal.me"] },
  netflix: { name: "Netflix", single: true, sites: ["netflix.com", "netflix.net"] },
  instagram: { name: "Instagram", single: true, sites: ["instagram.com"] },
  facebook: { name: "Facebook", single: true, sites: ["facebook.com", "facebook.net"] },
  whatsapp: { name: "WhatsApp", single: true, sites: ["whatsapp.com", "whatsapp.net"] },
  roblox: { name: "Roblox", single: true, sites: ["roblox.com", "roblox.net"] },
  linkedin: { name: "LinkedIn", single: true, sites: ["linkedin.com"] },
  docusign: { name: "DocuSign", single: true, sites: ["docusign.com", "docusign.net"] },
  coinbase: { name: "Coinbase", single: true, sites: ["coinbase.com"] },
  metamask: { name: "MetaMask", single: true, sites: ["metamask.io"] },
  walletconnect: { name: "WalletConnect", single: true, sites: ["walletconnect.com", "walletconnect.network"] },
  steamcommunity: { name: "Steam", single: true, sites: ["steamcommunity.com"] },
  steampowered: { name: "Steam", single: true, sites: ["steampowered.com"] },
  dropbox: { name: "Dropbox", single: true, sites: ["dropbox.com"] },
  icloud: { name: "iCloud", single: true, sites: ["icloud.com", "icloud.com.cn"] },
  microsoft: { name: "Microsoft", sites: ["microsoft.com"] },
  office365: { name: "Microsoft 365", sites: ["office365.com"] },
  outlook: { name: "Outlook", sites: ["outlook.com"] },
  amazon: { name: "Amazon", sites: [] },
  apple: { name: "Apple", sites: ["apple.com"] },
  binance: { name: "Binance", sites: [] },
  shopee: { name: "Shopee", sites: [] },
  mercadolivre: { name: "Mercado Livre", sites: [] },
  mercadolibre: { name: "Mercado Libre", sites: [] },
  vodafone: { name: "Vodafone", sites: [] },
  telegram: { name: "Telegram", sites: ["telegram.org", "telegra.ph", "t.me"] },
  tiktok: { name: "TikTok", sites: ["tiktok.com"] },
  dhl: { name: "DHL", sites: [] },
  fedex: { name: "FedEx", sites: [] },
  hsbc: { name: "HSBC", sites: [] },
  bbva: { name: "BBVA", sites: [] }
};

// Any domain younger than this is forced to at least NEW_DOMAIN_MIN_SCORE (high).
const NEW_DOMAIN_DAYS = 30;
const NEW_DOMAIN_MIN_SCORE = 70;

// Two-label public suffixes used by the UAE and common external domains.
const TWO_LEVEL_SUFFIXES = new Set([
  "gov.ae",
  "co.ae",
  "com.ae",
  "net.ae",
  "org.ae",
  "co.uk",
  "com.au"
]);

// Visual lookalikes used by homograph domains (Cyrillic / Greek -> Latin).
const CONFUSABLES = Object.freeze({
  "\u0430": "a", // Cyrillic a
  "\u0435": "e", // Cyrillic e
  "\u043E": "o", // Cyrillic o
  "\u0440": "p", // Cyrillic p
  "\u0441": "c", // Cyrillic c
  "\u0445": "x", // Cyrillic x
  "\u0443": "y", // Cyrillic y
  "\u0456": "i", // Cyrillic i
  "\u0455": "s", // Cyrillic s
  "\u0501": "d", // Cyrillic d
  "\u04BB": "h", // Cyrillic h
  "\u04CF": "l", // Cyrillic l
  "\u0458": "j", // Cyrillic j
  "\u051B": "q", // Cyrillic q
  "\u051D": "w", // Cyrillic w
  "\u0261": "g", // Latin script g
  "\u03B1": "a", // Greek alpha
  "\u03BF": "o", // Greek omicron
  "\u03B5": "e", // Greek epsilon
  "\u03B9": "i", // Greek iota
  "\u03C1": "p", // Greek rho
  "\u03BD": "v", // Greek nu
  "\u03BA": "k", // Greek kappa
  "\u03C4": "t", // Greek tau
  "\u03C5": "u", // Greek upsilon
  "\u03C7": "x" // Greek chi
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score a hostname from 0 (confirmed official) to 100 (very likely fraudulent).
 *
 * @param {string} hostname
 * @param {{protocol?: string, ageDays?: number|null, path?: string,
 *          ipOwner?: {kind: string, owner: string}|null}} opts
 * @returns {{score: number, level: "safe"|"low"|"medium"|"high", reasons: string[]}}
 */
export function analyzeDomain(hostname, opts = {}) {
  const lang = I18N.resolve(opts.lang);
  const t = (key, params) => I18N.t(key, lang, params);
  const brandName = (brand) => I18N.brandLabel(brand, lang);
  const reasons = [];
  let score = 0;

  const add = (points, reason) => {
    score += points;
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  };

  let host = normalizeHostname(hostname);
  if (!host) {
    return {
      score: 0,
      level: "low",
      reasons: [t("unreadable")]
    };
  }

  // 1) Official domains always win, including any subdomain.
  if (isOfficialHost(host)) {
    return {
      score: 0,
      level: "safe",
      reasons: [t("official")]
    };
  }

  // 2) Decode punycode; non-Latin characters are a homograph signal.
  const decoded = decodePunycodeHostname(host);
  host = decoded.host;

  // Only names disguised as Latin letters count: a label that mixes Latin
  // with other scripts (аdcb), or one made entirely of look-alikes (аррӏе).
  // Sites written in their own script (Thai, Arabic, Chinese) are normal.
  if (host.split(".").some(isLatinDisguise)) {
    add(40, t("homograph"));
  } else if (decoded.failed) {
    add(40, t("punycodeBad"));
  }

  const domain = splitRegistrableDomain(host);
  const rawBase = domain.base.toLowerCase();
  const visualHost = foldConfusables(normalizeLookalikes(host));
  const visualBase = foldConfusables(normalizeLookalikes(rawBase));

  // 3) Typosquatting and brand containment.
  const typo = findTyposquat(visualBase, rawBase);
  if (typo) {
    add(
      50,
      t("typo", { brand: brandName(typo.brand), misspell: typo.distance > 0 })
    );
  }

  // Latin brand token, or a UAE body's name written in Arabic (شرطة-أبوظبي.com).
  const containedBrand =
    BRANDS.find((brand) => containsBrand(visualHost, brand)) || findArabicBrand(host);
  if (containedBrand) {
    add(45, t("contains", { brand: brandName(containedBrand) }));
  }

  // 3b) A real domain used as a subdomain of another site:
  //     bankfab.com.wallet-studio.icu, www.adpolice.gov.ae.fines-pay.com
  const mimicked = findMimickedOfficial(host);
  if (mimicked) {
    add(
      50,
      t("mimic", { official: mimicked, real: `${domain.base}.${domain.tld}` })
    );
  } else if (!domain.isIp && hasDomainLikeSubdomain(host, domain)) {
    add(30, t("domainLike"));
  }

  const brandSignal = Boolean(typo || containedBrand || mimicked);

  // 4) Risk words, with an extra penalty when a brand is also present.
  const riskMatches = findRiskWords(host);
  if (riskMatches.length > 0) {
    add(15, t("riskWords", { words: riskMatches }));
    if (brandSignal) {
      add(20, t("brandRisk"));
    }
  }

  // 5) Cheap / frequently abused TLD.
  if (domain.tld && SUSPICIOUS_TLDS.includes(domain.tld)) {
    add(20, t("tld", { tld: domain.tld }));
  }

  // 6) Free hosting or site builders pretending to represent a brand.
  const freeHost = FREE_HOSTING.find(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
  if (freeHost) {
    const path = typeof opts.path === "string" ? opts.path : "";
    const freeText = foldConfusables(normalizeLookalikes(`${host} ${path}`));
    if (BRANDS.some((brand) => containsBrand(freeText, brand))) {
      add(40, t("freeHost", { host: freeHost }));
    } else if (findGlobalBrand(host.slice(0, -freeHost.length)) &&
               !isOwnCodeHostAccount(host, freeHost)) {
      // A globally phished brand on a free site (instagramrecovery.blogspot.com).
      add(40, t("freeHost", { host: freeHost }));
    }
    // Machine-made throw-away names (7h9u4-5zb-xqvi-ynb8i-20-10-2026-aa.pages.dev).
    if (looksGenerated(host.slice(0, -freeHost.length - 1))) {
      add(20, t("freeHostRandom", { host: freeHost }));
    }
  }

  // 6a) Global brand misspelt on purpose (steamconmmunity, e-docssign).
  const globalTypo = findGlobalBrandTypo(host);
  if (globalTypo && !typo) {
    add(45, t("typo", { brand: globalTypo, misspell: true }));
  }

  // 6a+) Global brand + risk word in the domain itself (instagram-verify.com,
  //       paypal-login.net). The brand alone is not enough: fan sites exist.
  const globalInBase = !freeHost && !globalTypo ? findGlobalBrand(domain.base) : null;
  if (globalInBase && !GLOBAL_BRANDS[globalInBase].sites.some((s) => host === s || host.endsWith(`.${s}`)) &&
      (riskMatches.length > 0 || findMisspeltRiskWord(host))) {
    add(40, t("contains", { brand: GLOBAL_BRANDS[globalInBase].name }));
  }

  // 6a') Global brand as a subdomain of an unrelated site
  //      (walletconnect.wallet-veriffy.com, bbva.e-docssign.net).
  const brandSub = findGlobalBrandSubdomain(host, domain);
  if (brandSub && !freeHost) {
    add(30, t("contains", { brand: brandSub }));
  }

  // 6a'') Risk word misspelt by an added or dropped letter (veriffy, acount).
  const misspelt = findMisspeltRiskWord(host);
  if (misspelt) {
    add(15, t("riskWords", { words: [misspelt] }));
  }

  // 6b) A single-site global brand on another ending: roblox.ss, roblox.com.bo.
  const lookalikeSite = findBrandOnOtherEnding(host);
  if (lookalikeSite) {
    add(50, t("contains", { brand: lookalikeSite }));
  }

  // 6c) An IP address hidden in a name (217-77-5-150.sslip.io): same as a raw IP.
  if (IP_IN_NAME_HOSTS.some((suffix) => host.endsWith(`.${suffix}`)) &&
      /(^|[.-])\d{1,3}[.-]\d{1,3}[.-]\d{1,3}[.-]\d{1,3}([.-]|$)/.test(host)) {
    add(IP_HOST_POINTS, t("ipInName"));
  }

  // 7) Structural red flags.
  if (!domain.isIp && domain.subdomainCount > 3) {
    add(10, t("manySubs"));
  }
  const hyphenCount = (host.match(/-/g) || []).length;
  if (hyphenCount > 2) {
    add(10, t("manyHyphens"));
  }
  // A raw IP instead of a name: legitimate sites almost never send people to
  // one, phishing kits often do. 45 alone is medium; with plain HTTP it is high.
  // Local network / loopback addresses (router pages, dev servers) are exempt.
  if (domain.isIp) {
    // opts.ipOwner (ip-intel.js) says who owns the address.
    const owner = opts.ipOwner && typeof opts.ipOwner === "object" ? opts.ipOwner : null;
    if (isPrivateIp(host)) {
      reasons.push(t("ipLocal"));
    } else if (owner && owner.kind === "service") {
      // The company's own network (Google Search, Apple, Meta), not rented out.
      reasons.push(t("ipService", { owner: owner.owner }));
    } else {
      add(IP_HOST_POINTS, t("ip"));
      if (owner && owner.kind === "hosting") {
        reasons.push(t("ipHosting", { owner: owner.owner }));
      } else if (owner && owner.kind === "isp") {
        add(IP_ISP_POINTS, t("ipIsp", { owner: owner.owner }));
      } else if (owner && owner.owner) {
        reasons.push(t("ipOwner", { owner: owner.owner }));
      }
    }
  }
  if (host.length > 30) {
    add(10, t("long"));
  }

  // 7b) Mobile-billing scams put the target carrier in the link
  //     (?op=ae-etisalat, /du/, carrier=eand).
  const carrier = findCarrierTarget(typeof opts.path === "string" ? opts.path : "");
  if (carrier) {
    add(30, t("carrier", { carrier }));
  }

  // 7c) Throw-away random subdomains (96dknvhyhd73dazre.fantex.online).
  if (!domain.isIp && domain.subdomainCount >= 1 && looksRandom(host.split(".")[0])) {
    add(15, t("randomSub"));
  }

  // 8) Unencrypted HTTP.
  if (String(opts.protocol || "").toLowerCase() === "http:") {
    add(15, t("http"));
  }

  // 9) Domain age (RDAP). Unknown age is reported but adds no points.
  if (opts.ageDays === null || opts.ageDays === undefined || opts.ageDays === "") {
    reasons.push(t("ageUnknown"));
  } else {
    const ageDays = Number(opts.ageDays);
    if (!Number.isFinite(ageDays)) {
      reasons.push(t("ageUnknown"));
    } else if (ageDays < 30) {
      add(35, t("age30", { days: formatDays(ageDays) }));
    } else if (ageDays < 180) {
      add(15, t("age180", { days: formatDays(ageDays) }));
    }
  }

  // A domain registered in the last 30 days is high risk on its own: almost
  // every phishing / ClickFix site is used within days of registration.
  if (Number.isFinite(Number(opts.ageDays)) && opts.ageDays !== null && opts.ageDays !== "" &&
      Number(opts.ageDays) < NEW_DOMAIN_DAYS) {
    score = Math.max(score, NEW_DOMAIN_MIN_SCORE);
  }

  score = Math.min(100, score);

  return {
    score,
    level: levelForScore(score),
    reasons
  };
}

// ---------------------------------------------------------------------------
// Hostname helpers
// ---------------------------------------------------------------------------

function normalizeHostname(input) {
  if (typeof input !== "string") return "";

  let value = input.trim().toLowerCase();
  if (!value) return "";

  // Accept either a hostname or a full URL from popup/demo callers.
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

function isOfficialHost(host) {
  if (OFFICIAL_SUFFIXES.some((suffix) => host.endsWith(`.${suffix}`))) return true;
  return OFFICIAL_DOMAINS.some(
    (official) => host === official || host.endsWith(`.${official}`)
  );
}

function findMimickedOfficial(host) {
  for (const official of OFFICIAL_DOMAINS) {
    const index = host.indexOf(`${official}.`);
    if (index === 0 || (index > 0 && host[index - 1] === ".")) return official;
  }
  return null;
}

function hasDomainLikeSubdomain(host, domain) {
  const labels = host.split(".");
  // Labels before the registrable domain (base + suffix).
  const suffixLabels = domain.tld ? labels.length - domain.subdomainCount - 1 : labels.length;
  const subLabels = labels.slice(0, Math.max(0, labels.length - suffixLabels - 1));
  return subLabels.slice(1).some((label) => DOMAIN_LIKE_LABELS.has(label));
}

const CARRIERS = { etisalat: "Etisalat / e&", eand: "Etisalat / e&", du: "du" };

function findCarrierTarget(path) {
  let text = path.toLowerCase();
  try {
    text = decodeURIComponent(text);
  } catch {
    // Keep the raw text.
  }
  const match =
    text.match(/(?:^|[?&])(?:op|operator|carrier|telco|mno|network)=(?:ae[-_]?)?(etisalat|eand|du)(?=$|[&#_-])/) ||
    text.match(/(?:^|[^a-z])ae[-_](etisalat|eand|du)(?=$|[^a-z])/);
  return match ? CARRIERS[match[1]] : null;
}

function looksRandom(label) {
  if (!label || label.length < 10) return false;
  const letters = label.replace(/[^a-z]/g, "");
  const digits = label.replace(/[^0-9]/g, "");
  if (letters.length < 4 || digits.length < 2) return false;
  const vowels = letters.replace(/[^aeiou]/g, "").length;
  return vowels / letters.length < 0.3;
}

function splitRegistrableDomain(host) {
  if (isIpAddress(host)) {
    return { base: host, tld: "", subdomainCount: 0, isIp: true };
  }

  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 1) {
    return {
      base: labels[0] || host,
      tld: "",
      subdomainCount: 0,
      isIp: false
    };
  }

  if (labels.length >= 3) {
    const lastTwo = labels.slice(-2).join(".");
    if (TWO_LEVEL_SUFFIXES.has(lastTwo)) {
      const baseIndex = labels.length - 3;
      return {
        base: labels[baseIndex] || "",
        tld: labels[labels.length - 1],
        subdomainCount: Math.max(0, baseIndex),
        isIp: false
      };
    }
  }

  return {
    base: labels[labels.length - 2],
    tld: labels[labels.length - 1],
    subdomainCount: Math.max(0, labels.length - 2),
    isIp: false
  };
}

function isPrivateIp(host) {
  const h = host.replace(/^\[|\]$/g, "");
  const v4 = h.split(".").map(Number);
  if (v4.length === 4 && v4.every((n) => Number.isInteger(n))) {
    const [a, b] = v4;
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    );
  }
  return h === "::1" || /^f[cd]/i.test(h) || /^fe[89ab]/i.test(h);
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

// ---------------------------------------------------------------------------
// Punycode / homograph helpers
// ---------------------------------------------------------------------------

function decodePunycodeHostname(host) {
  let hadPunycode = false;
  let failed = false;

  const decodedLabels = host.split(".").map((label) => {
    if (!label.startsWith("xn--")) return label;
    hadPunycode = true;
    try {
      return decodePunycodeLabel(label.slice(4)).normalize("NFKC");
    } catch {
      failed = true;
      return label;
    }
  });

  return {
    host: decodedLabels.join("."),
    hadPunycode,
    failed: failed || (!hadPunycode && /[\u0080-\u{10FFFF}]/u.test(host))
  };
}

// RFC 3492 decoder, kept small so the extension needs no dependencies.
function decodePunycodeLabel(input) {
  const BASE = 36;
  const TMIN = 1;
  const TMAX = 26;
  const SKEW = 38;
  const DAMP = 700;
  const INITIAL_BIAS = 72;
  const INITIAL_N = 128;

  const output = [];
  let index = 0;
  let basic = input.lastIndexOf("-");

  if (basic > -1) {
    for (const char of input.slice(0, basic)) {
      const code = char.codePointAt(0);
      if (code >= 0x80) throw new Error("Invalid basic code point");
      output.push(code);
    }
    index = basic + 1;
  }

  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;

  while (index < input.length) {
    const oldI = i;
    let weight = 1;

    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) throw new Error("Truncated punycode");
      const digit = punycodeDigit(input[index++]);
      if (digit === null) throw new Error("Invalid punycode digit");

      i += digit * weight;
      if (!Number.isSafeInteger(i)) throw new Error("Punycode overflow");

      const threshold =
        k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < threshold) break;

      weight *= BASE - threshold;
      if (!Number.isSafeInteger(weight)) throw new Error("Punycode overflow");
    }

    const outputLength = output.length + 1;
    bias = adaptBias(i - oldI, outputLength, oldI === 0);
    n += Math.floor(i / outputLength);
    i %= outputLength;

    if (n > 0x10ffff) throw new Error("Invalid code point");
    output.splice(i, 0, n);
    i += 1;
  }

  return String.fromCodePoint(...output);
}

function punycodeDigit(char) {
  const code = char.codePointAt(0);
  if (code >= 48 && code <= 57) return code - 22; // 0-9 -> 26-35
  if (code >= 97 && code <= 122) return code - 97;
  if (code >= 65 && code <= 90) return code - 65;
  return null;
}

function adaptBias(delta, numPoints, firstTime) {
  let value = firstTime ? Math.floor(delta / 700) : delta >> 1;
  value += Math.floor(value / numPoints);

  let k = 0;
  while (value > ((36 - 1) * 26) >> 1) {
    value = Math.floor(value / (36 - 1));
    k += 36;
  }

  return k + Math.floor(((36 - 1 + 1) * value) / (value + 38));
}

// ---------------------------------------------------------------------------
// Similarity helpers
// ---------------------------------------------------------------------------

function normalizeLookalikes(value) {
  return String(value)
    .toLowerCase()
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/3/g, "e")
    .replace(/5/g, "s");
}

// Arabic names of the protected bodies, from i18n.js (e.g. "شرطة أبوظبي",
// "بنك المشرق" and "المشرق"), normalised so spelling variants match.
const normArabic = (s) =>
  String(s)
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s\-_.]/g, "");
// Too short or too common to mean the brand on their own.
const ARABIC_NAME_SKIP = new Set(["اتصالات", "دو"]);
const ARABIC_BRANDS = Object.entries((I18N && I18N.BRANDS) || {}).flatMap(([key, value]) => {
  const full = String(value.ar || "").replace(/\(.*?\)/g, "").trim();
  const names = [full];
  if (/^(بنك|مصرف) /.test(full)) names.push(full.split(" ").slice(1).join(" "));
  return names
    .filter((n) => /[؀-ۿ]/.test(n) && !ARABIC_NAME_SKIP.has(n) && normArabic(n).length >= 4)
    .map((n) => ({ key, name: normArabic(n) }));
});

function findArabicBrand(host) {
  if (!/[؀-ۿ]/.test(host)) return null;
  const text = normArabic(host);
  const hit = ARABIC_BRANDS.find((b) => text.includes(b.name));
  return hit ? hit.key : null;
}

// Global brand token in a name: a whole token (apple-id), or glued to a
// risk word / digits (instagramrecovery, shopeeid377), never inside another
// word (pineapple, metadata).
function findGlobalBrand(text) {
  const tokens = String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const brand of Object.keys(GLOBAL_BRANDS)) {
    for (const token of tokens) {
      if (token === brand) return brand;
      if (!token.startsWith(brand) && !token.endsWith(brand)) continue;
      const rest = token.startsWith(brand) ? token.slice(brand.length) : token.slice(0, -brand.length);
      if (/^\d+$/.test(rest) || RISK_WORDS.some((w) => rest.includes(w)) ||
          /(recovery|login|clone|support|help|verify|secure|account|id|info|followers|app|admin|web)/.test(rest)) {
        return brand;
      }
    }
  }
  return null;
}

// roblox.ss, www.roblox.com.bo: a single-site brand as the whole name on
// another ending. Returns the brand's display name.
function findBrandOnOtherEnding(host) {
  const labels = host.replace(/^www\./, "").split(".");
  const info = GLOBAL_BRANDS[labels[0]];
  if (!info || !info.single || labels.length < 2 || labels.length > 3) return null;
  const host2 = labels.join(".");
  if (info.sites.includes(host2)) return null;
  // Only "brand.tld" or "brand.com.cc" / "brand.co.cc".
  if (labels.length === 3 && !/^(com|co|net|org)$/.test(labels[1])) return null;
  return info.name;
}

// Name tokens of the host, without the ending (com, co.uk…).
function hostTokens(host) {
  const labels = host.split(".");
  return labels.slice(0, -1).join(".").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function findGlobalBrandTypo(host) {
  for (const token of hostTokens(host)) {
    // rn -> m, 0 -> o, Cyrillic а -> a: instagrarn, paypa1.
    const visual = foldConfusables(normalizeLookalikes(token));
    if (visual !== token && Object.prototype.hasOwnProperty.call(GLOBAL_BRANDS, visual)) {
      return GLOBAL_BRANDS[visual].name;
    }
    for (const [brand, info] of Object.entries(GLOBAL_BRANDS)) {
      // Long brands only: short ones are one letter away from real words.
      if (brand.length < 7 || token === brand || token[0] !== brand[0]) continue;
      // Another brand (mercadolibre vs mercadolivre) or the brand's own site.
      if (Object.prototype.hasOwnProperty.call(GLOBAL_BRANDS, token)) continue;
      if (info.sites.some((s) => host === s || host.endsWith(`.${s}`))) continue;
      if (Math.abs(token.length - brand.length) > 1) continue;
      if (levenshtein(token, brand) === 1) return info.name;
    }
  }
  return null;
}

// Customer portals legitimately named after a brand on these platforms.
const SAAS_TENANT_HOSTS = [
  "sharepoint.com", "zendesk.com", "service-now.com", "salesforce.com", "force.com",
  "okta.com", "atlassian.net", "myshopify.com", "freshdesk.com", "hubspot.com",
  "workday.com", "box.com", "slack.com", "webex.com", "zoom.us", "cloudfront.net",
  "amazonaws.com", "azurewebsites.net", "akamaihd.net", "edgekey.net"
];

function findGlobalBrandSubdomain(host, domain) {
  if (domain.isIp || domain.subdomainCount < 1) return null;
  const registrable = host.split(".").slice(-(domain.tld.includes(".") ? 3 : 2)).join(".");
  if (SAAS_TENANT_HOSTS.some((s) => host === s || host.endsWith(`.${s}`))) return null;
  const labels = host.split(".");
  const subs = labels.slice(0, domain.subdomainCount);
  for (const [i, label] of subs.entries()) {
    const info = GLOBAL_BRANDS[label];
    if (!info) continue;
    // amazon.co.jp, shopee.com.br: the brand's own country site.
    const rest = labels.slice(i + 1);
    if (rest.length === 2 && /^(co|com|net|org|ne|or|ac)$/.test(rest[0]) && rest[1].length === 2) return null;
    // The brand's own subdomain on its own site is fine (www.paypal.com).
    if (info.sites.some((s) => registrable === s || host.endsWith(`.${s}`))) return null;
    if (domain.base === label) return null;
    return info.name;
  }
  return null;
}

// verify -> veriffy / verfy, account -> acount. Only an added or dropped
// letter (not a swapped one: postal is a real word next to portal), and not
// a plain ending (updates, secured).
const MISSPELL_WORDS = ["verify", "account", "secure", "update", "wallet", "delivery", "confirm", "signin", "recovery", "support"];

function findMisspeltRiskWord(host) {
  for (const token of hostTokens(host)) {
    for (const word of MISSPELL_WORDS) {
      if (token.includes(word)) continue;
      for (let i = 0; i + word.length - 1 <= token.length; i += 1) {
        for (const len of [word.length - 1, word.length + 1]) {
          const part = token.slice(i, i + len);
          if (part.length !== len || part[0] !== word[0]) continue;
          if (len > word.length && (part.endsWith("s") || part.endsWith("d")) && part.startsWith(word)) continue;
          if (levenshtein(part, word) === 1) return part;
        }
      }
    }
  }
  return null;
}

// facebook.github.io, microsoft.github.io: on code hosts the first label is
// a unique account name, and an account named exactly like the brand is the
// brand's own.
function isOwnCodeHostAccount(host, freeHost) {
  if (!["github.io", "gitlab.io"].includes(freeHost)) return false;
  const account = host.slice(0, -freeHost.length - 1).split(".").pop();
  return Object.prototype.hasOwnProperty.call(GLOBAL_BRANDS, account);
}

// Auto-generated label: a dd-mm-yyyy date, or 4+ hyphen-separated chunks
// mixing letters and digits.
function looksGenerated(sub) {
  if (!sub) return false;
  const label = sub.split(".").pop();
  if (/\d{2}-\d{2}-\d{4}/.test(label)) return true;
  const chunks = label.split("-");
  return chunks.length >= 4 && chunks.filter((c) => /\d/.test(c) && /[a-z]/.test(c)).length >= 2;
}

function isLatinDisguise(label) {
  if (!/[\u0080-\u{10FFFF}]/u.test(label)) return false;
  const latinLetters = /[a-z]/i.test(label);
  const foldsToLatin = /^[a-z0-9-]+$/i.test(foldConfusables(label));
  return latinLetters || foldsToLatin;
}

function foldConfusables(value) {
  return Array.from(value)
    .map((char) => CONFUSABLES[char] || char)
    .join("");
}

function findTyposquat(visualBase, rawBase) {
  let best = null;

  for (const brand of BRANDS) {
    if (visualBase === brand) {
      // Only flag an exact visual match when the original was disguised.
      if (rawBase !== brand) best = { brand, distance: 0 };
      continue;
    }

    // Short brands (du, moi, tamm, eand...) collide with too many real words
    // (band, sand, moz, dw). They are only caught by lookalike disguise above.
    if (brand.length <= 4) continue;

    // Typosquats almost always keep the first letter (salik vs malik).
    if (visualBase[0] !== brand[0]) continue;

    const distance = levenshtein(visualBase, brand);
    const maxDistance = brand.length <= 6 ? 1 : 2;
    if (distance >= 1 && distance <= maxDistance) {
      if (!best || distance < best.distance) best = { brand, distance };
    }
  }

  return best;
}

function containsBrand(text, brand) {
  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);

  // Short brands (du, moi, ica) must be a complete token.
  if (brand.length < 4) return text === brand || tokens.includes(brand);

  return tokens.some((token) => {
    if (token === brand) return true;
    if (brand.length === 4) {
      // 4-letter brands (tamm, dewa, adcb) only when glued to a risk word:
      // tammpay / payadcb yes, stammer / dewalt no.
      const rest = token.startsWith(brand)
        ? token.slice(brand.length)
        : token.endsWith(brand)
          ? token.slice(0, -brand.length)
          : null;
      return rest !== null && RISK_WORDS.some((word) => rest.includes(word));
    }
    // Longer brands are distinctive enough for prefix/suffix or substring.
    if (brand.length >= 7) return token.includes(brand);
    return token.startsWith(brand) || token.endsWith(brand);
  });
}

function findRiskWords(host) {
  const tokens = host.split(/[^a-z0-9]+/).filter(Boolean);
  const matches = new Set();

  for (const token of tokens) {
    for (const word of RISK_WORDS) {
      if (
        token === word ||
        (word.length >= 4 && (token.startsWith(word) || token.endsWith(word))) ||
        (word.length === 3 && token.startsWith(word))
      ) {
        matches.add(token);
        break;
      }
    }
  }

  return Array.from(matches);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    previous = current;
  }

  return previous[b.length];
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function levelForScore(score) {
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function formatDays(value) {
  return String(Math.max(0, Math.floor(value)));
}
