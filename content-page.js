/**
 * Fraud Extension — page scanner (runs on every top-level page).
 * Looks at what the page *asks for*, not just its link:
 *   - phoneCapture: a phone field with "verify / not a robot / prize / OTP" bait
 *   - cardForm:     bank-card fields
 *   - clickFix:     "Win+R → cmd → Ctrl+V" instructions (ClickFix malware)
 * Sends the signals to the background, which combines them with the domain
 * score, colors the toolbar icon, and blocks the page if it becomes high risk.
 * Reads the page only; never changes it.
 */
(() => {
  "use strict";

  if (window.top !== window || window.__fraudExtensionPageLoaded) return;
  window.__fraudExtensionPageLoaded = true;

  const WATCH_MS = 20000; // scam popups often appear a few seconds after load
  const DEBOUNCE_MS = 700;
  const MAX_TEXT = 20000;

  const PHONE_INPUT =
    'input[type="tel"], input[autocomplete="tel"], input[inputmode="tel"], ' +
    'input[name*="phone" i], input[name*="mobile" i], input[name*="msisdn" i], ' +
    'input[id*="phone" i], input[id*="msisdn" i], input[placeholder*="phone" i], ' +
    'input[placeholder*="mobile" i], input[placeholder*="جوال"], input[placeholder*="هاتف"], ' +
    'input[placeholder*="موبايل"]';

  const CARD_INPUT =
    'input[autocomplete^="cc-"], input[name*="cardnumber" i], input[name*="card_number" i], ' +
    'input[name*="cvv" i], input[name*="cvc" i], input[id*="cardnumber" i], input[id*="cvv" i], ' +
    'input[placeholder*="card number" i], input[placeholder*="cvv" i], input[placeholder*="رقم البطاقة"]';

  const BAIT =
    /not a robot|are not a robot|confirm (that )?you|verify (that )?you|human verification|subscribe|congratulation|you('ve| have)? won|winner|prize|reward|free (gift|access|trial)|otp|pin code|activation code|لست روبوت|لست روبوتًا|ليس روبوت|تأكيد|تحقق|اشتراك|تهانينا|مبروك|فزت|جائزة|هدية|مجان|رمز التحقق/i;
  const UAE_PREFIX = /(\+|00)\s?971|\b971\s?5\d/;

  const CTRL_V = /ctrl\s*\+\s*v|⌘\s*\+?\s*v|cmd\s*\+\s*v/i;
  const WIN_R = /win(dows)?(\s*key)?\s*\+\s*r\b|⊞\s*\+?\s*r\b/i;
  const RUN_CMD = /\bcmd\b|powershell|run dialog|mshta|terminal|نافذة التشغيل|موجه الأوامر/i;

  const FAKE_CHECK = /verif|not a robot|human|captcha|cloudflare|تحقق|لست روبوت/i;

  let timer = null;
  let lastSent = "";
  const started = Date.now();

  function scan() {
    const text = (document.body ? document.body.innerText || "" : "").slice(0, MAX_TEXT);
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

    const phoneInputs = [...document.querySelectorAll(PHONE_INPUT)].filter(visible);
    const phoneCapture =
      phoneInputs.length > 0 && (BAIT.test(text) || UAE_PREFIX.test(text) ||
        phoneInputs.some((i) => UAE_PREFIX.test(i.value || i.placeholder || "")));

    const cardForm = [...document.querySelectorAll(CARD_INPUT)].some(visible);

    // Instructions + a fake "verification" (tutorial pages don't claim to verify you).
    const clickFix =
      FAKE_CHECK.test(text) &&
      ((CTRL_V.test(text) && RUN_CMD.test(text)) ||
        (WIN_R.test(text) && (CTRL_V.test(text) || RUN_CMD.test(text))));

    return { phoneCapture, cardForm, clickFix };
  }

  function report() {
    try {
      const signals = scan();
      const key = JSON.stringify(signals);
      // Always send once (the background also uses it to refresh the icon).
      if (key === lastSent) return;
      lastSent = key;
      chrome.runtime.sendMessage({ type: "PAGE_SIGNALS", url: location.href, signals }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // Extension reloaded or page unloading; ignore.
    }
  }

  function schedule() {
    if (Date.now() - started > WATCH_MS) return;
    clearTimeout(timer);
    timer = setTimeout(report, DEBOUNCE_MS);
  }

  try {
    report();
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      report();
    }, WATCH_MS);
  } catch {
    // Never break the page.
  }
})();
