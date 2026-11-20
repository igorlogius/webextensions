/* global browser, CM */

import * as storage from "./storage.js";
import { copyToClipboardAsHTML } from "./tabsinfos.js";

const impbtnWrp = document.getElementById("impbtn_wrapper");
const impbtn = document.getElementById("impbtn");

/* ============================================================
 * Tabs
 * ============================================================ */

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    document
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

/* ============================================================
 * Scripts: master-detail state
 *
 * Each script object is { _id, code }. _id is a client-side-only
 * identifier (never sent to storage) that lets us track "is this
 * dirty / was this saved" by identity rather than array index, so
 * reordering, bulk delete, and import don't confuse the diffing.
 * ============================================================ */

let scripts = [];
let savedScripts = new Map(); // id -> last-saved code
let checkedIds = new Set(); // ids currently checked for bulk actions
let selectedId = null;
let nextId = 1;

function makeScript(code) {
  return { _id: nextId++, code: code || "" };
}

function findIndexById(id) {
  return scripts.findIndex((s) => s._id === id);
}

function snapshotSaved() {
  savedScripts = new Map(scripts.map((s) => [s._id, s.code]));
}

function isScriptDirty(script) {
  if (!savedScripts.has(script._id)) return true; // never saved
  return savedScripts.get(script._id) !== script.code;
}

function hasUnsavedChanges() {
  const currentIds = new Set(scripts.map((s) => s._id));
  for (const id of savedScripts.keys()) {
    if (!currentIds.has(id)) return true; // something saved was deleted
  }
  return scripts.some((s) => isScriptDirty(s));
}

function refreshUnsavedIndicators() {
  const dirty = hasUnsavedChanges();
  document.getElementById("savetable").classList.toggle("has-changes", dirty);
  document.getElementById("unsavedNote").style.display = dirty ? "" : "none";
}

let cmView = null;
let CM_basicSetup, CM_EditorView, CM_keymap, CM_EditorState, CM_javascript;

function initCodeMirrorRefs() {
  ({ basicSetup: CM_basicSetup } = CM["codemirror"]);
  ({ EditorView: CM_EditorView, keymap: CM_keymap } = CM["@codemirror/view"]);
  ({ EditorState: CM_EditorState } = CM["@codemirror/state"]);
  ({ javascript: CM_javascript } = CM["@codemirror/lang-javascript"]);
}

function scriptTitle(code) {
  const firstLine = (code || "").split("\n")[0].trim();
  return firstLine !== "" ? firstLine : "(untitled script)";
}

/* ---------------- list rendering + selection ---------------- */

function renderScriptsList() {
  const list = document.getElementById("scriptsList");
  list.innerHTML = "";

  scripts.forEach((s) => {
    const li = document.createElement("li");
    if (s._id === selectedId) {
      li.classList.add("selected");
    }

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "script-check";
    check.checked = checkedIds.has(s._id);
    check.title = "Select for bulk actions";
    check.addEventListener("click", (evt) => evt.stopPropagation());
    check.addEventListener("change", () => {
      if (check.checked) {
        checkedIds.add(s._id);
      } else {
        checkedIds.delete(s._id);
      }
      refreshBulkBar();
    });

    const selectBtn = document.createElement("button");
    selectBtn.className = "script-select-btn";
    selectBtn.title = scriptTitle(s.code);
    if (isScriptDirty(s)) {
      const dot = document.createElement("span");
      dot.className = "dirty-dot";
      dot.title = "Unsaved changes";
      selectBtn.appendChild(dot);
    }
    selectBtn.appendChild(document.createTextNode(scriptTitle(s.code)));
    selectBtn.addEventListener("click", () => selectScript(s._id));

    const exportBtn = document.createElement("button");
    exportBtn.className = "script-export-btn";
    exportBtn.textContent = "⬇";
    exportBtn.title = "Export this script";
    exportBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      exportScripts([s.code], scriptTitle(s.code));
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "script-delete-btn";
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "Delete this script";
    deleteBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      deleteScriptById(s._id);
    });

    li.appendChild(check);
    li.appendChild(selectBtn);
    li.appendChild(exportBtn);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });

  refreshUnsavedIndicators();
  refreshBulkBar();
  refreshSelectAllCheckbox();
}

function refreshBulkBar() {
  const count = checkedIds.size;
  document.getElementById("bulkCount").textContent =
    count + (count === 1 ? " selected" : " selected");
  document.getElementById("bulkExportBtn").disabled = count === 0;
  document.getElementById("bulkResetBtn").disabled = count === 0;
  document.getElementById("bulkDeleteBtn").disabled = count === 0;
}

function refreshSelectAllCheckbox() {
  const cb = document.getElementById("selectAllCheckbox");
  cb.checked = scripts.length > 0 && checkedIds.size === scripts.length;
  cb.indeterminate = checkedIds.size > 0 && checkedIds.size < scripts.length;
}

function mountEditor(id) {
  const host = document.getElementById("editorHost");
  host.innerHTML = "";

  if (cmView) {
    cmView.destroy();
    cmView = null;
  }

  const idx = findIndexById(id);
  if (idx < 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No script selected. Click “New Script” to create one.";
    host.appendChild(empty);
    return;
  }

  const state = CM_EditorState.create({
    doc: scripts[idx].code,
    extensions: [
      CM_keymap.of([{ key: "Ctrl-Enter", run: () => (runScript(), true) }]),
      CM_basicSetup,
      CM_javascript(),
    ],
  });

  cmView = new CM_EditorView({
    state,
    parent: host,
    dispatch: (transaction) => {
      cmView.update([transaction]);
      if (transaction.docChanged) {
        const i = findIndexById(id);
        if (i >= 0) {
          scripts[i].code = cmView.state.doc.toString();
          renderScriptsList();
        }
      }
    },
  });
}

function selectScript(id) {
  selectedId = id;
  renderScriptsList();
  mountEditor(id);
}

function addScript() {
  const code =
    '/* new script */\n(() => {\n    return "Hello World!\\n";\n})()';
  const s = makeScript(code);
  scripts.push(s);
  selectScript(s._id);
}

function deleteScriptById(id) {
  const idx = findIndexById(id);
  if (idx < 0) return;

  scripts.splice(idx, 1);
  checkedIds.delete(id);

  if (selectedId === id) {
    const next = scripts[idx] || scripts[idx - 1] || null;
    selectedId = next ? next._id : null;
  }

  renderScriptsList();
  mountEditor(selectedId);
}

function resetScriptById(id) {
  const idx = findIndexById(id);
  if (idx < 0) return;
  const script = scripts[idx];

  if (!savedScripts.has(id)) {
    if (
      confirm(
        "This script hasn't been saved yet, so there's nothing to revert to.\nRemove it instead?",
      )
    ) {
      deleteScriptById(id);
    }
    return;
  }

  const savedCode = savedScripts.get(id);
  if (script.code === savedCode) {
    return; // already matches the saved version
  }

  script.code = savedCode;
  if (selectedId === id) {
    mountEditor(id);
  }
  renderScriptsList();
}

async function runScript() {
  const idx = findIndexById(selectedId);
  if (idx < 0) {
    return;
  }

  const code = scripts[idx].code;
  let tmp = "";
  let out = [];

  const tabs = await browser.tabs.query({
    active: false,
    highlighted: true,
    currentWindow: true,
    url: "<all_urls>",
    discarded: false,
    status: "complete",
  });

  if (tabs.length < 1) {
    alert(
      "[Error]: No tabs with a valid url selected in this window!\nPlease select at least one tab with a real URL before clicking the ▶️  button.",
    );
    return;
  }

  for (const tab of tabs) {
    try {
      tmp = await browser.tabs.executeScript(tab.id, {
        code: `${code}`,
      });
      tmp = tmp[0];
    } catch (e) {
      tmp = e.toString() + " " + tab.url + "\n";
    }
    out.push(tmp);
  }

  const outputPanel = document.getElementById("outputPanel");
  outputPanel.classList.add("visible");
  document.querySelector("#output").value = out.join("");
}

/* ============================================================
 * Save / Discard / Import / Export
 * ============================================================ */

async function saveTable() {
  const cleaned = scripts
    .map((s) => ({ code: (s.code || "").trim() }))
    .filter((s) => s.code !== "");
  await browser.storage.local.set({ selectors: cleaned });
}

async function loadScriptsFromStorage() {
  const res = await browser.storage.local.get("selectors");
  scripts = Array.isArray(res.selectors)
    ? res.selectors.map((s) => makeScript(s.code))
    : [];
}

async function restoreOptions() {
  await loadScriptsFromStorage();
  snapshotSaved();
  checkedIds.clear();
  selectedId = scripts.length > 0 ? scripts[0]._id : null;
  renderScriptsList();
  mountEditor(selectedId);
}

document.addEventListener("DOMContentLoaded", () => {
  initCodeMirrorRefs();
  restoreOptions();
  initSidebarResizer();
});

/* ---------------- sidebar drag-to-resize ---------------- */

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;

async function initSidebarResizer() {
  const resizer = document.getElementById("sidebarResizer");
  const savedWidth = await storage.get("number", "sidebarWidth", null);
  if (savedWidth !== null) {
    document.documentElement.style.setProperty(
      "--sidebar-w",
      clampSidebarWidth(savedWidth) + "px",
    );
  }

  let startX = 0;
  let startWidth = 0;

  function onPointerMove(evt) {
    const delta = evt.clientX - startX;
    const newWidth = clampSidebarWidth(startWidth + delta);
    document.documentElement.style.setProperty("--sidebar-w", newWidth + "px");
  }

  function onPointerUp() {
    resizer.classList.remove("dragging");
    document.removeEventListener("mousemove", onPointerMove);
    document.removeEventListener("mouseup", onPointerUp);

    const finalWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--sidebar-w",
      ),
      10,
    );
    if (!isNaN(finalWidth)) {
      storage.set("sidebarWidth", finalWidth);
    }
  }

  resizer.addEventListener("mousedown", (evt) => {
    evt.preventDefault();
    startX = evt.clientX;
    startWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--sidebar-w",
      ),
      10,
    );
    resizer.classList.add("dragging");
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", onPointerUp);
  });

  resizer.addEventListener("dblclick", () => {
    document.documentElement.style.setProperty("--sidebar-w", "300px");
    storage.set("sidebarWidth", 300);
  });
}

function clampSidebarWidth(w) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w));
}

document.getElementById("addScriptBtn").addEventListener("click", addScript);
document.getElementById("runScriptBtn").addEventListener("click", runScript);
document.getElementById("resetScriptBtn").addEventListener("click", () => {
  if (selectedId !== null) resetScriptById(selectedId);
});

document
  .getElementById("reloadWithoutSavingBtn")
  .addEventListener("click", () => {
    if (
      confirm(
        "Reload the page and discard ALL unsaved changes, including deleted scripts and newly added ones that were never saved?",
      )
    ) {
      location.reload();
    }
  });

/* ---------------- fullscreen editor+output toggle ---------------- */

const scriptsColumnEl = document.querySelector(".scripts-main-column");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const fullscreenBackdrop = document.getElementById("fullscreenBackdrop");

function setEditorFullscreen(on) {
  scriptsColumnEl.classList.toggle("fullscreen", on);
  fullscreenBackdrop.style.display = on ? "block" : "none";
  document.body.style.overflow = on ? "hidden" : "";
  fullscreenBtn.textContent = on ? "⤡ Exit Fullscreen" : "⤢ Fullscreen";
  fullscreenBtn.title = on
    ? "Exit fullscreen"
    : "Expand editor and output to fullscreen";

  if (cmView) {
    cmView.requestMeasure();
  }
}

fullscreenBtn.addEventListener("click", () => {
  setEditorFullscreen(!scriptsColumnEl.classList.contains("fullscreen"));
});

fullscreenBackdrop.addEventListener("click", () => setEditorFullscreen(false));

document.addEventListener("keydown", (evt) => {
  if (
    evt.key === "Escape" &&
    scriptsColumnEl.classList.contains("fullscreen")
  ) {
    setEditorFullscreen(false);
  }
});

document.querySelector("#savetable").addEventListener("click", () => {
  if (confirm("Are you sure?\nThis will Save the scripts as they are now")) {
    saveTable();
    location.reload();
  }
});

/* ---------------- select-all + bulk actions ---------------- */

document
  .getElementById("selectAllCheckbox")
  .addEventListener("change", (evt) => {
    if (evt.target.checked) {
      scripts.forEach((s) => checkedIds.add(s._id));
    } else {
      checkedIds.clear();
    }
    renderScriptsList();
  });

document.getElementById("bulkDeleteBtn").addEventListener("click", () => {
  const count = checkedIds.size;
  if (count === 0) return;
  if (!confirm(`Delete ${count} selected script(s)?`)) return;

  const idsToDelete = new Set(checkedIds);
  const wasSelectedDeleted = selectedId !== null && idsToDelete.has(selectedId);

  scripts = scripts.filter((s) => !idsToDelete.has(s._id));
  checkedIds.clear();

  if (wasSelectedDeleted) {
    selectedId = scripts.length > 0 ? scripts[0]._id : null;
  }

  renderScriptsList();
  mountEditor(selectedId);
});

document.getElementById("bulkResetBtn").addEventListener("click", () => {
  const count = checkedIds.size;
  if (count === 0) return;

  const resettable = Array.from(checkedIds).filter((id) =>
    savedScripts.has(id),
  );
  const neverSaved = checkedIds.size - resettable.length;

  let proceed = confirm(
    `Reset ${resettable.length} selected script(s) to their last saved version?` +
      (neverSaved > 0
        ? `\n(${neverSaved} of the selected scripts have never been saved and will be left as-is.)`
        : ""),
  );
  if (!proceed) return;

  resettable.forEach((id) => {
    const idx = findIndexById(id);
    if (idx >= 0) {
      scripts[idx].code = savedScripts.get(id);
    }
  });

  if (selectedId !== null && checkedIds.has(selectedId)) {
    mountEditor(selectedId);
  }
  renderScriptsList();
});

/* ---------------- import (always appends) / export ---------------- */

impbtnWrp.addEventListener("click", function () {
  impbtn.click();
});

impbtn.addEventListener("input", function () {
  const file = this.files[0];
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const parsed = JSON.parse(reader.result);
      let toAdd = [];
      if (Array.isArray(parsed)) {
        toAdd = parsed.filter((s) => s && typeof s.code === "string");
      } else if (parsed && typeof parsed.code === "string") {
        toAdd = [parsed];
      }
      if (toAdd.length === 0) {
        alert("No valid script(s) found in that file.");
        return;
      }
      const added = toAdd.map((s) => makeScript(s.code));
      scripts = scripts.concat(added);
      selectScript(added[0]._id);
    } catch (e) {
      console.error("error loading file: " + e);
      alert("Could not read that file as script JSON.");
    }
  };
  reader.readAsText(file);
  this.value = "";
});

/* ---------------- export (per-script icon + bulk) ---------------- */

function slugify(text) {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "script";
}

function exportScripts(codes, filenameHint) {
  if (!codes || codes.length === 0) return;
  const dl = document.createElement("a");
  const content = JSON.stringify(
    codes.map((code) => ({ code })),
    null,
    4,
  );
  const filename =
    codes.length === 1
      ? slugify(filenameHint) + ".json"
      : "gather-from-tabs_export_" + codes.length + "_scripts.json";
  dl.setAttribute(
    "href",
    "data:application/json;charset=utf-8," + encodeURIComponent(content),
  );
  dl.setAttribute("download", filename);
  dl.setAttribute("visibility", "hidden");
  dl.setAttribute("display", "none");
  document.body.appendChild(dl);
  dl.click();
  document.body.removeChild(dl);
}

document.getElementById("bulkExportBtn").addEventListener("click", () => {
  const codes = scripts.filter((s) => checkedIds.has(s._id)).map((s) => s.code);
  exportScripts(codes, "scripts");
});

document.getElementById("btn_copy_as_html").addEventListener("click", () => {
  copyToClipboardAsHTML(document.querySelector("#output").value);
});

document.getElementById("btn_copy_as_text").addEventListener("click", () => {
  navigator.clipboard.writeText(document.querySelector("#output").value);
});

/* ============================================================
 * Shortcuts tab (unchanged behavior, scoped to its own tbody)
 * ============================================================ */

let shortcutconfig;

async function saveConfig() {
  shortcutconfig = [];

  Array.from(document.querySelectorAll("#shortcutconfigs tbody tr")).forEach(
    (tr) => {
      let tmp = Array.from(tr.querySelectorAll("select")).map((e) => e.value);
      shortcutconfig.push({ format: tmp[0], scope: tmp[1], action: tmp[2] });
    },
  );

  storage.set("shortcutconfig", shortcutconfig);
}

async function restoreConfig() {
  const shortcutconfig = await storage.get("object", "shortcutconfig", []);

  if (shortcutconfig.length > 0) {
    Array.from(document.querySelectorAll("#shortcutconfigs tbody tr")).forEach(
      (tr) => {
        const selects = tr.querySelectorAll("select");

        selects[0].value = shortcutconfig[0].format;
        selects[1].value = shortcutconfig[0].scope;
        selects[2].value = shortcutconfig[0].action;

        shortcutconfig.shift();
      },
    );
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  let formatStrings = await storage.get("object", "selectors", []);

  let formatlists = document.querySelectorAll('select[name="formatlist"]');

  formatlists.forEach((fl) => {
    fl.add(new Option("-- Script --", ""));
    formatStrings.forEach((feed, index) => {
      Object.keys(feed).forEach((key) => {
        if (key === "code") {
          fl.add(new Option(feed[key].split("\n")[0].trim(), index));
        }
      });
    });
  });

  let scopelists = document.querySelectorAll('select[name="scopelist"]');

  scopelists.forEach((sl) => {
    sl.add(new Option("-- Scope --", ""));
    sl.add(new Option("Current Window", "AllTabs"));
    sl.add(new Option("Selected Current Window ", "SelectedTabs"));
    sl.add(new Option("All Windows", "AllTabsAllWindows"));
    sl.add(new Option("Selected All Windows", "SelectedTabsAllWindows"));
  });

  let actionlists = document.querySelectorAll('select[name="actionlist"]');

  actionlists.forEach((al) => {
    al.add(new Option("-- Action --", ""));
    al.add(new Option("Copy as Text", "ct"));
    al.add(new Option("Copy as HTML", "ch"));
    al.add(new Option("Save Output as File", "s"));
    al.add(new Option("Download as Files", "dl"));
    al.add(new Option("Open Window", "ow"));
    al.add(new Option("Ignore Output", "dn"));
  });

  Array.from(document.querySelectorAll("select")).forEach((select) => {
    select.addEventListener("change", saveConfig);
  });
  document
    .getElementById("btnOpenShortcutSettings")
    .addEventListener("click", () => {
      browser.commands.openShortcutSettings();
    });

  restoreConfig();
});
