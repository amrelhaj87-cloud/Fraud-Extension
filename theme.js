/**
 * FraudShield — theme for the extension's own pages (popup, report, review,
 * warning). Choice: "system" (default), "dark" or "light".
 *
 * Load it in <head> before the stylesheet's colours matter: it sets
 * <html data-theme="dark|light"> right away from a local copy, then from
 * chrome.storage, and follows the system setting while "system" is chosen.
 * Exposes FE_THEME.get() / FE_THEME.set(choice).
 */
(() => {
  "use strict";

  const KEY = "fs:theme";
  const CHOICES = ["system", "dark", "light"];
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let choice = "system";

  function read(value) {
    return CHOICES.includes(value) ? value : "system";
  }

  function apply() {
    const dark = choice === "dark" || (choice === "system" && media && media.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }

  // Fast path: extension pages share one origin, so localStorage avoids a flash.
  try {
    choice = read(localStorage.getItem(KEY));
  } catch {
    choice = "system";
  }
  apply();

  try {
    chrome.storage.local.get(KEY, (data) => {
      const stored = read(data && data[KEY]);
      if (stored !== choice) {
        choice = stored;
        apply();
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[KEY]) {
        choice = read(changes[KEY].newValue);
        apply();
      }
    });
  } catch {
    // Not running as an extension page.
  }

  if (media && media.addEventListener) media.addEventListener("change", apply);

  globalThis.FE_THEME = {
    get: () => choice,
    set(next) {
      choice = read(next);
      apply();
      try {
        localStorage.setItem(KEY, choice);
      } catch {
        // Ignore.
      }
      try {
        chrome.storage.local.set({ [KEY]: choice });
      } catch {
        // Ignore.
      }
    }
  };
})();
