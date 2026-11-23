/**
 * Fraud Extension — UAE-focused domain risk scorer.
 * Pure ES module: works in Chrome (service worker / content scripts) and Node.
 * No network calls and no browser APIs are used here.
 */

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
  "emirates.com",
  "tdra.gov.ae",
  "adnoc.ae"
];

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
  "etihad"
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
 * @param {{protocol?: string, ageDays?: number|null, path?: string}} opts
 * @returns {{score: number, level: "safe"|"low"|"medium"|"high", reasons: string[]}}
 */
export function analyzeDomain(hostname, opts = {}) {
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
      reasons: ["تعذر قراءة اسم النطاق"]
    };
  }

  // 1) Official domains always win, including any subdomain.
  if (isOfficialHost(host)) {
    return {
      score: 0,
      level: "safe",
      reasons: ["دومين رسمي موثّق"]
    };
  }

  // 2) Decode punycode; non-Latin characters are a homograph signal.
  const decoded = decodePunycodeHostname(host);
  host = decoded.host;

  const hasNonLatin = /[\u0080-\u{10FFFF}]/u.test(host);
  if (hasNonLatin) {
    add(40, "اسم النطاق يستخدم حروفًا غير لاتينية (احتمال تصيّد بصري)");
  } else if (decoded.failed) {
    add(40, "اسم النطاق يستخدم ترميز Punycode مشبوهًا");
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
      `تشابه كبير مع اسم جهة موثوقة (${typo.brand})${typo.distance > 0 ? " — خطأ إملائي محتمل" : ""}`
    );
  }

  const containedBrand = BRANDS.find((brand) => containsBrand(visualHost, brand));
  if (containedBrand) {
    add(45, `اسم النطاق يحتوي على اسم جهة موثوقة (${containedBrand}) دون أن يكون موقعها الرسمي`);
  }

  // 3b) A real domain used as a subdomain of another site:
  //     bankfab.com.wallet-studio.icu, www.adpolice.gov.ae.fines-pay.com
  const mimicked = findMimickedOfficial(host);
  if (mimicked) {
    add(
      50,
      `النطاق الفرعي يقلّد دومينًا رسميًا (${mimicked}) لكن الموقع الحقيقي هو ${domain.base}.${domain.tld}`
    );
  } else if (!domain.isIp && hasDomainLikeSubdomain(host, domain)) {
    add(30, "النطاق الفرعي مصمَّم ليبدو كدومين كامل (مثل .com. في منتصف الرابط)");
  }

  const brandSignal = Boolean(typo || containedBrand || mimicked);

  // 4) Risk words, with an extra penalty when a brand is also present.
  const riskMatches = findRiskWords(host);
  if (riskMatches.length > 0) {
    add(15, `كلمة خطرة في النطاق: ${riskMatches.join("، ")}`);
    if (brandSignal) {
      add(20, "اسم جهة موثوقة مقترن بكلمة خطرة (نمط تصيّد شائع)");
    }
  }

  // 5) Cheap / frequently abused TLD.
  if (domain.tld && SUSPICIOUS_TLDS.includes(domain.tld)) {
    add(20, `امتداد النطاق غير موثوق أو كثير الاستخدام في الحملات الاحتيالية (.${domain.tld})`);
  }

  // 6) Free hosting or site builders pretending to represent a brand.
  const freeHost = FREE_HOSTING.find(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
  if (freeHost) {
    const path = typeof opts.path === "string" ? opts.path : "";
    const freeText = foldConfusables(normalizeLookalikes(`${host} ${path}`));
    if (BRANDS.some((brand) => containsBrand(freeText, brand))) {
      add(40, `استضافة مجانية أو منشئ مواقع (${freeHost}) مع اسم جهة موثوقة`);
    }
  }

  // 7) Structural red flags.
  if (!domain.isIp && domain.subdomainCount > 3) {
    add(10, "عدد كبير من النطاقات الفرعية (أكثر من 3)");
  }
  const hyphenCount = (host.match(/-/g) || []).length;
  if (hyphenCount > 2) {
    add(10, "عدد كبير من الشُرط في اسم النطاق (أكثر من 2)");
  }
  if (domain.isIp) {
    add(10, "الرابط يستخدم عنوان IP بدلًا من اسم نطاق");
  }
  if (host.length > 30) {
    add(10, "اسم النطاق طويل بشكل غير معتاد (أكثر من 30 حرفًا)");
  }

  // 8) Unencrypted HTTP.
  if (String(opts.protocol || "").toLowerCase() === "http:") {
    add(15, "الرابط يستخدم HTTP غير المشفّر");
  }

  // 9) Domain age (RDAP). Unknown age is reported but adds no points.
  if (opts.ageDays === null || opts.ageDays === undefined || opts.ageDays === "") {
    reasons.push("عمر الدومين غير معروف");
  } else {
    const ageDays = Number(opts.ageDays);
    if (!Number.isFinite(ageDays)) {
      reasons.push("عمر الدومين غير معروف");
    } else if (ageDays < 30) {
      add(35, `عمر الدومين أقل من 30 يومًا (${formatDays(ageDays)} يوم)`);
    } else if (ageDays < 180) {
      add(15, `عمر الدومين أقل من 180 يومًا (${formatDays(ageDays)} يوم)`);
    }
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
