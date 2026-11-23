/**
 * Fraud Extension — warning page shown instead of a blocked high-risk site.
 */
(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const target = params.get("u") || "";
  const $ = (id) => document.getElementById(id);

  let parsed = null;
  try {
    parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") parsed = null;
  } catch {
    parsed = null;
  }

  $("url").textContent = parsed ? parsed.href : "رابط غير صالح";
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
    const result = await send({ type: "GET_WARNING", url: parsed.href });
    const list = $("reasons");
    list.replaceChildren();

    if (!result) {
      const li = document.createElement("li");
      li.textContent = "تعذر تحميل التفاصيل.";
      list.appendChild(li);
      return;
    }

    $("score").textContent = `${result.score}/100`;
    for (const reason of result.reasons || []) {
      if (reason === "عمر الدومين غير معروف") continue;
      const li = document.createElement("li");
      li.textContent = reason;
      list.appendChild(li);
    }
    if (Number.isFinite(result.ageDays)) {
      const li = document.createElement("li");
      li.textContent = `عمر الدومين: ${Math.floor(result.ageDays)} يومًا`;
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

  void loadDetails();
})();
