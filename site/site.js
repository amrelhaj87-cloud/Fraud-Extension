/**
 * Yaqiz site: Arabic / English switch and the version in the footer.
 * Each page has one block per language: <div data-l="ar"> and <div data-l="en">.
 * The choice is remembered; first visit follows the browser language.
 * "#en" or "#ar" in the address also picks the language.
 */
(() => {
  "use strict";

  const KEY = "yaqiz-lang";
  const REPO_MANIFEST = "https://raw.githubusercontent.com/amrelhaj87-cloud/FraudShield/main/manifest.json";

  function pick() {
    const hash = location.hash.replace("#", "");
    if (hash === "ar" || hash === "en") return hash;
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "ar" || saved === "en") return saved;
    } catch {
      // Ignore.
    }
    return (navigator.language || "").toLowerCase().startsWith("ar") ? "ar" : "en";
  }

  function apply(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    for (const el of document.querySelectorAll("[data-l]")) el.hidden = el.dataset.l !== lang;
    for (const b of document.querySelectorAll("[data-set-lang]")) {
      b.setAttribute("aria-pressed", String(b.dataset.setLang === lang));
    }
    const title = document.querySelector(`meta[name="title-${lang}"]`);
    if (title) document.title = title.content;
  }

  let lang = pick();
  apply(lang);

  for (const b of document.querySelectorAll("[data-set-lang]")) {
    b.addEventListener("click", () => {
      lang = b.dataset.setLang;
      try {
        localStorage.setItem(KEY, lang);
      } catch {
        // Ignore.
      }
      apply(lang);
    });
  }

  // Current version straight from the repo, so the site never shows an old number.
  fetch(REPO_MANIFEST, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      if (!m || !m.version) return;
      for (const el of document.querySelectorAll("[data-version]")) el.textContent = `v${m.version}`;
    })
    .catch(() => {});
})();
