/**
 * Yaqiz — owner review page (admin.html).
 * Lists reports by status, grouped by site / place, so several people
 * reporting the same thing show as one case with a count. Approving or
 * rejecting updates every report in the case and rebuilds public/blocklist
 * (see cloud.js). Only works for the owner: the Firestore rules refuse
 * everyone else, whatever this page does.
 */
(() => {
  "use strict";

  const I18N = globalThis.FE_I18N;
  let LANG = I18N.DEFAULT_LANG;
  const T = (key, params) => I18N.t(key, LANG, params);
  const $ = (id) => document.getElementById(id);

  let status = "pending";
  let busy = false;

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (res) => resolve(chrome.runtime.lastError ? null : res));
      } catch {
        resolve(null);
      }
    });
  }

  function setStatus(text) {
    $("status").textContent = text || "";
  }

  function when(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString(LANG === "ar" ? "ar-AE" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url || "";
    }
  }

  // Reports about the same site / place -> one case.
  function group(reports) {
    const cases = new Map();
    for (const r of reports) {
      const c = cases.get(r.key) || { key: r.key, reports: [] };
      c.reports.push(r);
      cases.set(r.key, c);
    }
    return [...cases.values()].sort((a, b) => b.reports.length - a.reports.length);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderCase(c) {
    const first = c.reports[0];
    const li = el("li", "case");

    const head = el("div", "case-head");
    head.append(el("span", "kind", T(first.kind === "place" ? "rKindPlace" : "rKindSite")));
    const title = el("span", "case-title", first.kind === "place" ? first.name || "—" : first.host || hostOf(first.url));
    title.dir = "auto";
    head.append(title);
    if (first.level) {
      const best = c.reports.reduce((m, r) => Math.max(m, Number(r.score) || 0), 0);
      const pill = el("span", `pill ${first.level}`, first.level === "safe" ? T("popupSafe") : T(`level_${first.level}`));
      head.append(pill, el("span", "score", `${best}/100`));
    }
    head.append(el("span", "count", T("aCount", { n: c.reports.length })));
    li.append(head);

    const facts = el("dl", "facts");
    const fact = (key, value, ltr) => {
      if (!value) return;
      facts.append(el("dt", "", T(key)));
      const dd = el("dd", "", value);
      dd.dir = ltr ? "ltr" : "auto";
      facts.append(dd);
    };
    fact("rPhone", first.phone, true);
    fact("rAddress", first.address);
    fact("rWebsite", first.website, true);
    if (first.kind !== "place") fact("aLink", first.url, true);
    li.append(facts);

    const notes = el("ul", "notes");
    for (const r of c.reports) {
      const item = el("li");
      if (r.note) {
        const text = el("div", "", r.note);
        text.dir = "auto";
        item.append(text);
      }
      item.append(el("div", "when", `${when(r.createdAt)} · v${r.appVersion || "?"}`));
      notes.append(item);
    }
    li.append(notes);

    if (first.reasons && first.reasons.length) {
      const details = el("details");
      details.append(el("summary", "", T("rWhy")));
      const list = el("ul", "reasons");
      for (const reason of first.reasons) list.append(el("li", "", reason));
      details.append(list);
      li.append(details);
    }

    const actions = el("div", "actions");
    const ids = c.reports.map((r) => r.id);
    const button = (cls, key, next) => {
      const b = el("button", cls, T(key));
      b.type = "button";
      b.addEventListener("click", () => void decide(ids, next, actions));
      actions.append(b);
    };
    if (status !== "approved") button("approve", "aApprove", "approved");
    if (status !== "rejected") button("reject", "aReject", "rejected");
    if (status !== "pending") button("undo", "aBackToPending", "pending");
    li.append(actions);
    return li;
  }

  async function load() {
    if (busy) return;
    busy = true;
    for (const tab of document.querySelectorAll(".tabs button")) {
      tab.setAttribute("aria-selected", String(tab.dataset.status === status));
    }
    setStatus(T("aLoading"));
    $("cases").replaceChildren();
    $("empty").hidden = true;

    const res = await send({ type: "CLOUD_ADMIN_LIST", status });
    busy = false;
    if (!res || !res.ok) return showError(res);

    const cases = group(res.reports || []);
    for (const c of cases) $("cases").append(renderCase(c));
    $("empty").hidden = cases.length > 0;
    setStatus(cases.length ? T("aSummary", { cases: cases.length, reports: res.reports.length }) : "");
  }

  async function decide(ids, next, actions) {
    for (const b of actions.querySelectorAll("button")) b.disabled = true;
    setStatus(T("aSaving"));
    const res = await send({ type: "CLOUD_ADMIN_DECIDE", ids, status: next });
    if (!res || !res.ok) {
      for (const b of actions.querySelectorAll("button")) b.disabled = false;
      return showError(res);
    }
    await load();
    setStatus(T("aListUpdated", { n: res.list.count }));
  }

  function showError(res) {
    const error = res && res.error;
    if (error === "signed-out" || error === "not-admin") return block(error);
    setStatus(T("aError", { error: error || "?" }));
  }

  function block(reason) {
    $("console").hidden = true;
    $("blocked").hidden = false;
    $("blocked").textContent = T(reason === "signed-out" ? "aSignedOut" : reason === "off" ? "aOff" : "aNotAdmin");
  }

  for (const tab of document.querySelectorAll(".tabs button")) {
    tab.addEventListener("click", () => {
      status = tab.dataset.status;
      void load();
    });
  }
  $("refresh").addEventListener("click", () => void load());
  $("rebuild").addEventListener("click", async () => {
    setStatus(T("aSaving"));
    const res = await send({ type: "CLOUD_ADMIN_REBUILD" });
    if (!res || !res.ok) return showError(res);
    setStatus(T("aListUpdated", { n: res.list.count }));
  });

  async function boot() {
    LANG = await I18N.loadLang();
    I18N.applyDom(document, LANG);
    document.title = T("aTitle");
    const state = await send({ type: "CLOUD_STATE" });
    if (!state || !state.configured) return block("off");
    if (!state.user) return block("signed-out");
    if (!state.isAdmin) return block("not-admin");
    $("console").hidden = false;
    await load();
  }

  void boot();
})();
