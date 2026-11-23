/**
 * Fraud Extension — page scanner (runs on every top-level page).
 * Looks at what the page *asks for*, not just its link:
 *   - phoneCapture: a phone field with "verify / not a robot / prize / OTP" bait
 *   - cardForm:     bank-card fields
 *   - clickFix:     "Win+R → cmd → Ctrl+V" instructions (ClickFix malware)
 * Sends the signals to the background, which combines them with the domain
 * score, colors the toolbar icon, and blocks the page if it becomes high risk.
 *   - behaviors from page-hooks.js: clipboard commands, scareware
 *     (fullscreen + locks), traps, notification requests, popup spam
 * Also tells the background when the user clicks or types, so the download
 * guard can tell a requested download from an automatic one.
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

    // Behaviors reported by page-hooks.js (MAIN world).
    const now = Date.now();
    const recentCount = (list, ms) => list.filter((t) => now - t < ms).length;
    const hasVideo = [...document.querySelectorAll("video")].some((v) => v.offsetWidth > 200);
    const alertLoop = recentCount(behavior.dialogs, 15000) >= 3;
    const historyFlood = recentCount(behavior.pushes, 3000) >= 10;
    const lock = behavior.keyboardLock || behavior.pointerLock;

    // Tech-support scareware: fullscreen + (locked input or dialog loop), not a video player.
    const scareware = behavior.fullscreen && (lock || alertLoop) && !hasVideo;
    // Trapping the user: any two of dialog loop / leave-page prompt / Back-button flooding.
    const trap = [alertLoop, behavior.beforeUnload, historyFlood].filter(Boolean).length >= 2;
    const popupSpam = behavior.silentPopups >= 2;

    return {
      phoneCapture,
      cardForm,
      clickFix,
      clipboardCommand: behavior.clipboardCommand,
      scareware,
      trap,
      notifications: behavior.notifications,
      popupSpam
    };
  }

  // ---- Behavior events from page-hooks.js --------------------------------
  const behavior = {
    fullscreen: false,
    keyboardLock: false,
    pointerLock: false,
    beforeUnload: false,
    notifications: false,
    clipboardCommand: false,
    dialogs: [],
    pushes: [],
    silentPopups: 0
  };
  const seenIds = new Set();
  const CRITICAL = new Set(["clipboardCommand", "fullscreen", "keyboardLock", "pointerLock", "dialog"]);

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== "fraud-extension-hooks") return;
    // An event can arrive twice (queued original + replay); count it once.
    if (seenIds.has(data.id)) return;
    seenIds.add(data.id);
    switch (data.name) {
      case "dialog":
        behavior.dialogs.push(Date.now());
        break;
      case "pushState":
        behavior.pushes.push(Date.now());
        break;
      case "popup":
        if (!(data.detail && data.detail.userActive)) behavior.silentPopups += 1;
        break;
      default:
        if (data.name in behavior) behavior[data.name] = true;
    }
    // Dangerous behavior is reported at once; the rest is debounced.
    if (CRITICAL.has(data.name)) report();
    else scheduleAlways();
  });

  // ---- User activity: tells the download guard a click came first ----------
  let lastActivitySent = 0;
  const onActivity = () => {
    const now = Date.now();
    if (now - lastActivitySent < 1000) return;
    lastActivitySent = now;
    try {
      chrome.runtime.sendMessage({ type: "USER_ACTIVITY", url: location.href }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // Ignore.
    }
  };
  // Ask page-hooks.js to replay anything that happened before this script loaded.
  window.postMessage({ source: "fraud-extension-page", name: "ready" }, "*");

  window.addEventListener("pointerdown", onActivity, true);
  window.addEventListener("keydown", onActivity, true);

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
    scheduleAlways();
  }

  function scheduleAlways() {
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
