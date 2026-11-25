/**
 * FraudShield — report page.
 *   report.html?d=<draftId>   report the site / place saved by reports.js
 *   report.html               only "My reports"
 *
 * When the shared database is set up (config.js), the user signs in with
 * Google and the report is sent for review (cloud.js). Otherwise it is saved
 * on this device only. Either way a copy is kept for "My reports".
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
  // { configured, user } from cloud.js
  let cloud = { configured: false, user: null };
  // Last list shown in "My reports" (local + database), used for "already reported".
  let mineCache = [];

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (res) => resolve(chrome.runtime.lastError ? null : res));
      } catch {
        resolve(null);
      }
    });
  }

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
    const needSignIn = cloud.configured && !cloud.user;
    $("gate").hidden = !needSignIn || !$("done").hidden;
    $("account").hidden = !cloud.user;
    if (cloud.user) $("account-name").textContent = T("rSignedInAs", { name: cloud.user.name || cloud.user.email });
    $("form").hidden = needSignIn || !draft || !$("done").hidden;
    await renderMine();
    if (draft && !needSignIn) {
      const previous = mineCache.find((r) => r.key === targetKey(draft));
      if (previous && $("done").hidden) {
        $("form").hidden = true;
        showDone(T("rAlready", { id: previous.id }));
      }
    }
  }

  // Local copies plus, when signed in, the user's reports in the database
  // (so they survive reinstalling the extension and show the review status).
  async function loadMine() {
    const local = (await store.get(REPORTS_KEY)) || [];
    if (!cloud.user) return local;
    const res = await send({ type: "CLOUD_MY_REPORTS" });
    if (!res || !res.ok) return local;
    const byKey = new Map(local.map((r) => [r.key, r]));
    const merged = res.reports.map((r) => {
      const copy = byKey.get(r.key);
      byKey.delete(r.key);
      return {
        id: copy ? copy.id : `FS-${r.id.split("_")[1].slice(0, 6).toUpperCase()}`,
        at: Date.parse(r.createdAt) || (copy && copy.at) || 0,
        key: r.key,
        target: r.target,
        shared: true,
        status: r.status
      };
    });
    return [...byKey.values(), ...merged].sort((a, b) => a.at - b.at);
  }

  const STATUS_KEY = { pending: "rPending", approved: "rApproved", rejected: "rRejected" };

  async function renderMine() {
    const reports = await loadMine();
    mineCache = reports;
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
      status.textContent = `· ${T(report.shared ? STATUS_KEY[report.status] || "rPending" : "rStatus")}`;
      li.append(id, what, when, status);
      list.appendChild(li);
    }
  }

  function showDone(text, note = "") {
    $("done-main").textContent = text;
    $("done-note").textContent = note;
    $("done-note").hidden = !note;
    $("done").hidden = false;
  }

  // ---- Actions -------------------------------------------------------------

  $("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!draft || !$("consent").checked) return;
    $("send").disabled = true;
    $("send-error").hidden = true;
    const note = $("note").value.trim().slice(0, 600);

    let shared = false;
    if (cloud.configured) {
      const res = await send({ type: "CLOUD_REPORT", report: { key: targetKey(draft), target: draft, note } });
      if (!res || !res.ok) {
        if (res && res.error === "signed-out") {
          cloud.user = null;
          $("send").disabled = false;
          return renderForm();
        }
        $("send-error").textContent = T("rSendFailed");
        $("send-error").hidden = false;
        $("send").disabled = false;
        return;
      }
      if (res.already) {
        // The database already has this user's report about it (e.g. after a reinstall).
        $("form").hidden = true;
        showDone(T("rAlready", { id: `FS-${String(res.id).split("_")[1].slice(0, 6).toUpperCase()}` }));
        await renderMine();
        return;
      }
      shared = true;
    }

    const report = await sendReport(draft, note, shared);
    if (draftId) await store.remove(`${DRAFT_PREFIX}${draftId}`);
    $("form").hidden = true;
    showDone(T("rSent", { id: report.id }), T(shared ? "rSentShared" : "rSavedLocal"));
    await renderMine();
  });

  $("sign-in").addEventListener("click", async () => {
    $("sign-in").disabled = true;
    $("gate-error").hidden = true;
    const res = await send({ type: "CLOUD_SIGN_IN" });
    $("sign-in").disabled = false;
    if (res && res.user) {
      cloud = res;
      await renderForm();
      $("note").focus();
    } else {
      $("gate-error").textContent = T("rSignInFailed");
      $("gate-error").hidden = false;
    }
  });

  $("sign-out").addEventListener("click", async () => {
    await send({ type: "CLOUD_SIGN_OUT" });
    cloud = { configured: cloud.configured, user: null };
    await renderForm();
  });

  // Local copy for "My reports" (shared = also sent to the reports database).
  async function sendReport(target, note, shared) {
    const reports = (await store.get(REPORTS_KEY)) || [];
    const last = reports.reduce((max, r) => Math.max(max, Number(String(r.id).slice(3)) || 0), 0);
    const id = `FS-${String(last + 1).padStart(4, "0")}`;
    const report = {
      id,
      at: Date.now(),
      key: targetKey(target),
      target,
      note,
      shared: Boolean(shared),
      status: shared ? "pending" : "saved"
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
    cloud = (await send({ type: "CLOUD_STATE" })) || { configured: false, user: null };
    await renderForm();
  }

  void boot();
})();
