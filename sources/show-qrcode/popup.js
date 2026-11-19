/* global browser QRCode */

import * as storage from "./storage.js";

const qrtype = document.getElementById("qrtype");
const qrtext = document.getElementById("qrtext");
const qrimg = document.getElementById("qrimg");
const qrsvg = document.getElementById("qrsvg");
const qrstatus = document.getElementById("qrstatus");
const qrcharcount = document.getElementById("qrcharcount");

const fieldText = document.getElementById("field-text");
const fieldGeo = document.getElementById("field-geo");
const fieldWifi = document.getElementById("field-wifi");
const geoLat = document.getElementById("geoLat");
const geoLng = document.getElementById("geoLng");
const wifiSsid = document.getElementById("wifiSsid");
const wifiPassword = document.getElementById("wifiPassword");
const wifiSecurity = document.getElementById("wifiSecurity");
const wifiHidden = document.getElementById("wifiHidden");

const settingsPanel = document.getElementById("qrsettings");
const historyPanel = document.getElementById("qrhistorylist");
const qrmain = document.getElementById("qrmain");

const HISTORY_KEY = "qrHistory";
const HISTORY_LIMIT = 8;
const SETTINGS_KEYS = [
  "fgcolor",
  "bgcolor",
  "fgalpha",
  "bgalpha",
  "qrSize",
  "qrPadding",
  "qrecl",
  "saveMode",
];

const TYPE_PLACEHOLDERS = {
  "": "https://example.com or any text",
  "mailto:": "name@example.com",
  "tel:": "+1 555 555 5555",
};

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Parses an SVG string and inserts it as a real DOM node, avoiding
// innerHTML (which parses as HTML, not SVG, and can execute embedded
// scripts/handlers if the string were ever untrusted).
function setSvgContent(container, svgString) {
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  const svgEl = doc.documentElement;

  container.textContent = "";
  if (svgEl && svgEl.nodeName.toLowerCase() === "svg") {
    container.appendChild(svgEl);
  }
}

function escapeWifiField(value) {
  return value.replace(/([\\;,":])/g, "\\$1");
}

function makeFilename(content, mode) {
  const base = content
    .replace(/^[a-z]+:/i, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return (base || "qrcode") + "." + mode;
}

// Returns the full QR payload string, or null if the current type's
// required fields aren't filled in yet.
function getComposedContent() {
  const type = qrtype.value;

  if (type === "geo:") {
    const lat = geoLat.value.trim();
    const lng = geoLng.value.trim();
    return lat !== "" && lng !== "" ? `geo:${lat},${lng}` : null;
  }

  if (type === "WIFI:") {
    const ssid = wifiSsid.value.trim();
    if (ssid === "") {
      return null;
    }
    const security = wifiSecurity.value;
    const parts = [`T:${security}`, `S:${escapeWifiField(ssid)}`];
    if (security !== "nopass") {
      parts.push(`P:${escapeWifiField(wifiPassword.value)}`);
    }
    parts.push(`H:${wifiHidden.checked ? "true" : "false"}`);
    return `WIFI:${parts.join(";")};`;
  }

  const raw = qrtext.value.trim();
  return raw === "" ? null : type + qrtext.value;
}

function updateFieldVisibility() {
  const type = qrtype.value;
  const isTextType = type === "" || type === "mailto:" || type === "tel:";

  fieldText.hidden = !isTextType;
  fieldGeo.hidden = type !== "geo:";
  fieldWifi.hidden = type !== "WIFI:";

  if (isTextType) {
    qrtext.placeholder = TYPE_PLACEHOLDERS[type] || "";
  }
}

function updateCharCount() {
  qrcharcount.textContent = `${qrtext.value.length} characters`;
}

async function updateQRCode() {
  const content = getComposedContent();

  if (content === null) {
    qrimg.removeAttribute("src");
    qrimg.style.opacity = "1";
    qrsvg.textContent = "";
    qrstatus.textContent = "Enter the details above to generate a QR code.";
    qrstatus.classList.remove("error");
    return;
  }

  const fgcolorBase = await storage.get("string", "fgcolor", "#000000");
  const fgalpha = parseInt(await storage.get("string", "fgalpha", "255"));
  const bgcolorBase = await storage.get("string", "bgcolor", "#ffffff");
  const bgalpha = parseInt(await storage.get("string", "bgalpha", "255"));
  const qrSize = await storage.get("number", "qrSize", 460);
  const qrPadding = await storage.get("number", "qrPadding", 1);
  const qrecl = await storage.get("string", "qrecl", "M");
  const mode = await storage.get("string", "saveMode", "png");

  let fgcolor = fgcolorBase + fgalpha.toString(16);
  let bgcolor = bgcolorBase + bgalpha.toString(16);
  if (fgcolor.length < 9) fgcolor += "0";
  if (bgcolor.length < 9) bgcolor += "0";

  const body = document.body,
    html = document.documentElement;
  const w = Math.max(
    body.scrollWidth,
    body.offsetWidth,
    html.clientWidth,
    html.scrollWidth,
    html.offsetWidth,
  );

  let svg;
  try {
    const qrcode = new QRCode({
      content,
      padding: qrPadding,
      width: w - w / 4,
      height: w - w / 4,
      color: fgcolor,
      background: bgcolor,
      ecl: qrecl,
    });
    svg = qrcode.svg();
  } catch (e) {
    console.error(e);
    qrstatus.textContent =
      "Can't generate a QR code for this input — try shorter text or a lower error-correction level.";
    qrstatus.classList.add("error");
    return;
  }

  qrstatus.textContent = "";
  qrstatus.classList.remove("error");
  setSvgContent(qrsvg, svg);

  const svgImage = document.createElement("img");
  svgImage.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = qrSize;
    canvas.height = qrSize;
    const canvasCtx = canvas.getContext("2d");
    canvasCtx.drawImage(svgImage, 0, 0, qrSize, qrSize);
    qrimg.filename = makeFilename(content, mode);
    qrimg.src = canvas.toDataURL("image/png");
    qrimg.style.opacity = "1";
    URL.revokeObjectURL(svgImage.src);
    canvas.remove();
    svgImage.remove();
  };
  svgImage.src = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml" }),
  );
}

const debouncedUpdateQRCode = debounce(updateQRCode, 200);

function onEditableInput() {
  // Fade the current image slightly so a fast typist can see a
  // refresh is pending, without the flash of an empty/stale image.
  qrimg.style.opacity = "0.5";
  debouncedUpdateQRCode();
}

// --- type switching -------------------------------------------------

qrtype.addEventListener("change", () => {
  browser.storage.local.set({ qrLastType: qrtype.value }).catch(console.error);
  updateFieldVisibility();
  updateQRCode();
});

qrtext.addEventListener("input", () => {
  updateCharCount();
  onEditableInput();
});
geoLat.addEventListener("input", onEditableInput);
geoLng.addEventListener("input", onEditableInput);
wifiSsid.addEventListener("input", onEditableInput);
wifiPassword.addEventListener("input", onEditableInput);
wifiSecurity.addEventListener("change", onEditableInput);
wifiHidden.addEventListener("change", onEditableInput);

document.getElementById("wifiTogglePassword").addEventListener(
  "click",
  () => {
    wifiPassword.type = wifiPassword.type === "password" ? "text" : "password";
  },
  false,
);

// --- color pickers ----------------------------------------------------
//
// Firefox's transient toolbar popup closes as soon as focus leaves it,
// and a native <input type="color"> hands focus to the OS color
// dialog — which closes the popup before a color can be picked. So
// instead we use a plain hex text field plus a preset swatch palette,
// neither of which ever leaves the page.

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function setupColorPicker(hexInputId, swatchId) {
  const hexInput = document.getElementById(hexInputId);
  const swatch = document.getElementById(swatchId);

  function refreshSwatch() {
    const valid = HEX_COLOR_RE.test(hexInput.value);
    hexInput.classList.toggle("invalid", !valid);
    if (valid) {
      swatch.style.background = hexInput.value;
    }
  }

  // settings.js also loads this field's stored value, but does so
  // asynchronously — read it ourselves too so the swatch preview is
  // correct immediately rather than racing that load.
  storage.get("string", hexInputId, hexInput.value).then((stored) => {
    if (HEX_COLOR_RE.test(stored)) {
      hexInput.value = stored;
    }
    refreshSwatch();
  });

  hexInput.addEventListener("input", refreshSwatch);

  document
    .querySelectorAll(
      `.swatch-palette[data-target="${hexInputId}"] .swatch-btn`,
    )
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        hexInput.value = btn.dataset.color;
        refreshSwatch();
        // settings.js listens for "input" to persist the value; the
        // palette click needs to trigger the same save path.
        hexInput.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
}

setupColorPicker("fgcolor", "fgcolorSwatch");
setupColorPicker("bgcolor", "bgcolorSwatch");

// --- settings & history panels --------------------------------------
//
// Only one of {qrmain, settingsPanel, historyPanel} is visible at a
// time, so opening a panel replaces the QR view entirely rather than
// growing the popup and pushing content down.

function hidePanels() {
  settingsPanel.hidden = true;
  historyPanel.hidden = true;
  qrmain.hidden = false;
}

function showPanel(panel) {
  settingsPanel.hidden = true;
  historyPanel.hidden = true;
  qrmain.hidden = true;
  panel.hidden = false;
}

document.getElementById("qroptions").addEventListener("click", () => {
  if (settingsPanel.hidden) {
    showPanel(settingsPanel);
  } else {
    hidePanels();
  }
});

document.getElementById("qrhistory").addEventListener("click", async () => {
  if (historyPanel.hidden) {
    await loadHistory();
    showPanel(historyPanel);
  } else {
    hidePanels();
  }
});

// Quick-settings fields are wired up by settings.js, which persists
// each field to the same storage keys the QR renderer reads from. We
// just need to react when any of them change.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (Object.keys(changes).some((k) => SETTINGS_KEYS.includes(k))) {
    debouncedUpdateQRCode();
  }
});

// --- history ----------------------------------------------------------

async function addToHistory(content) {
  if (!content) return;
  const { [HISTORY_KEY]: existing = [] } =
    await browser.storage.local.get(HISTORY_KEY);
  const filtered = existing.filter((e) => e.content !== content);
  filtered.unshift({ content, savedAt: Date.now() });
  const trimmed = filtered.slice(0, HISTORY_LIMIT);
  await browser.storage.local.set({ [HISTORY_KEY]: trimmed });
}

async function loadHistory() {
  const { [HISTORY_KEY]: entries = [] } =
    await browser.storage.local.get(HISTORY_KEY);
  renderHistory(entries);
}

function renderHistory(entries) {
  const heading = historyPanel.querySelector("h3");
  historyPanel.textContent = "";
  historyPanel.appendChild(heading);

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent =
      "No recent codes yet — Copy or Save one to see it here.";
    historyPanel.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-item";
    btn.textContent =
      entry.content.length > 44
        ? entry.content.slice(0, 44) + "…"
        : entry.content;
    btn.title = entry.content;
    btn.addEventListener("click", () => restoreFromHistory(entry.content));
    historyPanel.appendChild(btn);
  }

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "history-clear";
  clearBtn.textContent = "Clear history";
  clearBtn.addEventListener("click", async () => {
    await browser.storage.local.set({ [HISTORY_KEY]: [] });
    renderHistory([]);
  });
  historyPanel.appendChild(clearBtn);
}

function restoreFromHistory(content) {
  qrtype.value = "";
  updateFieldVisibility();
  qrtext.value = content;
  updateCharCount();
  hidePanels();
  updateQRCode();
  qrtext.focus();
}

// --- actions ------------------------------------------------------------

const BOARD_KEY = "qrBoard";

// Shared by addToBoard() (current composed content) and
// addSelectedTabsToBoard() (one entry per highlighted tab): renders
// with the current quick-settings and pushes a new board entry unless
// an identical one (same content + render settings) already exists.
async function pushToBoard(board, content) {
  const fgcolorBase = await storage.get("string", "fgcolor", "#000000");
  const fgalpha = parseInt(await storage.get("string", "fgalpha", "255"));
  const bgcolorBase = await storage.get("string", "bgcolor", "#ffffff");
  const bgalpha = parseInt(await storage.get("string", "bgalpha", "255"));
  const qrPadding = await storage.get("number", "qrPadding", 1);
  const qrecl = await storage.get("string", "qrecl", "M");

  let fg = fgcolorBase + fgalpha.toString(16);
  let bg = bgcolorBase + bgalpha.toString(16);
  if (fg.length < 9) fg += "0";
  if (bg.length < 9) bg += "0";

  const alreadyOnBoard = board.some(
    (e) =>
      e.content === content &&
      e.fg === fg &&
      e.bg === bg &&
      e.padding === qrPadding &&
      e.ecl === qrecl,
  );
  if (alreadyOnBoard) {
    return false;
  }
  board.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content,
    fg,
    bg,
    padding: qrPadding,
    ecl: qrecl,
    addedAt: Date.now(),
  });
  return true;
}

async function addToBoard() {
  const content = getComposedContent();
  if (content === null) {
    // updateQRCode() already shows an "enter details" status in this
    // case, so there's nothing more to do.
    return;
  }

  const { [BOARD_KEY]: board = [] } =
    await browser.storage.local.get(BOARD_KEY);
  await pushToBoard(board, content);
  await browser.storage.local.set({ [BOARD_KEY]: board });

  addToHistory(content);
  browser.runtime
    .sendMessage({ action: "focusOrOpenBoard" })
    .catch(console.error);
}

document.getElementById("qrboard").addEventListener("click", addToBoard, false);

// --- multiple tabs selected -> one QR code per tab, straight to board --

const qrmultitab = document.getElementById("qrmultitab");
const qraddtabs = document.getElementById("qraddtabs");

async function addSelectedTabsToBoard() {
  const tabs = await browser.tabs.query({
    highlighted: true,
    currentWindow: true,
  });
  const urls = tabs
    .map((t) => t.url)
    .filter((u) => typeof u === "string" && u !== "");
  if (urls.length === 0) return;

  const originalLabel = qraddtabs.textContent;
  qraddtabs.disabled = true;
  qraddtabs.textContent = "Adding…";

  const { [BOARD_KEY]: board = [] } =
    await browser.storage.local.get(BOARD_KEY);
  let added = 0;
  for (const url of urls) {
    if (await pushToBoard(board, url)) {
      added++;
      addToHistory(url);
    }
  }
  if (added > 0) {
    await browser.storage.local.set({ [BOARD_KEY]: board });
  }

  browser.runtime
    .sendMessage({ action: "focusOrOpenBoard" })
    .catch(console.error);

  qraddtabs.textContent = originalLabel;
  qraddtabs.disabled = false;
}

qraddtabs.addEventListener("click", addSelectedTabsToBoard, false);

async function updateMultiTabBar() {
  try {
    const tabs = await browser.tabs.query({
      highlighted: true,
      currentWindow: true,
    });
    if (tabs.length > 1) {
      qraddtabs.textContent = `\u2795 Add ${tabs.length} selected tabs to board`;
      qrmultitab.hidden = false;
    } else {
      qrmultitab.hidden = true;
    }
  } catch (e) {
    console.error(e);
    qrmultitab.hidden = true;
  }
}

document.getElementById("qrsave").addEventListener(
  "click",
  async function () {
    const mode = await storage.get("string", "saveMode", "png");
    let a = document.createElement("a");
    a.download = qrimg.filename;

    if (mode === "png") {
      a.href = qrimg.src;
      a.click();
    } else if (mode === "svg") {
      a.href = URL.createObjectURL(
        new Blob([qrsvg.innerHTML], { type: "image/svg+xml" }),
      );
      a.click();
      URL.revokeObjectURL(a.href);
    }
    a.remove();

    addToHistory(getComposedContent());
  },
  false,
);

document.getElementById("qrcopy").addEventListener(
  "click",
  async function (evt) {
    const button = evt.currentTarget;
    const originalLabel = button.textContent;

    try {
      const response = await fetch(qrimg.src);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      button.textContent = "Copied!";
      addToHistory(getComposedContent());
    } catch (e) {
      console.error(e);
      // Fallback for environments where Clipboard API image writes
      // aren't available: select-and-copy the rendered <img>.
      try {
        qrimg.contentEditable = "true";
        document.getSelection().removeAllRanges();
        let range = document.createRange();
        range.selectNode(qrimg);
        document.getSelection().addRange(range);
        document.execCommand("copy");
        qrimg.contentEditable = "false";
        button.textContent = "Copied!";
        addToHistory(getComposedContent());
      } catch (e2) {
        console.error(e2);
        button.textContent = "Copy failed";
      }
    }

    setTimeout(() => {
      button.textContent = originalLabel;
    }, 1200);
  },
  false,
);

// --- initial load ---------------------------------------------------

async function onLoad() {
  updateMultiTabBar();

  const lastType = await storage.get("string", "qrLastType", "");
  if (lastType !== "") {
    qrtype.value = lastType;
  }
  updateFieldVisibility();

  const response = await browser.runtime.sendMessage({});
  const m = (response && response.clickData) || undefined;
  const reopenContent = response && response.reopenContent;

  if (typeof reopenContent === "string" && reopenContent !== "") {
    // Reopened from the board: the stored string already has any
    // type prefix (geo:, WIFI:, ...) baked in, so type "" + this
    // text reproduces the exact original content, same as restoring
    // from history.
    qrtype.value = "";
    updateFieldVisibility();
    qrtext.value = reopenContent;
    updateCharCount();
    updateQRCode();
    qrtext.focus();
    qrtext.select();
    return;
  }

  let value = "";
  if (typeof m === "object") {
    if (m.bookmarkId) {
      value = (await browser.bookmarks.get(m.bookmarkId))[0].url;
    } else {
      //  1. text, 2. linkUrl (a) , 3. srcUrl (img), 4. pageUrl
      for (let b of ["selectionText", "linkUrl", "srcUrl", "pageUrl"]) {
        if (typeof m[b] === "string" && m[b].trim() !== "") {
          value = m[b].trim();
          if (b === "selectionText" && m.type) {
            value = m.type + ":" + value;
          }
          break;
        }
      }
    }
  }

  if (value === "") {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    try {
      const res_selected_text = await browser.tabs.executeScript({
        code: `window.getSelection().toString()`,
      });

      if (
        Array.isArray(res_selected_text) &&
        res_selected_text.length === 1 &&
        typeof res_selected_text[0] === "string" &&
        res_selected_text[0].trim() !== ""
      ) {
        value = res_selected_text[0];
      } else {
        value = tabs[0].url;
      }
    } catch (e) {
      console.error(e);
      value = tabs[0].url;
    }
  }

  qrtext.value = value;
  updateCharCount();
  updateQRCode();

  qrtext.focus();
  qrtext.select();
}

document.addEventListener("DOMContentLoaded", onLoad);
