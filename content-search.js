/**
 * FraudShield — Google Search content script.
 * Finds result titles with the generic `a[href] h3` pattern, asks the
 * background worker for a score, and injects Arabic risk badges + hover cards.
 * All failures are swallowed so the Google page is never broken.
 */

(() => {
  "use strict";

  if (window.__fraudExtensionSearchLoaded) return;
  window.__fraudExtensionSearchLoaded = true;

  const DEBOUNCE_MS = 400;
  const CARD_ID = "fe-hover-card";
  const CHECKED_ATTR = "data-fe-checked";
  const SPONSORED_LABELS = ["sponsored", "إعلان", "ممول"].map((label) =>
    label.toLowerCase()
  );

  // UI language (ar/en), loaded from settings before the first scan.
  const I18N = globalThis.FE_I18N;
  let LANG = I18N.DEFAULT_LANG;
  const T = (key, params) => I18N.t(key, LANG, params);
  const levelLabel = (level) => T(`level_${level || "result"}`);

  const LEVEL_EMOJI = {
    safe: "🟢",
    low: "🟢",
    medium: "🟡",
    high: "🔴"
  };

  const state = {
    initialized: false,
    observer: null,
    timer: null,
    running: false,
    rescan: false,
    card: null,
    activeBadge: null
  };

  // Badge element -> target metadata (h3, block, result, sponsored, ...).
  const badgeTargets = new WeakMap();

  // -------------------------------------------------------------------------
  // Boot and scanning
  // -------------------------------------------------------------------------

  function boot() {
    try {
      if (state.initialized) return;

      if (!document.body) {
        setTimeout(boot, 50);
        return;
      }

      state.initialized = true;
      ensureCard();

      state.observer = new MutationObserver(onMutations);
      state.observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      window.addEventListener("scroll", hideCard, true);
      window.addEventListener("resize", hideCard);
      window.addEventListener("popstate", () => scheduleScan(0));
      document.addEventListener("keydown", onDocumentKeyDown, true);

      scheduleScan(0);
    } catch (error) {
      warn("Content script boot failed", error);
    }
  }

  function scheduleScan(delay = DEBOUNCE_MS) {
    try {
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        state.timer = null;
        void scanPage();
      }, delay);
    } catch {
      // Ignore scheduler failures.
    }
  }

  function onMutations(mutations) {
    try {
      let relevant = false;

      for (const mutation of mutations) {
        const target = mutation.target;
        const targetElement =
          target && target.nodeType === 1 ? target : target && target.parentElement;

        if (
          targetElement &&
          targetElement.closest &&
          (targetElement.closest(".fe-card") || targetElement.closest(".fe-badge"))
        ) {
          continue;
        }

        if (mutation.type !== "childList") continue;

        let addedSomething = false;
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) {
            addedSomething = true;
            continue;
          }
          if (
            node.classList &&
            (node.classList.contains("fe-badge") || node.classList.contains("fe-card"))
          ) {
            continue;
          }
          addedSomething = true;
        }

        if (addedSomething) {
          relevant = true;
          break;
        }
      }

      if (relevant) scheduleScan();
    } catch {
      // Never let observer errors reach Google's page.
    }
  }

  async function scanPage() {
    if (state.running) {
      state.rescan = true;
      return;
    }

    state.running = true;

    try {
      const groups = collectNewTargets();
      if (groups.size === 0) return;

      const urls = Array.from(groups.keys());
      const sponsoredUrls = Array.from(groups.values())
        .filter((group) => group.sponsored)
        .map((group) => group.url);

      // Title/snippet per URL, forwarded to the team LLM hook.
      const meta = {};
      for (const group of groups.values()) {
        meta[group.url] = { title: group.title || "", snippet: group.snippet || "" };
      }

      let response;
      try {
        response = await requestAnalysis(urls, sponsoredUrls, meta);
      } catch (error) {
        markGroupsError(groups, T("errConnect"));
        warn("ANALYZE message failed", error);
        return;
      }

      applyResponse(groups, response);
    } catch (error) {
      warn("Scan failed", error);
    } finally {
      state.running = false;

      if (state.rescan) {
        state.rescan = false;
        scheduleScan(DEBOUNCE_MS);
      }
    }
  }

  function collectNewTargets() {
    const groups = new Map();
    const headings = document.querySelectorAll("a[href] h3");

    for (const h3 of headings) {
      try {
        if (!h3 || h3.getAttribute(CHECKED_ATTR) === "1") continue;
        if (h3.querySelector(".fe-badge")) continue;

        const anchor = h3.closest("a");
        if (!anchor || anchor.getAttribute(CHECKED_ATTR) === "1") continue;
        if (anchor.closest(".fe-card") || anchor.closest(".fe-badge")) continue;

        const destination = resolveDestination(anchor.getAttribute("href"));
        if (!destination) continue;

        const block = findResultBlock(h3, anchor);
        const sponsored = detectSponsored(anchor, block);
        // Read the title before the badge is appended into the h3.
        const titleText = (h3.textContent || "").trim().slice(0, 200);
        const badge = createLoadingBadge(sponsored);

        h3.appendChild(badge);
        anchor.setAttribute(CHECKED_ATTR, "1");
        h3.setAttribute(CHECKED_ATTR, "1");

        if (sponsored) {
          block.classList.add("fe-sponsored");
          block.setAttribute("data-fe-sponsored", "1");
        }

        const target = {
          anchor,
          h3,
          block,
          badge,
          sponsored,
          url: destination.href,
          result: null,
          error: null
        };

        badgeTargets.set(badge, target);

        let group = groups.get(destination.href);
        if (!group) {
          group = {
            url: destination.href,
            key: destination.href,
            sponsored: false,
            targets: []
          };
          groups.set(destination.href, group);
        }

        group.sponsored = group.sponsored || sponsored;
        if (!group.title) {
          group.title = titleText;
          group.snippet = extractSnippet(block, h3);
        }
        group.targets.push(target);
      } catch {
        // A single malformed result must not block the rest.
      }
    }

    return groups;
  }

  function requestAnalysis(urls, sponsoredUrls, meta) {
    return new Promise((resolve, reject) => {
      try {
        if (
          typeof chrome === "undefined" ||
          !chrome.runtime ||
          typeof chrome.runtime.sendMessage !== "function"
        ) {
          reject(new Error("Extension runtime unavailable"));
          return;
        }

        chrome.runtime.sendMessage(
          {
            type: "ANALYZE",
            urls,
            sponsoredUrls,
            meta
          },
          (response) => {
            try {
              const lastError = chrome.runtime.lastError;
              if (lastError) {
                reject(new Error(lastError.message || "Runtime error"));
                return;
              }
              resolve(Array.isArray(response) ? response : []);
            } catch (error) {
              reject(error);
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  function applyResponse(groups, response) {
    const byUrl = new Map();

    if (Array.isArray(response)) {
      for (const item of response) {
        if (!item || typeof item.url !== "string") continue;
        const key = canonicalKey(item.url);
        if (key) byUrl.set(key, item);
      }
    }

    for (const group of groups.values()) {
      const rawResult = byUrl.get(group.key);

      if (!rawResult) {
        markGroupError(group, T("errNoResult"));
        continue;
      }

      for (const target of group.targets) {
        try {
          const result = normalizeResult(rawResult, target);
          applyResult(target, result);
        } catch {
          markGroupError({ targets: [target] }, T("errRender"));
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Result extraction / sponsored detection
  // -------------------------------------------------------------------------

  function resolveDestination(rawHref) {
    if (typeof rawHref !== "string" || !rawHref.trim()) return null;

    let current;
    try {
      current = new URL(rawHref, window.location.href);
    } catch {
      return null;
    }

    for (let hop = 0; hop < 4; hop += 1) {
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        return null;
      }

      const host = current.hostname.toLowerCase();
      const next = redirectTarget(current, host);

      if (next) {
        current = next;
        continue;
      }

      if (isGoogleHost(host) || isGoogleAdHost(host)) return null;

      current.hash = "";
      return current;
    }

    return null;
  }

  function redirectTarget(url, host) {
    const path = url.pathname.toLowerCase();
    const params = url.searchParams;

    // Organic result links: /url?q=... or /url?url=...
    if (
      isGoogleHost(host) &&
      (path === "/url" || path === "/url/" || path.startsWith("/url/"))
    ) {
      const target = params.get("q") || params.get("url");
      return target ? toUrl(target, url.href) : null;
    }

    // Sponsored click links: /aclk?...&adurl=... and Google ad domains.
    if (path.includes("aclk") || isGoogleAdHost(host)) {
      const target =
        params.get("adurl") || params.get("url") || params.get("q");
      return target ? toUrl(target, url.href) : null;
    }

    if (path === "/imgres") {
      const target = params.get("imgurl");
      return target ? toUrl(target, url.href) : null;
    }

    return null;
  }

  function toUrl(value, base) {
    try {
      return new URL(value, base);
    } catch {
      return null;
    }
  }

  function isGoogleHost(host) {
    const labels = String(host).toLowerCase().split(".");
    const googleIndex = labels.indexOf("google");
    return googleIndex !== -1 && googleIndex < labels.length - 1;
  }

  function isGoogleAdHost(host) {
    return (
      host === "googleadservices.com" ||
      host.endsWith(".googleadservices.com") ||
      host === "googlesyndication.com" ||
      host.endsWith(".googlesyndication.com") ||
      host === "doubleclick.net" ||
      host.endsWith(".doubleclick.net")
    );
  }

  function canonicalKey(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      return url.href;
    } catch {
      return "";
    }
  }

  function findResultBlock(h3, anchor) {
    let node = anchor.parentElement;
    let block = anchor.parentElement || anchor;

    for (let depth = 0; node && node !== document.body && depth < 12; depth += 1) {
      if (node.querySelectorAll("h3").length > 1) break;
      block = node;
      node = node.parentElement;
    }

    return block;
  }

  // Visible result text without the title and our badge, capped for the LLM.
  function extractSnippet(block, h3) {
    try {
      if (!block) return "";
      const clone = block.cloneNode(true);
      for (const el of clone.querySelectorAll("h3, .fe-badge, cite, script, style")) {
        el.remove();
      }
      return (clone.textContent || "")
        .replace(/\s+/g, " ")
        .replace((h3.textContent || "").trim(), "")
        .trim()
        .slice(0, 400);
    } catch {
      return "";
    }
  }

  function detectSponsored(anchor, block) {
    let node = anchor;

    while (node) {
      if (node.hasAttribute && node.hasAttribute("data-text-ad")) return true;
      if (node === block) break;
      node = node.parentElement;
    }

    // Match the short ad label itself, not the whole block text: "إعلان" also
    // means "announcement" and appears in normal Arabic result snippets.
    if (block && block.querySelectorAll) {
      for (const el of block.querySelectorAll("span, div")) {
        if (el.childElementCount > 1) continue;
        const label = (el.textContent || "").trim().toLowerCase();
        if (label.length === 0 || label.length > 20) continue;
        if (SPONSORED_LABELS.some((word) => label.startsWith(word))) return true;
      }
    }

    // Google sometimes marks an outer ad wrapper rather than the inner block.
    let above = block && block.parentElement;
    for (let depth = 0; above && depth < 4; depth += 1) {
      if (above.hasAttribute && above.hasAttribute("data-text-ad")) return true;
      above = above.parentElement;
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // Badges
  // -------------------------------------------------------------------------

  function createLoadingBadge(sponsored) {
    const badge = document.createElement("span");
    badge.className = "fe-badge fe-badge-loading";
    badge.dataset.feBadge = "1";
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    badge.setAttribute("aria-expanded", "false");
    badge.setAttribute("aria-label", T("checkingAria"));

    const spinner = document.createElement("span");
    spinner.className = "fe-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "fe-badge-text";
    text.textContent = T("checking");

    badge.append(spinner, text);
    if (sponsored) badge.append(createAdTag());
    addBadgeEvents(badge);

    return badge;
  }

  function applyResult(target, result) {
    const badge = target.badge;
    if (!badge || !badge.isConnected) return;

    target.result = result;
    target.error = null;

    const level = result.level;
    const emoji = LEVEL_EMOJI[level] || "⚪";
    const score = Number.isFinite(result.score) ? result.score : 0;

    badge.className = `fe-badge fe-level-${level}`;
    badge.replaceChildren();

    const emojiElement = document.createElement("span");
    emojiElement.className = "fe-badge-emoji";
    emojiElement.setAttribute("aria-hidden", "true");
    emojiElement.textContent = emoji;

    const scoreElement = document.createElement("span");
    scoreElement.className = "fe-badge-score";
    scoreElement.textContent = String(score);

    badge.append(emojiElement, scoreElement);
    if (target.sponsored) badge.append(createAdTag());

    // No native `title`: it would show a second tooltip on top of the hover card.
    badge.removeAttribute("title");
    badge.setAttribute(
      "aria-label",
      T("ariaResult", { level: levelLabel(level), score, reasons: result.reasons })
    );
    badge.dataset.feLevel = level;

    if (level === "high" && target.block) {
      target.block.classList.add("fe-high-result");
      target.block.setAttribute("data-fe-high", "1");
    }

    refreshActiveCard(target);
  }

  function markGroupError(group, reason) {
    for (const target of group.targets || []) {
      try {
        markError(target, reason);
      } catch {
        // Ignore one broken badge.
      }
    }
  }

  function markGroupsError(groups, reason) {
    for (const group of groups.values()) {
      markGroupError(group, reason);
    }
  }

  function markError(target, reason) {
    const badge = target.badge;
    if (!badge || !badge.isConnected) return;

    target.error = reason || T("errGeneric");
    target.result = null;

    badge.className = "fe-badge fe-badge-error";
    badge.replaceChildren();

    const emoji = document.createElement("span");
    emoji.className = "fe-badge-emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = "⚠️";

    const text = document.createElement("span");
    text.className = "fe-badge-score";
    text.textContent = T("errShort");

    badge.append(emoji, text);
    if (target.sponsored) badge.append(createAdTag());

    badge.setAttribute("aria-label", T("errAria", { reason: target.error }));
    badge.dataset.feLevel = "error";

    refreshActiveCard(target);
  }

  function createAdTag() {
    const tag = document.createElement("span");
    tag.className = "fe-ad-tag";
    tag.textContent = T("adTag");
    tag.setAttribute("dir", I18N.dir(LANG));
    return tag;
  }

  function addBadgeEvents(badge) {
    const stop = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    badge.addEventListener("mousedown", stop);
    badge.addEventListener("click", (event) => {
      stop(event);
      showCard(badge);
    });
    badge.addEventListener("mouseenter", () => showCard(badge));
    badge.addEventListener("mouseleave", () => {
      if (!badge.matches(":focus")) hideCard();
    });
    badge.addEventListener("focus", () => showCard(badge));
    badge.addEventListener("blur", hideCard);
    badge.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        showCard(badge);
      } else if (event.key === "Escape") {
        hideCard();
      }
    });
  }

  function normalizeResult(rawResult, target) {
    const score = clamp(Number(rawResult.score) || 0, 0, 100);
    const level = ["safe", "low", "medium", "high"].includes(rawResult.level)
      ? rawResult.level
      : levelForScore(score);

    const reasons = Array.isArray(rawResult.reasons)
      ? rawResult.reasons.filter((reason) => typeof reason === "string" && reason.trim())
      : [];

    const result = {
      url: rawResult.url || target.url,
      hostname: rawResult.hostname || hostnameFrom(target.url),
      score,
      level,
      reasons,
      ageDays: Number.isFinite(rawResult.ageDays) ? rawResult.ageDays : null
    };

    // Defence in depth: the background boosts sponsored results. If an older
    // background is running, apply the same +15 here instead.
    if (
      target.sponsored &&
      result.level !== "safe" &&
      !result.reasons.some(isSponsoredReason)
    ) {
      const boosted = Math.min(100, result.score + 15);
      result.score = boosted;
      result.level = levelForScore(boosted);
      result.reasons = [...result.reasons, T("sponsored")];
    }

    return result;
  }

  function isSponsoredReason(reason) {
    return (
      typeof reason === "string" &&
      I18N.isReason(reason, "sponsored")
    );
  }

  function hostnameFrom(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  function levelForScore(score) {
    if (score >= 60) return "high";
    if (score >= 30) return "medium";
    return "low";
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // -------------------------------------------------------------------------
  // Hover card
  // -------------------------------------------------------------------------

  function ensureCard() {
    if (state.card && state.card.isConnected) return state.card;

    const card = document.createElement("div");
    card.id = CARD_ID;
    card.className = "fe-card";
    card.dataset.open = "0";
    card.setAttribute("dir", I18N.dir(LANG));
    card.setAttribute("lang", LANG);
    card.setAttribute("role", "tooltip");
    card.style.visibility = "hidden";

    (document.body || document.documentElement).appendChild(card);
    state.card = card;
    return card;
  }

  function showCard(badge) {
    try {
      const target = badgeTargets.get(badge);
      if (!target || !badge.isConnected) return;

      const card = ensureCard();
      state.activeBadge = badge;
      badge.setAttribute("aria-expanded", "true");

      renderCard(card, target);
      card.dataset.open = "1";
      card.style.visibility = "hidden";

      const badgeRect = badge.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const margin = 8;

      let top = badgeRect.bottom + margin;
      if (top + cardRect.height > window.innerHeight - margin) {
        top = Math.max(margin, badgeRect.top - cardRect.height - margin);
      }

      let left = badgeRect.left + badgeRect.width / 2 - cardRect.width / 2;
      left = Math.max(
        margin,
        Math.min(left, window.innerWidth - cardRect.width - margin)
      );

      card.style.top = `${Math.round(top)}px`;
      card.style.left = `${Math.round(left)}px`;
      card.style.visibility = "visible";
    } catch {
      hideCard();
    }
  }

  function hideCard() {
    try {
      if (state.activeBadge) {
        state.activeBadge.setAttribute("aria-expanded", "false");
      }
      state.activeBadge = null;

      if (state.card) {
        state.card.dataset.open = "0";
        state.card.style.visibility = "hidden";
      }
    } catch {
      // Ignore card teardown errors.
    }
  }

  function refreshActiveCard(target) {
    if (state.activeBadge !== target.badge || !state.card) return;
    if (state.card.dataset.open !== "1") return;

    try {
      renderCard(state.card, target);
      showCard(target.badge);
    } catch {
      // Ignore refresh errors.
    }
  }

  function renderCard(card, target) {
    const result = target.result;
    const level = result ? result.level : target.error ? "error" : "loading";

    card.className = `fe-card fe-card-${level}`;
    card.replaceChildren();

    const head = document.createElement("div");
    head.className = "fe-card-head";

    const levelGroup = document.createElement("div");
    levelGroup.className = "fe-card-level";

    const dot = document.createElement("span");
    dot.className = "fe-card-dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = levelLabel(level);

    levelGroup.append(dot, label);
    head.appendChild(levelGroup);

    if (result) {
      const score = document.createElement("span");
      score.className = "fe-card-score";
      score.textContent = `${result.score}/100`;
      head.appendChild(score);
    }

    card.appendChild(head);

    if (target.sponsored) {
      const ad = document.createElement("span");
      ad.className = "fe-card-ad";
      ad.textContent = T("sponsoredLabel");
      card.appendChild(ad);
    }

    const host = document.createElement("div");
    host.className = "fe-card-host";
    host.dir = "ltr";
    host.textContent =
      (result && result.hostname) || hostnameFrom(target.url) || T("unknownLink");
    card.appendChild(host);

    if (level === "loading") {
      const note = document.createElement("div");
      note.className = "fe-card-note";
      note.textContent = T("cardLoading");
      card.appendChild(note);
    } else if (level === "error") {
      const note = document.createElement("div");
      note.className = "fe-card-note fe-card-note-error";
      note.textContent = target.error || T("errGeneric");
      card.appendChild(note);
    } else {
      // Age is shown in the footer; drop the duplicate "unknown age" bullet.
      const reasons = (result.reasons || []).filter(
        (reason) => !I18N.isReason(reason, "ageUnknown")
      );

      if (reasons.length === 0) {
        const note = document.createElement("div");
        note.className = "fe-card-note";
        note.textContent = T("noSignals");
        card.appendChild(note);
      } else {
        const list = document.createElement("ul");
        list.className = "fe-card-reasons";

        for (const reason of reasons) {
          const item = document.createElement("li");
          item.textContent = reason;
          list.appendChild(item);
        }

        card.appendChild(list);
      }

      const meta = document.createElement("div");
      meta.className = "fe-card-meta";

      if (Number.isFinite(result.ageDays)) {
        const age = document.createElement("span");
        age.textContent = T("ageDays", { days: Math.max(0, Math.floor(result.ageDays)) });
        meta.appendChild(age);
      } else {
        const age = document.createElement("span");
        age.textContent = T("ageUnknownLine");
        meta.appendChild(age);
      }

      card.appendChild(meta);
    }

    const brand = document.createElement("div");
    brand.className = "fe-card-brand";
    brand.textContent = T("brandSearch");
    card.appendChild(brand);
  }

  function onDocumentKeyDown(event) {
    if (event.key === "Escape") hideCard();
  }

  function warn(message, error) {
    try {
      console.warn(`[FraudShield] ${message}:`, error);
    } catch {
      // Ignore console failures.
    }
  }

  // Start after the document exists; document_idle usually guarantees it.
  const start = () =>
    I18N.loadLang().then((lang) => {
      LANG = lang;
      boot();
    });

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  } catch (error) {
    warn("Content script initialization failed", error);
  }
})();
