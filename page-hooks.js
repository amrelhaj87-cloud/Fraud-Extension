/**
 * Fraud Extension — in-page behavior hooks (runs in the page's MAIN world at
 * document_start, top frame only).
 *
 * Watches browser APIs that scam pages abuse and reports them to
 * content-page.js with window.postMessage:
 *   - fullscreen, keyboard lock, pointer lock   (tech-support "scareware")
 *   - alert/confirm loops, beforeunload traps, history flooding  (trap the user)
 *   - notification permission requests, popup spam
 *   - clipboard writes that contain a command   (ClickFix) -> the write is BLOCKED
 *
 * Every wrapper calls the original API, except a clipboard write that holds a
 * command, which is silently dropped so nothing harmful can be pasted.
 */
(() => {
  "use strict";

  if (window.top !== window || window.__fraudExtensionHooks) return;
  Object.defineProperty(window, "__fraudExtensionHooks", { value: true });

  const SOURCE = "fraud-extension-hooks";
  const sent = [];
  let nextId = 0;
  const send = (msg) => {
    try {
      window.postMessage(msg, "*");
    } catch {
      // Ignore.
    }
  };
  const post = (name, detail) => {
    nextId += 1;
    const msg = { source: SOURCE, id: nextId, name, detail: detail || null };
    if (sent.length < 200) sent.push(msg);
    send(msg);
  };
  // The scanner (content-page.js) loads later; replay what happened before it.
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source === window && data && data.source === "fraud-extension-page" && data.name === "ready") {
      for (const msg of sent) send({ ...msg, replay: true });
    }
  });

  // Commands a ClickFix page wants you to paste into Win+R / a terminal.
  const COMMAND =
    /powershell|pwsh|\bcmd(\.exe)?\s*\/[ck]|mshta|rundll32|regsvr32|certutil|bitsadmin|wscript|cscript|invoke-(webrequest|expression|restmethod)|\biex\b|\biwr\b|frombase64string|-enc(odedcommand)?\s|start-process|curl\s+[^|]*\|\s*(sh|bash)|wget\s+[^|]*\|\s*(sh|bash)|\.hta\b|msiexec/i;

  const looksLikeCommand = (text) => typeof text === "string" && COMMAND.test(text);

  const wrap = (obj, key, make) => {
    try {
      const original = obj && obj[key];
      if (typeof original !== "function") return;
      const wrapped = make(original);
      Object.defineProperty(obj, key, { value: wrapped, writable: true, configurable: true });
    } catch {
      // Some APIs are not configurable; skip them.
    }
  };

  // ---- Fullscreen / locks -------------------------------------------------
  for (const name of ["requestFullscreen", "webkitRequestFullscreen", "webkitRequestFullScreen"]) {
    wrap(Element.prototype, name, (orig) =>
      function (...args) {
        post("fullscreen");
        return orig.apply(this, args);
      }
    );
  }

  wrap(Element.prototype, "requestPointerLock", (orig) =>
    function (...args) {
      post("pointerLock");
      return orig.apply(this, args);
    }
  );

  try {
    if (navigator.keyboard && navigator.keyboard.lock) {
      const kb = Object.getPrototypeOf(navigator.keyboard);
      wrap(kb, "lock", (orig) =>
        function (...args) {
          post("keyboardLock");
          return orig.apply(this, args);
        }
      );
    }
  } catch {
    // Keyboard Lock API not available.
  }

  // ---- Dialog loops -------------------------------------------------------
  for (const name of ["alert", "confirm", "prompt"]) {
    wrap(window, name, (orig) =>
      function (...args) {
        post("dialog");
        return orig.apply(this, args);
      }
    );
  }

  // ---- beforeunload traps -------------------------------------------------
  wrap(EventTarget.prototype, "addEventListener", (orig) =>
    function (type, ...rest) {
      if (this === window && type === "beforeunload") post("beforeUnload");
      return orig.call(this, type, ...rest);
    }
  );
  try {
    const desc = Object.getOwnPropertyDescriptor(window, "onbeforeunload") ||
      Object.getOwnPropertyDescriptor(Window.prototype, "onbeforeunload");
    if (desc && desc.set && desc.configurable) {
      Object.defineProperty(window, "onbeforeunload", {
        configurable: true,
        get() {
          return desc.get.call(window);
        },
        set(value) {
          if (value) post("beforeUnload");
          desc.set.call(window, value);
        }
      });
    }
  } catch {
    // Ignore.
  }

  // ---- History flooding (breaks the Back button) --------------------------
  wrap(History.prototype, "pushState", (orig) =>
    function (...args) {
      post("pushState");
      return orig.apply(this, args);
    }
  );

  // ---- Notifications / popups ---------------------------------------------
  try {
    if (window.Notification) {
      wrap(Notification, "requestPermission", (orig) =>
        function (...args) {
          post("notifications");
          return orig.apply(this, args);
        }
      );
    }
  } catch {
    // Ignore.
  }

  wrap(window, "open", (orig) =>
    function (...args) {
      const userActive = !!(navigator.userActivation && navigator.userActivation.isActive);
      post("popup", { userActive });
      return orig.apply(this, args);
    }
  );

  // ---- Clipboard guard (ClickFix) -----------------------------------------
  try {
    if (window.Clipboard) {
      wrap(Clipboard.prototype, "writeText", (orig) =>
        function (text, ...rest) {
          if (looksLikeCommand(text)) {
            post("clipboardCommand", { sample: String(text).slice(0, 120) });
            return Promise.resolve(); // pretend it worked; nothing is copied
          }
          return orig.call(this, text, ...rest);
        }
      );
      wrap(Clipboard.prototype, "write", (orig) =>
        async function (items, ...rest) {
          try {
            for (const item of items || []) {
              if (item.types && item.types.includes("text/plain")) {
                const text = await (await item.getType("text/plain")).text();
                if (looksLikeCommand(text)) {
                  post("clipboardCommand", { sample: text.slice(0, 120) });
                  return undefined;
                }
              }
            }
          } catch {
            // Fall through to the original write.
          }
          return orig.call(this, items, ...rest);
        }
      );
    }
  } catch {
    // Ignore.
  }

  // copy event handlers: e.clipboardData.setData("text/plain", cmd)
  wrap(DataTransfer.prototype, "setData", (orig) =>
    function (format, data, ...rest) {
      if (/text/i.test(String(format)) && looksLikeCommand(data)) {
        post("clipboardCommand", { sample: String(data).slice(0, 120) });
        return undefined;
      }
      return orig.call(this, format, data, ...rest);
    }
  );

  // Hidden textarea + select() + execCommand("copy")
  wrap(Document.prototype, "execCommand", (orig) =>
    function (command, ...rest) {
      if (String(command).toLowerCase() === "copy") {
        let text = "";
        try {
          const el = document.activeElement;
          text = el && "value" in el && typeof el.value === "string"
            ? el.value.slice(el.selectionStart || 0, el.selectionEnd || el.value.length)
            : String(window.getSelection() || "");
        } catch {
          text = "";
        }
        if (looksLikeCommand(text)) {
          post("clipboardCommand", { sample: text.slice(0, 120) });
          return false;
        }
      }
      return orig.call(this, command, ...rest);
    }
  );
})();
