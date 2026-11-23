/**
 * Fraud Extension — warning page shown instead of a blocked high-risk site.
 */
(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const target = params.get("u") || "";
  const $ = (id) => document.getElementById(id);
  const I18N = globalThis.FE_I18N;
  let LANG = I18N.DEFAULT_LANG;
  const T = (key, params) => I18N.t(key, LANG, params);

  let parsed = null;
  try {
    parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") parsed = null;
  } catch {
    parsed = null;
  }

  if (!parsed) $("proceed").disabled = true;

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

  async function loadDetails() {
    if (!parsed) return;
    const result = await send({ type: "GET_WARNING", url: parsed.href, signals: params.get("s") || "" });
    const list = $("reasons");
    list.replaceChildren();

    if (!result) {
      const li = document.createElement("li");
      li.textContent = T("wLoadFail");
      list.appendChild(li);
      return;
    }

    $("score").textContent = `${result.score}/100`;
    void send({ type: "MARK_BLOCKED", score: result.score });
    for (const reason of result.reasons || []) {
      if (I18N.isReason(reason, "ageUnknown")) continue;
      const li = document.createElement("li");
      li.textContent = reason;
      list.appendChild(li);
    }
    if (Number.isFinite(result.ageDays)) {
      const li = document.createElement("li");
      li.textContent = T("ageDays", { days: Math.floor(result.ageDays) });
      list.appendChild(li);
    }
  }

  $("back").addEventListener("click", () => {
    // Leave to a known-safe page; history may point back at the bad site.
    chrome.tabs.getCurrent((tab) => {
      if (tab && Number.isInteger(tab.id)) {
        chrome.tabs.update(tab.id, { url: "chrome://newtab/" });
      } else {
        location.replace("about:blank");
      }
    });
  });

  $("proceed").addEventListener("click", async () => {
    if (!parsed) return;
    $("proceed").disabled = true;
    await send({ type: "ALLOW_SITE", url: parsed.href, permanent: $("always").checked });
    location.replace(parsed.href);
  });

  I18N.loadLang().then((lang) => {
    LANG = lang;
    I18N.applyDom(document, LANG);
    document.title = T("wTitle");
    $("url").textContent = parsed ? parsed.href : T("wInvalid");
    void loadDetails();
  });
})();
