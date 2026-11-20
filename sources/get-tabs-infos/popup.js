/* global browser */

import * as storage from "./storage.js";
import { getTabsInfos, copyToClipboardAsHTML } from "./tabsinfos.js";
import { getDocElById, saveToFile } from "./helper.js";

const PLACEHOLDERS = [
  "%url",
  "%title",
  "%origin",
  "%pathname",
  "%hostname",
  "%protocol",
  "%port",
  "%search",
  "%linebreak",
];

// show invisible whitespace in the dropdown as dots
function visibleSpaces(str) {
  const dots = (m) => ".".repeat(m.length);
  return str.replace(/^\s+|\s+$/g, dots).replace(/\s{2,}/g, dots);
}

// scope <-> two segmented controls
function getScope() {
  const which = document.querySelector('input[name="which"]:checked').value;
  const win = document.querySelector('input[name="win"]:checked').value;
  return `${which}Tabs${win === "all" ? "AllWindows" : ""}`;
}

function setScope(scope) {
  const which = scope.startsWith("Selected") ? "Selected" : "All";
  const win = scope.endsWith("AllWindows") ? "all" : "current";
  document.querySelector(`input[name="which"][value="${which}"]`).checked = true;
  document.querySelector(`input[name="win"][value="${win}"]`).checked = true;
}

let statusTimer;
function flash(msg) {
  const el = getDocElById("status");
  el.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (el.textContent = ""), 2000);
}

async function loadFormats(selected) {
  const formats = await storage.get("object", "formatStrings", []);
  const sel = getDocElById("formatOptions");
  sel.length = 1; // keep the "Select a format" entry
  formats.forEach((f) => {
    if (typeof f.name === "string") {
      sel.add(new Option(visibleSpaces(f.name), f.name));
    }
  });
  sel.value = selected;
  if (sel.value !== selected || selected === "") {
    // fall back to the first real format
    sel.selectedIndex = sel.options.length > 1 ? 1 : 0;
  }
}

async function updateOutput() {
  const format = getDocElById("formatOptions").value;
  const scope = getScope();
  await storage.set("lastSelectedScope", scope);
  await storage.set("lastSelectedFormat", format);

  const out = getDocElById("output");
  if (format !== "") {
    out.value = await getTabsInfos(scope, format);
  } else {
    out.value = "";
  }
  const lines = out.value.split(/\r?\n/).filter((l) => l !== "").length;
  getDocElById("count").textContent =
    lines === 0 ? "" : `${lines} ${lines === 1 ? "line" : "lines"}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadFormats(await storage.get("string", "lastSelectedFormat", ""));
  setScope(await storage.get("string", "lastSelectedScope", "AllTabs"));
  await updateOutput();

  // placeholder chips insert at the cursor of the "new format" field
  const newEntry = getDocElById("newEntry");
  PLACEHOLDERS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p;
    b.addEventListener("click", () => {
      const start = newEntry.selectionStart ?? newEntry.value.length;
      const end = newEntry.selectionEnd ?? start;
      newEntry.setRangeText(p, start, end, "end");
      newEntry.focus();
    });
    getDocElById("placeholders").append(b);
  });

  // copy / save
  getDocElById("btnCopyAsText").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getDocElById("output").value);
      flash("Copied as text");
    } catch (e) {
      console.error(e);
      flash("Copy failed");
    }
  });
  getDocElById("btnCopyAsHTML").addEventListener("click", async () => {
    try {
      await copyToClipboardAsHTML(getDocElById("output").value);
      flash("Copied as HTML");
    } catch (e) {
      console.error(e);
      flash("Copy failed");
    }
  });
  getDocElById("btnSaveToFile").addEventListener("click", () => {
    saveToFile(
      getDocElById("output").value,
      getDocElById("saveFilename").value,
    );
    flash("Saved");
  });

  // add format
  async function addFormat() {
    const name = newEntry.value;
    if (name === "") {
      return;
    }
    const formats = await storage.get("object", "formatStrings", []);
    formats.unshift({ name });
    await storage.set("formatStrings", formats);
    await loadFormats(name);
    newEntry.value = "";
    getDocElById("addFormat").open = false;
    await updateOutput();
    flash("Format added");
  }
  getDocElById("btnAddFormat").addEventListener("click", addFormat);
  newEntry.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addFormat();
    }
  });

  // delete format: first click arms the button, second click deletes
  const btnDelete = getDocElById("btnDeleteFormat");
  let armTimer;
  function disarm() {
    btnDelete.classList.remove("armed");
    btnDelete.textContent = "🗑";
  }
  btnDelete.addEventListener("click", async () => {
    const selected = getDocElById("formatOptions").value;
    if (selected === "") {
      return;
    }
    if (!btnDelete.classList.contains("armed")) {
      btnDelete.classList.add("armed");
      btnDelete.textContent = "Delete?";
      armTimer = setTimeout(disarm, 3000);
      return;
    }
    clearTimeout(armTimer);
    disarm();
    let formats = await storage.get("object", "formatStrings", []);
    formats = formats.filter((f) => f.name !== selected);
    await storage.set("formatStrings", formats);
    await loadFormats("");
    await updateOutput();
    flash("Format deleted");
  });

  getDocElById("formatOptions").addEventListener("change", () => {
    disarm();
    updateOutput();
  });
  document
    .querySelectorAll('input[name="which"], input[name="win"]')
    .forEach((r) => r.addEventListener("change", updateOutput));
});
