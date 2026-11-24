/**
 * FraudShield — Google Maps content script.
 * Reads the open place panel (name, category, website, phone), scores the
 * website via the background worker, adds Maps-specific rules, and shows a
 * floating Arabic banner. Fails silently if Google changes its DOM.
 */

(() => {
  "use strict";

  if (window.__fraudExtensionMapsLoaded) return;
  window.__fraudExtensionMapsLoaded = true;

  const DEBOUNCE_MS = 600;
  const BANNER_ID = "fe-maps-banner";

  const FREE_HOSTING = [
    "linktr.ee", "blogspot.com", "sites.google.com", "wixsite.com", "weebly.com",
    "github.io", "netlify.app", "vercel.app", "pages.dev", "business.site",
    "wa.me", "t.me", "bit.ly"
  ];

  // Categories where a free site or a personal mobile number is a red flag.
  const SENSITIVE_WORDS = [
    "bank", "بنك", "مصرف", "exchange", "صراف", "صرافة", "money transfer", "تحويل",
    "police", "شرطة", "government", "حكوم", "ministry", "وزارة", "authority", "هيئة",
    "post", "بريد", "courier", "شحن", "aramex", "insurance", "تأمين", "finance", "تمويل",
    "customer service", "خدمة العملاء", "service center", "مركز خدمة", "atm", "صراف آلي"
  ];

  // Place-name keyword -> official website domains for that brand.
  const BRAND_SITES = [
    { words: ["adcb", "أبوظبي التجاري", "abu dhabi commercial"], domains: ["adcb.com"] },
    { words: ["emirates nbd", "enbd", "الإمارات دبي الوطني"], domains: ["emiratesnbd.com", "enbd.com"] },
    { words: ["first abu dhabi", "fab bank", "أبوظبي الأول"], domains: ["bankfab.com", "fab.ae"] },
    { words: ["mashreq", "المشرق"], domains: ["mashreqbank.com", "mashreq.com"] },
    { words: ["rakbank", "رأس الخيمة الوطني"], domains: ["rakbank.ae"] },
    { words: ["dubai islamic", "دبي الإسلامي"], domains: ["dib.ae"] },
    { words: ["abu dhabi police", "شرطة أبوظبي"], domains: ["adpolice.gov.ae"] },
    { words: ["dubai police", "شرطة دبي"], domains: ["dubaipolice.gov.ae"] },
    { words: ["emirates post", "بريد الإمارات"], domains: ["emiratespost.ae"] },
    { words: ["aramex", "أرامكس"], domains: ["aramex.com"] },
    { words: ["etisalat", "اتصالات", "e&"], domains: ["etisalat.ae", "eand.com"] },
    { words: ["dewa", "هيئة كهرباء ومياه دبي"], domains: ["dewa.gov.ae"] },
    { words: ["tamm", "تم"], domains: ["tamm.abudhabi"] }
  ];

  const I18N = globalThis.FE_I18N;
  let LANG = I18N.DEFAULT_LANG;
  const T = (key, params) => I18N.t(key, LANG, params);

  let timer = null;
  let lastKey = "";
  let running = false;

  // -------------------------------------------------------------------------
  // Panel extraction
  // -------------------------------------------------------------------------

  function readPlace() {
    const nameEl =
      document.querySelector('[role="main"] h1') || document.querySelector("h1");
    const name = nameEl ? nameEl.textContent.trim() : "";

    const categoryEl =
      document.querySelector('button[jsaction*="category"]') ||
      document.querySelector("[data-fe-category]");
    const category = categoryEl ? categoryEl.textContent.trim() : "";

    let website = null;
    const authority = document.querySelector('a[data-item-id="authority"]');
    if (authority && authority.href) website = unwrap(authority.href);

    if (!website) {
      const scope = document.querySelector('[role="main"]') || document.body;
      for (const a of scope.querySelectorAll("a[href^='http']")) {
        const url = unwrap(a.href);
        if (url && !isGoogle(url.hostname)) {
          website = url;
          break;
        }
      }
    }

    let phone = "";
    const phoneEl = document.querySelector('[data-item-id^="phone"]');
    if (phoneEl) {
      const raw =
        phoneEl.getAttribute("data-item-id") ||
        phoneEl.getAttribute("aria-label") ||
        phoneEl.textContent ||
        "";
      phone = raw.replace(/^phone:tel:/, "").replace(/[^\d+]/g, "");
    }

    return { name, category, website, phone };
  }

  function unwrap(href) {
    try {
      let url = new URL(href, location.href);
      if (isGoogle(url.hostname) && url.pathname === "/url") {
        const q = url.searchParams.get("q") || url.searchParams.get("url");
        if (q) url = new URL(q);
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url;
    } catch {
      return null;
    }
  }

  function isGoogle(host) {
    const labels = String(host).toLowerCase().split(".");
    const i = labels.indexOf("google");
    return (i !== -1 && i < labels.length - 1) || host.endsWith("gstatic.com");
  }

  function hostMatches(host, domain) {
    const h = host.replace(/^www\./, "");
    return h === domain || h.endsWith(`.${domain}`);
  }

  // -------------------------------------------------------------------------
  // Maps-specific rules on top of the domain score
  // -------------------------------------------------------------------------

  function applyMapsRules(place, base) {
    const text = `${place.name} ${place.category}`.toLowerCase();
    const sensitive = SENSITIVE_WORDS.some((w) => text.includes(w));
    let score = base ? base.score : 0;
    let level = base ? base.level : "low";
    const reasons = base ? base.reasons.filter((r) => !I18N.isReason(r, "ageUnknown")) : [];
    const add = (points, reason) => {
      score = Math.min(100, score + points);
      reasons.push(reason);
    };

    const host = place.website ? place.website.hostname.toLowerCase() : "";

    if (host) {
      const free = FREE_HOSTING.find((d) => hostMatches(host, d));
      if (free && sensitive) {
        add(60, T("mapsFree", { host: free }));
      }

      // Place claims to be a known brand but links somewhere else.
      const brand = BRAND_SITES.find((b) =>
        b.words.some((w) => w.length > 2 && text.includes(w.toLowerCase()))
      );
      if (brand && !brand.domains.some((d) => hostMatches(host, d))) {
        add(50, T("mapsBrand", { domain: brand.domains[0] }));
      }
    } else if (sensitive) {
      reasons.push(T("mapsNoSite"));
    }

    // UAE mobile numbers: +9715x / 05x. Official bodies use landlines / 800 numbers.
    if (place.phone && sensitive && /^(\+?971|00971|0)5\d{7,8}$/.test(place.phone)) {
      add(25, T("mapsPhone", { phone: place.phone }));
    }

    if (score !== (base ? base.score : 0) || !base) {
      level = score >= 60 ? "high" : score >= 30 ? "medium" : base && base.level === "safe" ? "safe" : "low";
    }
    return { score, level, reasons, hostname: host };
  }

  // -------------------------------------------------------------------------
  // Banner
  // -------------------------------------------------------------------------

  function showBanner(place, result) {
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = BANNER_ID;
      banner.setAttribute("dir", I18N.dir(LANG));
      banner.setAttribute("lang", LANG);
      banner.setAttribute("role", "status");
      document.body.appendChild(banner);
    }

    const titles = {
      safe: T("mapsSafe"),
      low: T("mapsLow"),
      medium: T("mapsMedium"),
      high: T("mapsHigh")
    };

    banner.className = `fe-maps-banner fe-maps-${result.level}`;
    banner.replaceChildren();

    const head = document.createElement("div");
    head.className = "fe-maps-head";
    const title = document.createElement("strong");
    title.textContent = titles[result.level] || titles.low;
    const score = document.createElement("span");
    score.className = "fe-maps-score";
    score.textContent = `${result.score}/100`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "fe-maps-close";
    close.setAttribute("aria-label", T("close"));
    close.textContent = "×";
    close.addEventListener("click", () => banner.remove());
    head.append(title, score, close);

    const place_ = document.createElement("div");
    place_.className = "fe-maps-place";
    place_.textContent = place.name || T("mapsPlace");

    const site = document.createElement("div");
    site.className = "fe-maps-site";
    site.dir = "ltr";
    site.textContent = result.hostname || T("mapsNoSiteShort");

    banner.append(head, place_, site);

    if (result.reasons.length) {
      const list = document.createElement("ul");
      for (const reason of result.reasons.slice(0, 6)) {
        const li = document.createElement("li");
        li.textContent = reason;
        list.appendChild(li);
      }
      banner.appendChild(list);
    }

    const brand = document.createElement("div");
    brand.className = "fe-maps-brand";
    brand.textContent = T("brandMaps");
    banner.appendChild(brand);
  }

  function hideBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.remove();
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------

  function analyze(url, place) {
    const meta = {
      [url]: {
        title: place.name || "",
        snippet: [place.category, place.phone && `phone: ${place.phone}`, "source: Google Maps"]
          .filter(Boolean)
          .join(" | ")
      }
    };
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "ANALYZE", urls: [url], meta }, (res) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(Array.isArray(res) && res[0] ? res[0] : null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function check() {
    if (running) return schedule();
    running = true;
    try {
      const place = readPlace();
      if (!place.name && !place.website) {
        lastKey = "";
        hideBanner();
        return;
      }

      const key = `${place.name}|${place.website ? place.website.href : ""}|${place.phone}`;
      if (key === lastKey) return;
      lastKey = key;

      const base = place.website ? await analyze(place.website.href, place) : null;
      const result = applyMapsRules(place, base);

      // Stay quiet on ordinary places: only official (✅) or risky results show.
      if (result.level === "low" && result.reasons.length === 0) {
        hideBanner();
        return;
      }
      showBanner(place, result);
    } catch (error) {
      try { console.warn("[FraudShield] Maps check failed:", error); } catch { /* ignore */ }
    } finally {
      running = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void check(), DEBOUNCE_MS);
  }

  try {
    new MutationObserver((mutations) => {
      const banner = document.getElementById(BANNER_ID);
      if (banner && mutations.every((m) => banner.contains(m.target))) return;
      schedule();
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    I18N.loadLang().then((lang) => {
      LANG = lang;
      schedule();
    });
  } catch {
    // Never break Google Maps.
  }
})();
