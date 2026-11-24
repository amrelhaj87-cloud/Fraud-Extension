/**
 * FraudShield — "official body + personal mobile number" check.
 *
 * Banks, police and government bodies in the UAE publish landlines and
 * 800 / 600 numbers, never a personal mobile (05x / +9715x). A Maps place or a
 * search result that claims to be one of them and gives a mobile number is
 * the classic fake "customer service" scam: the caller is asked for the OTP
 * or card details.
 *
 * Plain script (like i18n.js): loaded by content scripts and imported by the
 * background worker. Exposes globalThis.FE_PHONE.
 */
(function (root) {
  "use strict";

  // Names people see in listings and ads, in English and Arabic.
  // Short or common words (fab, du, e&, tamm/تم) are left out on purpose.
  const BRAND_NAMES = [
    { brand: "adpolice", names: ["abu dhabi police", "شرطة أبوظبي", "شرطة ابوظبي", "شرطة أبو ظبي"] },
    { brand: "dubaipolice", names: ["dubai police", "شرطة دبي"] },
    { brand: "moi", names: ["ministry of interior", "وزارة الداخلية"] },
    { brand: "tamm", names: ["tamm abu dhabi", "tamm service", "منصة تم", "مركز تم"] },
    { brand: "uaepass", names: ["uae pass", "uaepass", "الهوية الرقمية"] },
    { brand: "icp", names: ["federal authority for identity", "icp ", "الهيئة الاتحادية للهوية"] },
    { brand: "emiratesid", names: ["emirates id", "الهوية الإماراتية"] },
    { brand: "emiratespost", names: ["emirates post", "بريد الإمارات", "بريد الامارات"] },
    { brand: "aramex", names: ["aramex", "أرامكس", "ارامكس"] },
    { brand: "adcb", names: ["adcb", "abu dhabi commercial bank", "بنك أبوظبي التجاري", "بنك ابوظبي التجاري"] },
    { brand: "emiratesnbd", names: ["emirates nbd", "enbd", "بنك الإمارات دبي الوطني", "الإمارات دبي الوطني"] },
    { brand: "mashreq", names: ["mashreq", "المشرق"] },
    { brand: "rakbank", names: ["rakbank", "rak bank", "بنك رأس الخيمة"] },
    { brand: "bankfab", names: ["first abu dhabi bank", "fab bank", "بنك أبوظبي الأول", "بنك ابوظبي الاول"] },
    { brand: "adib", names: ["adib", "abu dhabi islamic bank", "مصرف أبوظبي الإسلامي"] },
    { brand: "emiratesislamic", names: ["emirates islamic", "الإمارات الإسلامي"] },
    { brand: "etisalat", names: ["etisalat", "اتصالات الإمارات"] },
    { brand: "dewa", names: ["dewa", "هيئة كهرباء ومياه دبي"] },
    { brand: "salik", names: ["salik", "سالك"] },
    { brand: "etihad", names: ["etihad airways", "الاتحاد للطيران"] }
  ];

  // UAE mobile: +971 5x / 00971 5x / 05x, then 7 digits, spaces or dashes allowed.
  const MOBILE =
    /(?:\+|00)?\s?971[\s-]?\(?0?\)?[\s-]?5\d(?:[\s-]?\d){7}|(?<![\d+])05\d(?:[\s-]?\d){7}(?!\d)/;

  const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

  function toLatinDigits(text) {
    return String(text || "").replace(ARABIC_DIGITS, (d) => {
      const code = d.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    });
  }

  /** First UAE mobile number in the text, digits only (e.g. "+971501234567"), or "". */
  function findMobile(text) {
    const match = toLatinDigits(text).match(MOBILE);
    if (!match) return "";
    const digits = match[0].replace(/[^\d]/g, "").replace(/^00/, "");
    if (digits.startsWith("971")) return `+971${digits.slice(3).replace(/^0/, "")}`;
    return digits;
  }

  /** Brand key whose name appears in the text (e.g. "adpolice"), or "". */
  function claimedBrand(text) {
    const lower = ` ${String(text || "").toLowerCase()} `;
    for (const entry of BRAND_NAMES) {
      if (entry.names.some((name) => lower.includes(name))) return entry.brand;
    }
    return "";
  }

  /** {brand, phone} when the text claims a known body and shows a mobile number. */
  function findBrandMobile(text) {
    const brand = claimedBrand(text);
    if (!brand) return null;
    const phone = findMobile(text);
    return phone ? { brand, phone } : null;
  }

  root.FE_PHONE = { findMobile, claimedBrand, findBrandMobile };
})(typeof globalThis !== "undefined" ? globalThis : self);
