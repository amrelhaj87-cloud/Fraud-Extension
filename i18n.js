/**
 * Fraud Extension — shared Arabic / English strings.
 * Plain script (no import/export) so it works everywhere:
 *   - content scripts (listed before them in manifest.json)
 *   - popup.html / warning.html (<script src="i18n.js">)
 *   - background + scoring.js (`import "./i18n.js"` as a side-effect module)
 *   - Node tests
 * Exposes globalThis.FE_I18N.
 */
(function (root) {
  "use strict";

  const DEFAULT_LANG = "ar";

  // UAE sectors: shown next to an impersonated brand so the reason explains
  // *what kind* of entity is being faked (digital ID, local bank, telecom...).
  const SECTORS = {
    identity: { ar: "الهوية الرقمية", en: "digital identity" },
    bank: { ar: "بنك محلي", en: "UAE bank" },
    telecom: { ar: "اتصالات", en: "telecom" },
    gov: { ar: "خدمة حكومية", en: "government service" },
    police: { ar: "جهة أمنية", en: "law enforcement" },
    courier: { ar: "بريد وشحن", en: "post & courier" },
    utility: { ar: "خدمات المرافق", en: "utilities" },
    transport: { ar: "طرق ومواصلات", en: "roads & transport" },
    airline: { ar: "طيران", en: "airline" }
  };

  // Brand token (as in scoring.js BRANDS) -> display name + sector.
  const BRANDS = {
    adpolice: { ar: "شرطة أبوظبي", en: "Abu Dhabi Police", sector: "police" },
    dubaipolice: { ar: "شرطة دبي", en: "Dubai Police", sector: "police" },
    moi: { ar: "وزارة الداخلية", en: "Ministry of Interior", sector: "police" },
    tamm: { ar: "منصة تم", en: "TAMM", sector: "gov" },
    uaepass: { ar: "UAE PASS", en: "UAE PASS", sector: "identity" },
    ica: { ar: "الهيئة الاتحادية للهوية (ICP)", en: "ICP", sector: "identity" },
    icp: { ar: "الهيئة الاتحادية للهوية (ICP)", en: "ICP", sector: "identity" },
    emiratesid: { ar: "الهوية الإماراتية", en: "Emirates ID", sector: "identity" },
    emiratespost: { ar: "بريد الإمارات", en: "Emirates Post", sector: "courier" },
    aramex: { ar: "أرامكس", en: "Aramex", sector: "courier" },
    adcb: { ar: "بنك أبوظبي التجاري", en: "ADCB", sector: "bank" },
    enbd: { ar: "بنك الإمارات دبي الوطني", en: "Emirates NBD", sector: "bank" },
    emiratesnbd: { ar: "بنك الإمارات دبي الوطني", en: "Emirates NBD", sector: "bank" },
    mashreq: { ar: "بنك المشرق", en: "Mashreq", sector: "bank" },
    rakbank: { ar: "بنك رأس الخيمة الوطني", en: "RAKBANK", sector: "bank" },
    bankfab: { ar: "بنك أبوظبي الأول", en: "First Abu Dhabi Bank", sector: "bank" },
    fab: { ar: "بنك أبوظبي الأول", en: "First Abu Dhabi Bank", sector: "bank" },
    adib: { ar: "مصرف أبوظبي الإسلامي", en: "ADIB", sector: "bank" },
    emiratesislamic: { ar: "الإمارات الإسلامي", en: "Emirates Islamic", sector: "bank" },
    etisalat: { ar: "اتصالات (e&)", en: "e& (Etisalat)", sector: "telecom" },
    eand: { ar: "اتصالات (e&)", en: "e& (Etisalat)", sector: "telecom" },
    du: { ar: "دو", en: "du", sector: "telecom" },
    dewa: { ar: "هيئة كهرباء ومياه دبي", en: "DEWA", sector: "utility" },
    salik: { ar: "سالك", en: "Salik", sector: "transport" },
    etihad: { ar: "الاتحاد للطيران", en: "Etihad Airways", sector: "airline" }
  };

  const STRINGS = {
    ar: {
      // ---- Scoring reasons ----
      unreadable: "تعذر قراءة اسم النطاق",
      official: "دومين رسمي موثّق",
      homograph: "اسم النطاق يستخدم حروفًا غير لاتينية (احتمال تصيّد بصري)",
      punycodeBad: "اسم النطاق يستخدم ترميز Punycode مشبوهًا",
      typo: (p) => `تشابه كبير مع اسم ${p.brand}${p.misspell ? " — خطأ إملائي متعمّد محتمل" : ""}`,
      contains: (p) => `ينتحل اسم ${p.brand} دون أن يكون موقعها الرسمي`,
      mimic: (p) => `النطاق الفرعي يقلّد دومينًا رسميًا (${p.official}) لكن الموقع الحقيقي هو ${p.real}`,
      domainLike: "النطاق الفرعي مصمَّم ليبدو كدومين كامل (مثل .com. في منتصف الرابط)",
      riskWords: (p) => `كلمة خطرة في النطاق: ${p.words.join("، ")}`,
      brandRisk: "اسم جهة موثوقة مقترن بكلمة خطرة (نمط تصيّد شائع)",
      tld: (p) => `امتداد النطاق غير موثوق أو كثير الاستخدام في الحملات الاحتيالية (.${p.tld})`,
      freeHost: (p) => `استضافة مجانية أو منشئ مواقع (${p.host}) مع اسم جهة موثوقة`,
      manySubs: "عدد كبير من النطاقات الفرعية (أكثر من 3)",
      manyHyphens: "عدد كبير من الشُرط في اسم النطاق (أكثر من 2)",
      ip: "الرابط يستخدم عنوان IP بدلًا من اسم نطاق",
      long: "اسم النطاق طويل بشكل غير معتاد (أكثر من 30 حرفًا)",
      http: "الرابط يستخدم HTTP غير المشفّر",
      ageUnknown: "عمر الدومين غير معروف",
      age30: (p) => `عمر الدومين أقل من 30 يومًا (${p.days} يوم)`,
      age180: (p) => `عمر الدومين أقل من 180 يومًا (${p.days} يوم)`,
      analyzeFailed: "تعذر تحليل الرابط",
      sponsored: "نتيجة إعلانية مدفوعة (زيادة 15 نقطة)",
      mapsFree: (p) => `موقع مجاني (${p.host}) لجهة تبدو بنكًا أو جهة رسمية — البنوك والجهات الحكومية لا تستخدم روابط مجانية`,
      mapsBrand: (p) => `اسم المكان يدّعي أنه جهة معروفة لكن الموقع المرتبط ليس موقعها الرسمي (${p.domain})`,
      mapsPhone: (p) => `رقم الهاتف رقم جوال شخصي (${p.phone}) لجهة تبدو رسمية`,
      mapsNoSite: "لا يوجد موقع إلكتروني مرتبط بهذا المكان",

      // ---- Levels ----
      level_safe: "آمن",
      level_low: "منخفض الخطورة",
      level_medium: "متوسط الخطورة",
      level_high: "خطر مرتفع",
      level_loading: "جارٍ الفحص",
      level_error: "تعذر الفحص",
      level_result: "نتيجة",
      popupSafe: "آمن — موقع رسمي",

      // ---- Search badges / hover card ----
      checking: "جارٍ الفحص…",
      checkingAria: "جارٍ فحص الرابط",
      errConnect: "تعذر الاتصال بخدمة الفحص المحلية.",
      errNoResult: "لم تصل نتيجة لهذا الرابط.",
      errRender: "تعذر عرض نتيجة الفحص.",
      errGeneric: "تعذر إكمال الفحص.",
      errShort: "تعذر",
      errAria: (p) => `تعذر فحص الرابط. ${p.reason}`,
      adTag: "إعلان",
      sponsoredLabel: "نتيجة إعلانية مدفوعة",
      unknownLink: "رابط غير معروف",
      cardLoading: "يتم تحليل الدومين والتحقق من عمر التسجيل…",
      noSignals: "لا توجد مؤشرات خطر معروفة.",
      ageDays: (p) => `عمر الدومين: ${p.days} يومًا`,
      ageUnknownLine: "عمر الدومين: غير معروف",
      brandSearch: "Fraud Extension — فحص محلي",
      ariaResult: (p) => `${p.level}، ${p.score} من 100. ${p.reasons.join("، ")}`,

      // ---- Maps banner ----
      mapsSafe: "✅ موقع رسمي موثّق",
      mapsLow: "🟢 لا توجد مؤشرات خطر واضحة",
      mapsMedium: "🟡 تحذير: مؤشرات مشبوهة",
      mapsHigh: "🔴 خطر: احتمال احتيال مرتفع",
      close: "إغلاق",
      mapsPlace: "مكان على الخريطة",
      mapsNoSiteShort: "بدون موقع إلكتروني",
      brandMaps: "Fraud Extension — فحص الخرائط",

      // ---- Popup ----
      tagline: "نحمي نتائج البحث قبل ما تضغط",
      current: "الصفحة الحالية",
      blockToggle: "حظر المواقع عالية الخطورة تلقائيًا قبل فتحها",
      checkLabel: "افحص رابط",
      checkPlaceholder: "example.com أو https://…",
      checkBtn: "افحص",
      pageResults: "نتائج هذه الصفحة",
      emptyResults: "افتح صفحة بحث Google لرؤية نتائج الفحص هنا.",
      footer: "فحص محلي بالكامل — لا تُرسل بياناتك لأي خادم خارجي سوى استعلام عمر الدومين (RDAP).",
      linkDetails: "تفاصيل الرابط",
      manualResult: "نتيجة الفحص اليدوي",
      cantReadTab: "تعذر قراءة الصفحة الحالية.",
      noCheckNeeded: "هذه الصفحة لا تحتاج إلى فحص.",
      cantCheckPage: "تعذر فحص هذه الصفحة.",
      invalidUrl: "الرابط غير صالح. مثال: adcb.com",
      cantCheckLink: "تعذر فحص الرابط.",
      reloadHint: "أعد تحميل صفحة البحث لتحديث لغة الشارات.",

      // ---- Warning page ----
      wTitle: "تحذير: موقع احتيالي محتمل — Fraud Extension",
      wLead: "منعت Fraud Extension تحميل هذه الصفحة لأنها تبدو موقعًا احتياليًا:",
      wWhy: "لماذا هذا الموقع مشبوه؟",
      wNext: "الخطوات التالية",
      wStep1: "لا تُدخل بيانات بطاقتك البنكية أو كلمات المرور أو رمز التحقق (OTP) أو بيانات UAE PASS في هذا الموقع.",
      wStep2: "غادر الصفحة فورًا.",
      wStep3: "ادخل إلى الجهات الرسمية فقط عبر تطبيقاتها أو مواقعها المحفوظة لديك.",
      wStep4: "إذا أدخلت بياناتك، تواصل مع بنكك فورًا وأبلغ شرطة أبوظبي عبر خدمة «أمان» 8002626.",
      wAlways: "لا تحذّرني مجددًا من هذا الموقع",
      wBack: "العودة بأمان",
      wProceed: "المتابعة رغم الخطر",
      wFoot: "Fraud Extension — فحص محلي لحماية المستخدمين في الإمارات",
      wInvalid: "رابط غير صالح",
      wLoadFail: "تعذر تحميل التفاصيل.",
      wLoading: "جارٍ تحميل التفاصيل…"
    },

    en: {
      unreadable: "Could not read the domain name",
      official: "Verified official domain",
      homograph: "Domain uses non-Latin look-alike characters (possible homograph attack)",
      punycodeBad: "Domain uses suspicious Punycode encoding",
      typo: (p) => `Looks very similar to ${p.brand}${p.misspell ? " — likely a deliberate misspelling" : ""}`,
      contains: (p) => `Impersonates ${p.brand} but is not its official site`,
      mimic: (p) => `Subdomain imitates an official domain (${p.official}) but the real site is ${p.real}`,
      domainLike: "Subdomain is shaped to look like a full domain (e.g. .com. in the middle)",
      riskWords: (p) => `Risky word in the domain: ${p.words.join(", ")}`,
      brandRisk: "Trusted name combined with a risky word (common phishing pattern)",
      tld: (p) => `Untrusted extension often used in scam campaigns (.${p.tld})`,
      freeHost: (p) => `Free hosting / site builder (${p.host}) using a trusted name`,
      manySubs: "Too many subdomains (more than 3)",
      manyHyphens: "Too many hyphens in the domain (more than 2)",
      ip: "Link uses an IP address instead of a domain name",
      long: "Unusually long domain name (over 30 characters)",
      http: "Link uses unencrypted HTTP",
      ageUnknown: "Domain age unknown",
      age30: (p) => `Domain is less than 30 days old (${p.days} days)`,
      age180: (p) => `Domain is less than 180 days old (${p.days} days)`,
      analyzeFailed: "Could not analyze this link",
      sponsored: "Paid ad result (+15 points)",
      mapsFree: (p) => `Free link (${p.host}) for what looks like a bank or government body — they never use free links`,
      mapsBrand: (p) => `Place claims to be a known entity but links to a site that is not its official one (${p.domain})`,
      mapsPhone: (p) => `Phone is a personal mobile number (${p.phone}) for what looks like an official body`,
      mapsNoSite: "No website linked to this place",

      level_safe: "Safe",
      level_low: "Low risk",
      level_medium: "Medium risk",
      level_high: "High risk",
      level_loading: "Checking",
      level_error: "Check failed",
      level_result: "Result",
      popupSafe: "Safe — official site",

      checking: "Checking…",
      checkingAria: "Checking link",
      errConnect: "Could not reach the local checking service.",
      errNoResult: "No result came back for this link.",
      errRender: "Could not display the result.",
      errGeneric: "Could not complete the check.",
      errShort: "Failed",
      errAria: (p) => `Could not check this link. ${p.reason}`,
      adTag: "Ad",
      sponsoredLabel: "Paid ad result",
      unknownLink: "Unknown link",
      cardLoading: "Analyzing the domain and its registration age…",
      noSignals: "No known risk signals.",
      ageDays: (p) => `Domain age: ${p.days} days`,
      ageUnknownLine: "Domain age: unknown",
      brandSearch: "Fraud Extension — local check",
      ariaResult: (p) => `${p.level}, ${p.score} of 100. ${p.reasons.join(", ")}`,

      mapsSafe: "✅ Verified official website",
      mapsLow: "🟢 No clear risk signals",
      mapsMedium: "🟡 Warning: suspicious signals",
      mapsHigh: "🔴 Danger: likely fraud",
      close: "Close",
      mapsPlace: "Place on the map",
      mapsNoSiteShort: "No website",
      brandMaps: "Fraud Extension — Maps check",

      tagline: "Protecting search results before you click",
      current: "Current page",
      blockToggle: "Automatically block high-risk sites before they open",
      checkLabel: "Check a link",
      checkPlaceholder: "example.com or https://…",
      checkBtn: "Check",
      pageResults: "Results on this page",
      emptyResults: "Open a Google search page to see results here.",
      footer: "Runs fully locally — nothing is sent to any server except the domain-age lookup (RDAP).",
      linkDetails: "Link details",
      manualResult: "Manual check result",
      cantReadTab: "Could not read the current page.",
      noCheckNeeded: "This page doesn't need checking.",
      cantCheckPage: "Could not check this page.",
      invalidUrl: "Invalid link. Example: adcb.com",
      cantCheckLink: "Could not check the link.",
      reloadHint: "Reload the search page to update the badge language.",

      wTitle: "Warning: likely scam site — Fraud Extension",
      wLead: "Fraud Extension blocked this page because it looks like a scam site:",
      wWhy: "Why is this site suspicious?",
      wNext: "Next steps",
      wStep1: "Do not enter card details, passwords, one-time codes (OTP) or UAE PASS details on this site.",
      wStep2: "Leave the page now.",
      wStep3: "Reach official entities only through their apps or your saved bookmarks.",
      wStep4: "If you already entered details, call your bank immediately and report it to Abu Dhabi Police via the Aman service, 8002626.",
      wAlways: "Don't warn me again about this site",
      wBack: "Go back safely",
      wProceed: "Proceed anyway",
      wFoot: "Fraud Extension — local protection for users in the UAE",
      wInvalid: "Invalid link",
      wLoadFail: "Could not load the details.",
      wLoading: "Loading details…"
    }
  };

  function resolve(lang) {
    return lang === "en" || lang === "ar" ? lang : DEFAULT_LANG;
  }

  function t(key, lang, params) {
    const table = STRINGS[resolve(lang)];
    const value = key in table ? table[key] : STRINGS[DEFAULT_LANG][key];
    if (typeof value === "function") return value(params || {});
    return value === undefined ? key : value;
  }

  function brandLabel(brand, lang) {
    const info = BRANDS[brand];
    const l = resolve(lang);
    if (!info) return brand;
    const sector = SECTORS[info.sector];
    return `${info[l]} (${sector ? sector[l] : ""})`;
  }

  // Reason text is localized, so recognise special reasons in any language.
  function isReason(reason, key) {
    return reason === STRINGS.ar[key] || reason === STRINGS.en[key];
  }

  function dir(lang) {
    return resolve(lang) === "ar" ? "rtl" : "ltr";
  }

  // Fill [data-i18n] / [data-i18n-placeholder] and set page language/direction.
  function applyDom(doc, lang) {
    const l = resolve(lang);
    doc.documentElement.lang = l;
    doc.documentElement.dir = dir(l);
    for (const el of doc.querySelectorAll("[data-i18n]")) {
      el.textContent = t(el.getAttribute("data-i18n"), l);
    }
    for (const el of doc.querySelectorAll("[data-i18n-placeholder]")) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder"), l));
    }
  }

  // Read the saved language (content scripts, popup, warning page).
  function loadLang() {
    return new Promise((resolveLang) => {
      try {
        chrome.storage.local.get("fe:settings", (data) => {
          const settings = (data && data["fe:settings"]) || {};
          resolveLang(resolve(settings.lang));
        });
      } catch {
        resolveLang(DEFAULT_LANG);
      }
    });
  }

  root.FE_I18N = { DEFAULT_LANG, BRANDS, SECTORS, t, brandLabel, isReason, dir, resolve, applyDom, loadLang };
})(globalThis);
