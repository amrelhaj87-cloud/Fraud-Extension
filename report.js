/**
 * FraudShield — report page.
 *   report.html?d=<draftId>   report the site / place saved by reports.js
 *   report.html               only "My reports"
 *
 * For now reports are saved on this device only (chrome.storage.local).
 * Next: Google sign-in, and sendReport() posts to the shared reports database,
 * where each report is reviewed before it counts for everyone.
 */
(() => {
  "use strict";

  const I18N = globalThis.FE_I18N;
  let LANG = I18N.DEFAULT_LANG;
  const T = (key, params) => I18N.t(key, LANG, params);
  const $ = (id) => document.getElementById(id);

  const REPORTS_KEY = "fs:reports";
  const DRAFT_PREFIX = "fs:draft:";

  const draftId = new URLSearchParams(location.search).get("d") || "";
  let draft = null;

  // ---- Storage -------------------------------------------------------------

  const store = {
    get: (key) =>
      new Promise((resolve) => {
        try {
          chrome.storage.local.get(key, (data) => resolve(data ? data[key] : undefined));
        } catch {
          resolve(undefined);
        }
      }),
    set: (key, value) =>
      new Promise((resolve) => {
        try {
          chrome.storage.local.set({ [key]: value }, () => resolve(true));
        } catch {
          resolve(false);
        }
      }),
    remove: (key) =>
      new Promise((resolve) => {
        try {
          chrome.storage.local.remove(key, () => resolve(true));
        } catch {
          resolve(false);
        }
      })
  };

  // Same site / place reported twice by the same user counts once.
  function targetKey(d) {
    if (!d) return "";
    if (d.kind === "place") return `place|${(d.name || "").trim()}|${d.phone || ""}`;
    try {
      return `site|${new URL(d.url).hostname.replace(/^www\./, "")}`;
    } catch {
      return `site|${d.url || ""}`;
    }
  }

  function targetLabel(d) {
    if (d.kind === "place") return [d.name, d.phone].filter(Boolean).join(" · ");
    try {
      return new URL(d.url).hostname;
    } catch {
      return d.url || "—";
    }
  }

  // ---- Rendering -----------------------------------------------------------

  function renderTarget() {
    if (!draft) {
      $("no-draft").hidden = false;
      return;
    }
    $("target").hidden = false;
    $("t-kind").textContent = T(draft.kind === "place" ? "rKindPlace" : "rKindSite");
    $("t-main").textContent = draft.kind === "place" ? draft.name || "—" : draft.url || "—";

    const facts = $("t-facts");
    facts.replaceChildren();
    const fact = (key, value, ltr) => {
      if (!value) return;
      const dt = document.createElement("dt");
      dt.textContent = T(key);
      const dd = document.createElement("dd");
      dd.textContent = value;
      dd.dir = ltr ? "ltr" : "auto";
      facts.append(dt, dd);
    };
    if (draft.kind === "place") {
      fact("rPhone", draft.phone, true);
      fact("rAddress", draft.address);
      fact("rWebsite", draft.website, true);
    }

    if (draft.level && Number.isFinite(draft.score)) {
      $("t-score-row").hidden = false;
      const pill = $("t-level");
      pill.className = `pill ${draft.level}`;
      pill.textContent = draft.level === "safe" ? T("popupSafe") : T(`level_${draft.level}`);
      $("t-score").textContent = `${draft.score}/100`;
    }

    if (draft.reasons && draft.reasons.length) {
      $("t-why-wrap").hidden = false;
      const list = $("t-reasons");
      list.replaceChildren();
      for (const reason of draft.reasons) {
        const li = document.createElement("li");
        li.textContent = reason;
        list.appendChild(li);
      }
    }
  }

  async function renderForm() {
    $("form").hidden = !draft || !$("done").hidden;
    if (draft) {
      const reports = (await store.get(REPORTS_KEY)) || [];
      const previous = reports.find((r) => r.key === targetKey(draft));
      if (previous && $("done").hidden) {
        $("form").hidden = true;
        showDone(T("rAlready", { id: previous.id }));
      }
    }
    await renderMine();
  }

  async function renderMine() {
    const reports = (await store.get(REPORTS_KEY)) || [];
    const list = $("mine-list");
    list.replaceChildren();
    $("mine").hidden = false;
    $("mine-empty").hidden = reports.length > 0;

    for (const report of [...reports].reverse()) {
      const li = document.createElement("li");
      const id = document.createElement("span");
      id.className = "id";
      id.textContent = report.id;
      const what = document.createElement("span");
      what.className = "what";
      what.textContent = targetLabel(report.target);
      what.title = what.textContent;
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = new Date(report.at).toLocaleString(LANG === "ar" ? "ar-AE" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short"
      });
      const status = document.createElement("span");
      status.className = "status";
      status.textContent = `· ${T("rStatus")}`;
      li.append(id, what, when, status);
      list.appendChild(li);
    }
  }

  function showDone(text) {
    $("done-main").textContent = text;
    $("done").hidden = false;
  }

  // ---- Actions -------------------------------------------------------------

  $("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!draft || !$("consent").checked) return;
    $("send").disabled = true;
    const report = await sendReport(draft, $("note").value.trim().slice(0, 600));
    if (draftId) await store.remove(`${DRAFT_PREFIX}${draftId}`);
    $("form").hidden = true;
    showDone(T("rSent", { id: report.id }));
    await renderMine();
  });

  // Saved on this device for now. Next step: POST to the shared reports
  // database here and keep the local copy for "My reports".
  async function sendReport(target, note) {
    const reports = (await store.get(REPORTS_KEY)) || [];
    const last = reports.reduce((max, r) => Math.max(max, Number(String(r.id).slice(3)) || 0), 0);
    const id = `FS-${String(last + 1).padStart(4, "0")}`;
    const report = {
      id,
      at: Date.now(),
      key: targetKey(target),
      target,
      note,
      status: "received"
    };
    reports.push(report);
    await store.set(REPORTS_KEY, reports.slice(-200));
    return report;
  }

  // ---- Boot ----------------------------------------------------------------

  async function boot() {
    LANG = await I18N.loadLang();
    I18N.applyDom(document, LANG);
    document.title = T("rTitle");
    if (draftId) draft = (await store.get(`${DRAFT_PREFIX}${draftId}`)) || null;
    renderTarget();
    await renderForm();
  }

  void boot();
})();
