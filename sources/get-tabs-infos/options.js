/* global browser */

import * as storage from "./storage.js";
import { getDocElById } from "./helper.js";

const ROW_COUNT = 12; // must match the number of "commands" in manifest.json

const SCOPES = [
  ["AllTabs", "All tabs, this window"],
  ["SelectedTabs", "Selected tabs, this window"],
  ["AllTabsAllWindows", "All tabs, all windows"],
  ["SelectedTabsAllWindows", "Selected tabs, all windows"],
];

const ACTIONS = [
  ["ct", "Copy as text"],
  ["ch", "Copy as HTML"],
  ["s", "Save to file"],
];

let statusTimer;
function flash(msg) {
  const el = getDocElById("status");
  el.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (el.textContent = ""), 1500);
}

function makeSelect(label, placeholder, entries, value) {
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", label);
  sel.add(new Option(placeholder, ""));
  entries.forEach(([v, text]) => sel.add(new Option(text, v)));
  sel.value = value;
  if (sel.value !== value) {
    sel.value = ""; // stored value no longer exists (e.g. deleted format)
  }
  sel.addEventListener("change", saveConfig);
  return sel;
}

async function saveConfig() {
  const shortcutconfig = Array.from(
    document.querySelectorAll("#rows tr"),
  ).map((tr) => {
    const [format, scope, action] = Array.from(
      tr.querySelectorAll("select"),
    ).map((s) => s.value);
    return { format, scope, action };
  });
  await storage.set("shortcutconfig", shortcutconfig);
  flash("Saved");
}

document.addEventListener("DOMContentLoaded", async () => {
  const formatStrings = await storage.get("object", "formatStrings", []);
  const formatEntries = formatStrings
    .filter((f) => typeof f.name === "string")
    .map((f) => [f.name, f.name]);
  const saved = await storage.get("object", "shortcutconfig", []);

  const tbody = getDocElById("rows");
  for (let i = 0; i < ROW_COUNT; i++) {
    const cfg = saved[i] || {};
    const tr = document.createElement("tr");

    const num = document.createElement("td");
    num.className = "num";
    num.textContent = `Custom Action ${i + 1}`;
    tr.append(num);

    [
      makeSelect("Format", "Choose a format", formatEntries, cfg.format || ""),
      makeSelect("Scope", "Choose tabs", SCOPES, cfg.scope || ""),
      makeSelect("Action", "Choose an action", ACTIONS, cfg.action || ""),
    ].forEach((sel) => {
      const td = document.createElement("td");
      td.append(sel);
      tr.append(td);
    });

    tbody.append(tr);
  }

  // opens Firefox's "Manage Extension Shortcuts" (Firefox 137+)
  getDocElById("btnShortcuts").addEventListener("click", async () => {
    try {
      await browser.commands.openShortcutSettings();
    } catch (e) {
      flash('Use the gear icon in about:addons, then "Manage Extension Shortcuts"');
    }
  });
});
