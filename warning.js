/**
 * FraudShield — warning page.
 * Two modes:
 *   ?u=<url>[&s=signals]   a high-risk page was blocked before it loaded
 *   ?d=<downloadId>&u=...  a dangerous download was paused (or deleted)
 */
(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const target = params.get("u") || "";
  const downloadId = params.has("d") ? Number(params.get("d")) : null;
  const isDownload = Number.isInteger(downloadId);
  const $ = (id) => document.getElementById(id);
  const I18N = globalThis.FE_I18N;
  let LANG = I18N.DEFAULT_LANG;
  const T = (key, p) => I18N.t(key, LANG, p);

  let parsed = null;
  try {
    parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") parsed = null;
  } catch {
    parsed = null;
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          resolve(chrome.runtime.lastError ? null : res);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function fillReasons(reasons, ageDays) {
    const list = $("reasons");
    list.replaceChildren();
    for (const reason of reasons || []) {
      if (I18N.isReason(reason, "ageUnknown")) continue;
      const li = document.createElement("li");
      li.textContent = reason;
      list.appendChild(li);
    }
    if (Number.isFinite(ageDays)) {
      const li = document.createElement("li");
      li.textContent = T("ageDays", { days: Math.floor(ageDays) });
      list.appendChild(li);
    }
  }

  function failReasons() {
    const li = document.createElement("li");
    li.textContent = T("wLoadFail");
    $("reasons").replaceChildren(li);
  }

  function goSafe() {
    // Leave to a known-safe page; history may point back at the bad site.
    chrome.tabs.getCurrent((tab) => {
      if (tab && Number.isInteger(tab.id)) {
        chrome.tabs.update(tab.id, { url: "chrome://newtab/" });
      } else {
        location.replace("about:blank");
      }
    });
  }

  // ---- Blocked page --------------------------------------------------------

  async function loadPage() {
    $("url").textContent = parsed ? parsed.href : T("wInvalid");
    if (!parsed) {
      $("proceed").disabled = true;
      return;
    }
    const result = await send({ type: "GET_WARNING", url: parsed.href, signals: params.get("s") || "" });
    if (!result) return failReasons();
    $("score").textContent = `${result.score}/100`;
    void send({ type: "MARK_BLOCKED", score: result.score });
    fillReasons(result.reasons, result.ageDays);
  }

  // ---- Paused download -----------------------------------------------------

  function setupDownloadTexts() {
    $("lead").textContent = T("dLead");
    const steps = $("steps");
    steps.replaceChildren();
    for (const key of ["dStep1", "dStep2", "dStep3", "wStep4"]) {
      const li = document.createElement("li");
      li.textContent = T(key);
      steps.appendChild(li);
    }
    $("always-row").hidden = true;
    $("back").textContent = T("dDelete");
    $("proceed").textContent = T("dKeep");
  }

  async function loadDownload() {
    setupDownloadTexts();
    const info = await send({ type: "GET_DOWNLOAD", id: downloadId });
    if (!info) {
      $("url").textContent = parsed ? parsed.href : "—";
      return failReasons();
    }

    $("url").textContent = info.filename;
    const source = document.createElement("div");
    source.className = "source";
    source.textContent = `${T("dSource")} ${info.source || "—"}`;
    $("url").appendChild(source);

    $("score").textContent = `${info.score}/100`;
    void send({ type: "MARK_BLOCKED", score: info.score });
    fillReasons(info.reasons, null);

    if (info.removed) {
      showDone("dRemoved");
      $("proceed").disabled = true;
    }
  }

  function showDone(key) {
    $("done").textContent = T(key);
    $("done").hidden = false;
  }

  // ---- Buttons -------------------------------------------------------------

  $("back").addEventListener("click", async () => {
    if (!isDownload) return goSafe();
    $("back").disabled = true;
    $("proceed").disabled = true;
    await send({ type: "DOWNLOAD_DECISION", id: downloadId, action: "delete" });
    showDone("dDeleted");
  });

  $("proceed").addEventListener("click", async () => {
    $("proceed").disabled = true;
    if (isDownload) {
      $("back").disabled = true;
      await send({ type: "DOWNLOAD_DECISION", id: downloadId, action: "keep" });
      showDone("dKept");
      return;
    }
    if (!parsed) return;
    await send({ type: "ALLOW_SITE", url: parsed.href, permanent: $("always").checked });
    location.replace(parsed.href);
  });

  I18N.loadLang().then((lang) => {
    LANG = lang;
    I18N.applyDom(document, LANG);
    document.title = T("wTitle");
    void (isDownload ? loadDownload() : loadPage());
  });
})();
