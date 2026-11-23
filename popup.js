/**
 * Fraud Extension — popup.
 * Shows the verdict for the active tab, a manual URL checker, and the list of
 * links already analyzed on the current page (from the background worker).
 */

const LEVEL_LABELS = {
  safe: "آمن — موقع رسمي",
  low: "منخفض الخطورة",
  medium: "متوسط الخطورة",
  high: "خطر مرتفع"
};

const LEVEL_COLORS = {
  safe: "var(--safe)",
  low: "var(--low)",
  medium: "var(--medium)",
  high: "var(--high)"
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

function send(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    } catch {
      resolve(null);
    }
  });
}

async function analyzeUrl(url) {
  // No tabId: manual checks must not pollute the page's result list.
  const response = await send({ type: "ANALYZE", urls: [url] });
  return Array.isArray(response) && response[0] ? response[0] : null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderVerdict(result, { title } = {}) {
  const card = $("current");
  const verdict = $("current-verdict");
  const note = $("current-note");

  if (title) card.querySelector(".card-label").textContent = title;
  $("current-host").textContent = result.hostname || result.url || "";

  const level = result.level || "low";
  const score = Number.isFinite(result.score) ? result.score : 0;

  card.className = `card level-${level}`;
  const pill = $("current-level");
  pill.className = `pill ${level}`;
  pill.textContent = LEVEL_LABELS[level] || level;

  $("current-score").textContent = `${score}/100`;
  const bar = $("current-bar");
  bar.style.width = `${Math.max(3, score)}%`;
  bar.style.background = LEVEL_COLORS[level] || "var(--muted)";

  const list = $("current-reasons");
  list.replaceChildren();
  for (const reason of result.reasons || []) {
    if (reason === "عمر الدومين غير معروف") continue; // shown in the age line
    const li = document.createElement("li");
    li.textContent = reason;
    list.appendChild(li);
  }

  $("current-age").textContent = Number.isFinite(result.ageDays)
    ? `عمر الدومين: ${Math.floor(result.ageDays)} يومًا`
    : "عمر الدومين: غير معروف";

  verdict.hidden = false;
  note.hidden = true;
}

function renderNote(host, text) {
  $("current-host").textContent = host;
  $("current-verdict").hidden = true;
  const note = $("current-note");
  note.textContent = text;
  note.hidden = false;
}

function renderPageResults(results) {
  const list = $("results");
  list.replaceChildren();
  const sorted = (results || [])
    .filter((r) => r && r.hostname)
    .sort((a, b) => Number(b.score) - Number(a.score));

  $("results-count").textContent = sorted.length ? `(${sorted.length})` : "";
  $("results-empty").hidden = sorted.length > 0;

  for (const result of sorted) {
    const li = document.createElement("li");
    li.title = (result.reasons || []).join("\n");

    const dot = document.createElement("span");
    dot.className = `dot ${result.level}`;

    const host = document.createElement("span");
    host.className = "r-host";
    host.textContent = result.hostname;

    const score = document.createElement("span");
    score.className = "r-score";
    score.textContent = String(result.score);

    li.append(dot, host, score);
    li.addEventListener("click", () =>
      renderVerdict(result, { title: "تفاصيل الرابط" })
    );
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function loadActiveTab() {
  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    // Ignore; handled below.
  }

  if (!tab || !tab.url) {
    renderNote("—", "تعذر قراءة الصفحة الحالية.");
    return;
  }

  let parsed;
  try {
    parsed = new URL(tab.url);
  } catch {
    renderNote("—", "تعذر قراءة الصفحة الحالية.");
    return;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    renderNote(parsed.protocol, "هذه الصفحة لا تحتاج إلى فحص.");
  } else {
    renderNote(parsed.hostname, "جارٍ الفحص…");
    const result = await analyzeUrl(tab.url);
    if (result) renderVerdict(result);
    else renderNote(parsed.hostname, "تعذر فحص هذه الصفحة.");
  }

  const page = await send({ type: "GET_TAB_RESULTS", tabId: tab.id });
  renderPageResults(page && page.results);
}

function normalizeInput(raw) {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

$("check-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = normalizeInput($("check-input").value);
  if (!url) {
    renderNote($("check-input").value, "الرابط غير صالح. مثال: adcb.com");
    return;
  }

  const button = $("check-btn");
  button.disabled = true;
  button.textContent = "…";
  renderNote(new URL(url).hostname, "جارٍ الفحص…");

  const result = await analyzeUrl(url);
  if (result) renderVerdict(result, { title: "نتيجة الفحص اليدوي" });
  else renderNote(new URL(url).hostname, "تعذر فحص الرابط.");

  button.disabled = false;
  button.textContent = "افحص";
});

async function loadSettings() {
  const toggle = $("block-toggle");
  const settings = await send({ type: "GET_SETTINGS" });
  toggle.checked = !settings || settings.blockHigh !== false;
  toggle.addEventListener("change", () => {
    void send({ type: "SET_SETTINGS", blockHigh: toggle.checked });
  });
}

void loadSettings();
void loadActiveTab();
