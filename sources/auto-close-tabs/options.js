/* global browser */

import * as storage from "./storage.js";
import { recGetFolders } from "./bookmarks.js";

const saveFolderEl = document.getElementById("saveFolder");
const closeThresholdEl = document.getElementById("closeThreshold");
const savebtn = document.getElementById("savebtn");
const resetbtn = document.getElementById("resetbtn");
const statusEl = document.getElementById("status");
const closeRulesListEl = document.getElementById("closeRulesList");
const ignoreRulesListEl = document.getElementById("ignoreRulesList");
const closeRulesSection = document.getElementById("closeRulesSection");
const ignoreRulesSection = document.getElementById("ignoreRulesSection");
const closeRulesToggle = document.getElementById("closeRulesToggle");
const ignoreRulesToggle = document.getElementById("ignoreRulesToggle");
const closeRulesCountEl = document.getElementById("closeRulesCount");
const ignoreRulesCountEl = document.getElementById("ignoreRulesCount");
const statusPillEl = document.getElementById("statusPill");
const toggleAutostartBtn = document.getElementById("toggleAutostart");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFileEl = document.getElementById("importFile");
const importExportMsgEl = document.getElementById("importExportMsg");

// Currently open tabs as {url, container}, used for the "matches N open tabs"
// live hint next to each URL regex field. container = container name, or null
// for tabs that are not in a container. Populated by loadOpenTabSuggestions.
let openTabs = [];

// Units offered for the idle-time input. Value = milliseconds per unit.
// Seconds is the smallest granularity offered — nothing below 1s.
const TIME_UNITS = [
  { ms: 1000, label: "seconds" },
  { ms: 60000, label: "minutes" },
  { ms: 3600000, label: "hours" },
];

// Per-rule save folder values: "" = use the default folder (Auto save card),
// SAVE_FOLDER_NONE = close without bookmarking, anything else = folder id.
const SAVE_FOLDER_NONE = "__none__";

// Bookmark folders of this profile, filled by initSaveFolderSelect:
// [{ id, depth, title }]. Used to build the per-rule folder selects.
let bookmarkFolders = [];

// In-memory rule state. Each close rule:
//   {value, unitMs, container, noContainer, url, saveFolder}
// Each ignore rule: {container, noContainer, url}
// container = container name regex ("" = no regex, ".*" = any container),
// noContainer = also match tabs that are not in a container.
// Both can be active at the same time.
let closeRules = [];
let ignoreRules = [];
let isDirty = false;
let isLoading = true; // suppress dirty-marking while populating the form on load

const unsavedBannerEl = document.getElementById("unsavedBanner");
const bannerResetBtn = document.getElementById("bannerResetBtn");

function markDirty() {
  if (isLoading) return;
  isDirty = true;
  unsavedBannerEl.classList.add("show");
  document.body.classList.add("has-unsaved-banner");
  savebtn.classList.add("dirty");
  resetbtn.disabled = false;
}

function markClean() {
  isDirty = false;
  unsavedBannerEl.classList.remove("show");
  document.body.classList.remove("has-unsaved-banner");
  savebtn.classList.remove("dirty");
  resetbtn.disabled = true;
}

// option pages dont care
/*
window.addEventListener("beforeunload", (evt) => {
  if (!isDirty) return;
  evt.preventDefault();
  evt.returnValue = "";
  return "";
});
*/

function regex101Url(regexStr) {
  const params = new URLSearchParams();
  if (regexStr) params.set("regex", regexStr);
  params.set("flavor", "javascript");
  return `https://regex101.com/?${params.toString()}`;
}

// --- autostart status pill / toggle --------------------------------------
// reads/writes storage directly and notifies background.js
//  without going through the Save button  (this is an instant action not a pending edit).

async function refreshAutostartStatus() {
  let autostart = false;
  try {
    autostart = await storage.get("boolean", "autostart", false);
  } catch (e) {
    console.error(e);
  }
  statusPillEl.textContent = autostart
    ? "Auto-close is ON"
    : "Auto-close is OFF";
  statusPillEl.classList.toggle("on", autostart);
  statusPillEl.classList.toggle("off", !autostart);
  return autostart;
}

toggleAutostartBtn.addEventListener("click", async () => {
  toggleAutostartBtn.disabled = true;
  try {
    const current = await refreshAutostartStatus();
    await storage.set("autostart", !current);
    browser.runtime.sendMessage({ cmd: "storageChanged" });
    await refreshAutostartStatus();
  } catch (e) {
    console.error(e);
  } finally {
    toggleAutostartBtn.disabled = false;
  }
});

// --- bookmark folder select --------------------------------------------

async function initSaveFolderSelect() {
  const nodes = await browser.bookmarks.getTree();
  let out = new Map();
  let depth = 1;
  for (const node of nodes) {
    out = new Map([...out, ...recGetFolders(node, depth)]);
  }
  bookmarkFolders = [];
  for (const [k, v] of out) {
    saveFolderEl.add(new Option("-".repeat(v.depth) + " " + v.title, k));
    bookmarkFolders.push({ id: k, depth: v.depth, title: v.title });
  }
}

// Returns a valid per-rule save folder value: keeps "", SAVE_FOLDER_NONE and
// ids of existing folders, anything else (deleted folder, id from another
// profile) falls back to "" (= use the default folder).
function normalizeRuleSaveFolder(value) {
  if (typeof value !== "string") return "";
  if (value === "" || value === SAVE_FOLDER_NONE) return value;
  return bookmarkFolders.some((f) => f.id === value) ? value : "";
}

// --- parsing legacy storage strings into rule rows ---------------------

function bestFitUnit(timeMs) {
  for (let i = TIME_UNITS.length - 1; i >= 0; i--) {
    if (timeMs % TIME_UNITS[i].ms === 0) return TIME_UNITS[i].ms;
  }
  // No exact unit division (e.g. a value saved in ms by an older version) —
  // fall back to the smallest available unit (seconds) and let the
  // resulting value be fractional rather than reintroducing an ms option.
  return TIME_UNITS[0].ms;
}

// Per-rule "no container" flag, aligned by line index. Missing/unknown lines
// (config saved by an older version) keep the old meaning: an empty container
// pattern = "no container only", a non-empty one = "containers only".
function parseNoContainerFlag(line, container) {
  const v = (line || "").trim();
  if (v === "1") return true;
  if (v === "0") return false;
  return container === "";
}

function parseCloseRulesStorage(leftStr, rightStr, foldersStr, noContainerStr) {
  const left = leftStr.split("\n");
  const right = rightStr.split("\n");
  // aligned by line index with left/right (skipped lines still count);
  // missing lines (older config) mean "use the default folder"
  const folders = (foldersStr || "").split("\n");
  const noContainerFlags = (noContainerStr || "").split("\n");
  const rows = [];

  for (let i = 0; i < left.length && i < right.length; i++) {
    const l = left[i].trim();
    const r = right[i].trim();
    if (l === "" && r === "") continue;
    if (l.startsWith("#") || r.startsWith("#")) continue;

    const parts = l.split(",");
    if (parts.length < 2) continue;

    const timeMs = parseInt(parts[0].trim());
    if (isNaN(timeMs)) continue;
    const container = parts.slice(1).join(",").trim();

    const unitMs = bestFitUnit(timeMs);
    rows.push({
      value: Math.max(1, Math.round(timeMs / unitMs)),
      unitMs,
      container,
      noContainer: parseNoContainerFlag(noContainerFlags[i], container),
      url: r,
      saveFolder: normalizeRuleSaveFolder((folders[i] || "").trim()),
    });
  }
  return rows;
}

function parseIgnoreRulesStorage(leftStr, rightStr, noContainerStr) {
  const left = leftStr.split("\n");
  const right = rightStr.split("\n");
  const noContainerFlags = (noContainerStr || "").split("\n");
  const rows = [];

  for (let i = 0; i < left.length && i < right.length; i++) {
    const l = left[i].trim();
    const r = right[i].trim();
    if (l === "" && r === "") continue;
    if (l.startsWith("#") || r.startsWith("#")) continue;

    rows.push({
      container: l,
      noContainer: parseNoContainerFlag(noContainerFlags[i], l),
      url: r,
    });
  }
  return rows;
}

function serializeCloseRules(rows) {
  return {
    left: rows
      .map((r) => `${Math.round(r.value * r.unitMs)},${r.container}`)
      .join("\n"),
    right: rows.map((r) => r.url).join("\n"),
    folders: rows.map((r) => r.saveFolder || "").join("\n"),
    noContainer: rows.map((r) => (r.noContainer ? "1" : "0")).join("\n"),
  };
}

function serializeIgnoreRules(rows) {
  return {
    left: rows.map((r) => r.container).join("\n"),
    right: rows.map((r) => r.url).join("\n"),
    noContainer: rows.map((r) => (r.noContainer ? "1" : "0")).join("\n"),
  };
}

// --- regex validity helper ----------------------------------------------

function isValidRegexOrEmpty(str) {
  if (str === "") return true;
  try {
    new RegExp(str);
    return true;
  } catch (e) {
    return false;
  }
}

// --- collapsible rule sections ---------------------------------------

function setSectionExpanded(section, toggleEl, expanded) {
  section.classList.toggle("expanded", expanded);
  toggleEl.setAttribute("aria-expanded", String(expanded));
}

function toggleSection(section, toggleEl, otherSection, otherToggleEl) {
  const willExpand = !section.classList.contains("expanded");
  setSectionExpanded(section, toggleEl, willExpand);
  // only one section open at a time, to keep the page short
  if (willExpand) setSectionExpanded(otherSection, otherToggleEl, false);
}

function sectionHasErrors(section) {
  return [...section.querySelectorAll(".rule-row-error")].some(
    (el) => el.textContent.trim() !== "",
  );
}

closeRulesToggle.addEventListener("click", () =>
  toggleSection(
    closeRulesSection,
    closeRulesToggle,
    ignoreRulesSection,
    ignoreRulesToggle,
  ),
);
ignoreRulesToggle.addEventListener("click", () =>
  toggleSection(
    ignoreRulesSection,
    ignoreRulesToggle,
    closeRulesSection,
    closeRulesToggle,
  ),
);

[closeRulesToggle, ignoreRulesToggle].forEach((el) => {
  el.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      el.click();
    }
  });
});

function updateRuleCountBadges() {
  closeRulesCountEl.textContent = `${closeRules.length} rule${closeRules.length === 1 ? "" : "s"}`;
  ignoreRulesCountEl.textContent = `${ignoreRules.length} rule${ignoreRules.length === 1 ? "" : "s"}`;
}

// --- rendering ------------------------------------------------------------

function containerPreset(container) {
  if (container === "") return "";
  if (container === ".*") return ".*";
  return "__custom__";
}

// --- safe DOM builders (no innerHTML / no HTML string parsing) -----------

function buildTimeUnitSelect(selectedMs) {
  const select = document.createElement("select");
  select.className = "rr-time-unit";
  TIME_UNITS.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = String(u.ms);
    opt.textContent = u.label;
    if (u.ms === selectedMs) opt.selected = true;
    select.appendChild(opt);
  });
  return select;
}

function buildSaveFolderSelect(selected) {
  const select = document.createElement("select");
  select.className = "rr-save-folder";
  select.title = "Bookmark folder for tabs closed by this rule";

  const addOption = (value, label) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === selected) opt.selected = true;
    select.appendChild(opt);
  };

  addOption("", "Default folder");
  addOption(SAVE_FOLDER_NONE, "Don't save (just close)");
  for (const f of bookmarkFolders) {
    addOption(f.id, "-".repeat(f.depth) + " " + f.title);
  }
  return select;
}

function buildContainerPresetSelect(preset) {
  const select = document.createElement("select");
  select.className = "rr-container-preset";
  [
    ["", "No container pattern"],
    [".*", "Any container"],
    ["__custom__", "Custom pattern…"],
  ].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === preset) opt.selected = true;
    select.appendChild(opt);
  });
  return select;
}

// "No container" checkbox. It is independent of the select next to it, so a
// rule can match tabs outside of containers AND containers (any / by name).
function buildNoContainerCheckbox(checked) {
  const label = document.createElement("label");
  label.className = "rr-no-container-label";
  label.title = "Also match tabs that are not in a container";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "rr-no-container";
  input.checked = !!checked;
  label.appendChild(input);
  label.appendChild(document.createTextNode(" No container"));
  return label;
}

// Small "i" icon next to the container controls; the hover tooltip explains
// how the options combine.
function buildContainerInfoIcon() {
  const icon = document.createElement("span");
  icon.className = "help";
  icon.textContent = "i";
  icon.title = [
    "No container (checkbox): matches tabs that are NOT in a container.",
    "",
    "Any container: matches tabs in any container, whatever its name.",
    "",
    "Custom pattern: matches tabs in a container whose name matches your regular expression.",
    "",
    "The checkbox and the select can be combined, e.g. 'No container' + 'Any container' matches every tab. At least one must be active.",
  ].join("\n");
  return icon;
}

function buildContainerCustomInput(rule, isCustom, placeholder) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "rr-container-custom";
  input.placeholder = placeholder;
  input.value = isCustom ? rule.container : "";
  input.style.display = isCustom ? "inline-block" : "none";
  return input;
}

function buildContainerMatchHint() {
  const hint = document.createElement("div");
  hint.className = "rule-container-match-hint";
  return hint;
}

function buildRegexHelpLink(regexStr) {
  const a = document.createElement("a");
  a.className = "regex-help";
  a.href = regex101Url(regexStr);
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = "test on regex101 ↗";
  return a;
}

function buildUrlField(rule) {
  const wrapper = document.createElement("div");
  wrapper.className = "rule-field rule-field-grow";

  const label = document.createElement("label");
  label.appendChild(document.createTextNode("URL matches (required) "));
  label.appendChild(buildRegexHelpLink(rule.url));
  wrapper.appendChild(label);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "rr-url";
  input.setAttribute("list", "urlRegexSuggestions");
  input.placeholder = "^https?:\\/\\/.*";
  input.value = rule.url;
  wrapper.appendChild(input);

  const matchHint = document.createElement("div");
  matchHint.className = "rule-url-match-hint";
  wrapper.appendChild(matchHint);

  return wrapper;
}

// Updates the "matches N open tabs" hint for a rule row's URL field.
// Looks at the URL regex only (container settings are previewed separately
// by updateContainerHint).
function updateMatchHint(row, rule) {
  const hintEl = row.querySelector(".rule-url-match-hint");
  if (!hintEl) return;

  const urlStr = rule.url;
  if (!urlStr || !isValidRegexOrEmpty(urlStr)) {
    hintEl.textContent = "";
    return;
  }
  if (openTabs.length === 0) {
    hintEl.textContent = "";
    return;
  }

  let re;
  try {
    re = new RegExp(urlStr);
  } catch (e) {
    hintEl.textContent = "";
    return;
  }

  const count = openTabs.filter((t) => re.test(t.url)).length;
  hintEl.textContent =
    count === 0
      ? "Matches none of your open tabs"
      : `Matches ${count} of your ${openTabs.length} open tab${openTabs.length === 1 ? "" : "s"}`;
}

// Updates the preview under the container controls: how many open tabs the
// container settings alone match ("No container" checkbox + select/pattern).
function updateContainerHint(row, rule) {
  const hintEl = row.querySelector(".rule-container-match-hint");
  if (!hintEl) return;

  const pattern = rule.container || "";
  const noPattern = pattern === "";
  hintEl.classList.remove("warn");

  // Warning: no container option is active, so the rule can never match a tab
  if (!rule.noContainer && noPattern) {
    hintEl.classList.add("warn");
    hintEl.textContent =
      '\u26A0 No container option selected \u2013 this rule will not match any tab. Tick "No container" or choose a container option.';
    return;
  }
  // Warning: "Custom pattern" is selected but still empty
  const customInput = row.querySelector(".rr-container-custom");
  if (customInput && customInput.style.display !== "none" && noPattern) {
    hintEl.classList.add("warn");
    hintEl.textContent =
      "\u26A0 Enter a container name pattern, or choose another container option.";
    return;
  }

  if (openTabs.length === 0 || !isValidRegexOrEmpty(pattern)) {
    hintEl.textContent = "";
    return;
  }

  let containerRe = null;
  try {
    if (!noPattern) containerRe = new RegExp(pattern);
  } catch (e) {
    hintEl.textContent = "";
    return;
  }

  const count = openTabs.filter((t) =>
    t.container === null
      ? !!rule.noContainer
      : containerRe !== null && containerRe.test(t.container),
  ).length;
  hintEl.textContent =
    count === 0
      ? "Container settings match none of your open tabs"
      : `Container settings match ${count} of your ${openTabs.length} open tab${openTabs.length === 1 ? "" : "s"}`;
}

function updateHints(row, rule) {
  updateMatchHint(row, rule);
  updateContainerHint(row, rule);
}

function refreshAllMatchHints() {
  document.querySelectorAll(".rule-row").forEach((row) => {
    const kind = row.dataset.kind;
    const rules = kind === "close" ? closeRules : ignoreRules;
    const rule = rules[Number(row.dataset.index)];
    if (rule) updateHints(row, rule);
  });
}

function buildRuleActions(index, total) {
  const wrap = document.createElement("div");
  wrap.className = "rule-actions";

  const up = document.createElement("button");
  up.type = "button";
  up.className = "rule-move-up";
  up.title = "Move rule up";
  up.textContent = "↑";
  up.disabled = index === 0;
  wrap.appendChild(up);

  const down = document.createElement("button");
  down.type = "button";
  down.className = "rule-move-down";
  down.title = "Move rule down";
  down.textContent = "↓";
  down.disabled = index === total - 1;
  wrap.appendChild(down);

  const dup = document.createElement("button");
  dup.type = "button";
  dup.className = "rule-duplicate";
  dup.title = "Duplicate rule";
  dup.textContent = "⧉";
  wrap.appendChild(dup);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "rule-remove";
  remove.title = "Remove rule";
  remove.textContent = "✕";
  wrap.appendChild(remove);

  return wrap;
}

function renderCloseRules() {
  closeRulesListEl.replaceChildren();
  if (closeRules.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rule-empty";
    empty.textContent =
      "No close rules yet — tabs will only close once you add one.";
    closeRulesListEl.appendChild(empty);
  }
  closeRules.forEach((rule, index) => {
    closeRulesListEl.appendChild(renderCloseRuleRow(rule, index));
  });
  updateRuleCountBadges();
  validateAll();
}

function renderIgnoreRules() {
  ignoreRulesListEl.replaceChildren();
  if (ignoreRules.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rule-empty";
    empty.textContent =
      "No ignore rules — nothing is exempted from close rules.";
    ignoreRulesListEl.appendChild(empty);
  }
  ignoreRules.forEach((rule, index) => {
    ignoreRulesListEl.appendChild(renderIgnoreRuleRow(rule, index));
  });
  updateRuleCountBadges();
  validateAll();
}

function renderCloseRuleRow(rule, index) {
  const row = document.createElement("div");
  row.className = "rule-row";
  row.dataset.index = index;
  row.dataset.kind = "close";

  const fields = document.createElement("div");
  fields.className = "rule-row-fields";

  // idle time
  const timeField = document.createElement("div");
  timeField.className = "rule-field";
  const timeLabel = document.createElement("label");
  timeLabel.textContent = "Idle for";
  timeField.appendChild(timeLabel);

  const timeInputsWrap = document.createElement("div");
  timeInputsWrap.className = "time-inputs";
  const timeValueInput = document.createElement("input");
  timeValueInput.type = "number";
  timeValueInput.className = "rr-time-value";
  timeValueInput.min = "1";
  timeValueInput.step = "1";
  timeValueInput.value = rule.value;
  timeValueInput.style.width = "64px";
  timeInputsWrap.appendChild(timeValueInput);
  timeInputsWrap.appendChild(buildTimeUnitSelect(rule.unitMs));
  timeField.appendChild(timeInputsWrap);
  fields.appendChild(timeField);

  // container
  const preset = containerPreset(rule.container);
  const isCustom = preset === "__custom__";
  const containerField = document.createElement("div");
  containerField.className = "rule-field";
  const containerLabel = document.createElement("label");
  containerLabel.textContent = "Container";
  containerField.appendChild(containerLabel);

  const containerInputsWrap = document.createElement("div");
  containerInputsWrap.className = "container-inputs";
  containerInputsWrap.appendChild(buildNoContainerCheckbox(rule.noContainer));
  containerInputsWrap.appendChild(buildContainerPresetSelect(preset));
  containerInputsWrap.appendChild(buildContainerInfoIcon());
  containerInputsWrap.appendChild(
    buildContainerCustomInput(rule, isCustom, "e.g. ^Tmp.*"),
  );
  containerField.appendChild(containerInputsWrap);
  containerField.appendChild(buildContainerMatchHint());
  fields.appendChild(containerField);

  // save folder
  const folderField = document.createElement("div");
  folderField.className = "rule-field";
  const folderLabel = document.createElement("label");
  folderLabel.textContent = "Save to";
  folderField.appendChild(folderLabel);
  folderField.appendChild(buildSaveFolderSelect(rule.saveFolder || ""));
  fields.appendChild(folderField);

  // url
  fields.appendChild(buildUrlField(rule));

  row.appendChild(fields);
  row.appendChild(buildRuleActions(index, closeRules.length));

  const errEl = document.createElement("div");
  errEl.className = "rule-row-error";
  row.appendChild(errEl);

  updateHints(row, rule);

  return row;
}

function renderIgnoreRuleRow(rule, index) {
  const row = document.createElement("div");
  row.className = "rule-row";
  row.dataset.index = index;
  row.dataset.kind = "ignore";

  const fields = document.createElement("div");
  fields.className = "rule-row-fields";

  // container
  const preset = containerPreset(rule.container);
  const isCustom = preset === "__custom__";
  const containerField = document.createElement("div");
  containerField.className = "rule-field";
  const containerLabel = document.createElement("label");
  containerLabel.textContent = "Container";
  containerField.appendChild(containerLabel);

  const containerInputsWrap = document.createElement("div");
  containerInputsWrap.className = "container-inputs";
  containerInputsWrap.appendChild(buildNoContainerCheckbox(rule.noContainer));
  containerInputsWrap.appendChild(buildContainerPresetSelect(preset));
  containerInputsWrap.appendChild(buildContainerInfoIcon());
  containerInputsWrap.appendChild(
    buildContainerCustomInput(rule, isCustom, "e.g. ^Personal$"),
  );
  containerField.appendChild(containerInputsWrap);
  containerField.appendChild(buildContainerMatchHint());
  fields.appendChild(containerField);

  // url
  fields.appendChild(buildUrlField(rule));

  row.appendChild(fields);
  row.appendChild(buildRuleActions(index, ignoreRules.length));

  const errEl = document.createElement("div");
  errEl.className = "rule-row-error";
  row.appendChild(errEl);

  updateHints(row, rule);

  return row;
}

// --- event delegation for rule rows ---------------------------------------

function getRuleArrayForList(listEl) {
  return listEl === closeRulesListEl ? closeRules : ignoreRules;
}

function attachListHandlers(listEl) {
  listEl.addEventListener("input", (evt) => {
    const row = evt.target.closest(".rule-row");
    if (!row) return;
    const rules = getRuleArrayForList(listEl);
    const rule = rules[Number(row.dataset.index)];
    if (!rule) return;

    if (evt.target.classList.contains("rr-time-value")) {
      rule.value = parseInt(evt.target.value, 10);
    } else if (evt.target.classList.contains("rr-container-custom")) {
      rule.container = evt.target.value;
    } else if (evt.target.classList.contains("rr-url")) {
      rule.url = evt.target.value;
      const helpLink = row.querySelector(".regex-help");
      if (helpLink) helpLink.href = regex101Url(rule.url);
    }
    updateHints(row, rule);
    markDirty();
    validateAll();
  });

  listEl.addEventListener("change", (evt) => {
    const row = evt.target.closest(".rule-row");
    if (!row) return;
    const rules = getRuleArrayForList(listEl);
    const rule = rules[Number(row.dataset.index)];
    if (!rule) return;

    if (evt.target.classList.contains("rr-time-unit")) {
      rule.unitMs = parseInt(evt.target.value);
      markDirty();
      validateAll();
    } else if (evt.target.classList.contains("rr-save-folder")) {
      rule.saveFolder = evt.target.value;
      markDirty();
    } else if (evt.target.classList.contains("rr-no-container")) {
      rule.noContainer = evt.target.checked;
      updateContainerHint(row, rule);
      markDirty();
      validateAll();
    } else if (evt.target.classList.contains("rr-container-preset")) {
      const val = evt.target.value;
      const customInput = row.querySelector(".rr-container-custom");
      if (val === "__custom__") {
        customInput.style.display = "inline-block";
        customInput.focus();
        rule.container = customInput.value;
      } else {
        customInput.style.display = "none";
        rule.container = val;
      }
      updateContainerHint(row, rule);
      markDirty();
      validateAll();
    }
  });

  listEl.addEventListener("click", (evt) => {
    const row = evt.target.closest(".rule-row");
    if (!row) return;
    const index = Number(row.dataset.index);
    const rules = getRuleArrayForList(listEl);
    const rerender =
      listEl === closeRulesListEl ? renderCloseRules : renderIgnoreRules;

    if (evt.target.classList.contains("rule-remove")) {
      if (!window.confirm("Remove this rule?")) return;
      rules.splice(index, 1);
      rerender();
      markDirty();
    } else if (evt.target.classList.contains("rule-duplicate")) {
      rules.splice(index + 1, 0, structuredClone(rules[index]));
      rerender();
      markDirty();
    } else if (evt.target.classList.contains("rule-move-up")) {
      if (index === 0) return;
      [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
      rerender();
      markDirty();
    } else if (evt.target.classList.contains("rule-move-down")) {
      if (index === rules.length - 1) return;
      [rules[index + 1], rules[index]] = [rules[index], rules[index + 1]];
      rerender();
      markDirty();
    }
  });
}

// --- validation -------------------------------------------------------

function validateAll() {
  let allOk = true;

  document.querySelectorAll(".rule-row").forEach((row) => {
    const kind = row.dataset.kind;
    const rules = kind === "close" ? closeRules : ignoreRules;
    const rule = rules[Number(row.dataset.index)];
    const errEl = row.querySelector(".rule-row-error");
    const urlInput = row.querySelector(".rr-url");
    const containerCustomInput = row.querySelector(".rr-container-custom");
    const timeInput = row.querySelector(".rr-time-value");

    let msg = "";

    if (!rule.url || rule.url.trim() === "") {
      msg = "URL pattern is required.";
    } else if (!isValidRegexOrEmpty(rule.url)) {
      msg = "URL pattern is not a valid regular expression.";
    } else if (
      containerCustomInput &&
      containerCustomInput.style.display !== "none" &&
      !isValidRegexOrEmpty(rule.container)
    ) {
      msg = "Container pattern is not a valid regular expression.";
    } else if (
      containerCustomInput &&
      containerCustomInput.style.display !== "none" &&
      rule.container.trim() === ""
    ) {
      msg = "Enter a container name pattern, or pick another container option.";
    } else if (!rule.noContainer && rule.container === "") {
      msg = 'Tick "No container" or choose a container option.';
    } else if (
      kind === "close" &&
      (!Number.isInteger(rule.value) || rule.value < 1)
    ) {
      msg = "Idle time must be a whole number of at least 1.";
    }

    urlInput.classList.toggle(
      "invalid",
      !rule.url || !isValidRegexOrEmpty(rule.url),
    );
    if (containerCustomInput) {
      containerCustomInput.classList.toggle(
        "invalid",
        containerCustomInput.style.display !== "none" &&
          !isValidRegexOrEmpty(rule.container),
      );
    }
    if (timeInput) {
      timeInput.classList.toggle(
        "invalid",
        kind === "close" && (!Number.isInteger(rule.value) || rule.value < 1),
      );
    }

    errEl.textContent = msg;
    if (msg) allOk = false;
  });

  savebtn.disabled = !allOk;
  return allOk;
}

// --- add rule buttons -----------------------------------------------------

document.getElementById("addCloseRule").addEventListener("click", () => {
  closeRules.push({
    value: 10,
    unitMs: 60000,
    container: "",
    noContainer: true,
    url: "",
    saveFolder: "",
  });
  renderCloseRules();
  markDirty();
  const inputs = closeRulesListEl.querySelectorAll(".rr-url");
  inputs[inputs.length - 1].focus();
});

document.getElementById("addIgnoreRule").addEventListener("click", () => {
  ignoreRules.push({ container: "", noContainer: true, url: "" });
  renderIgnoreRules();
  markDirty();
  const inputs = ignoreRulesListEl.querySelectorAll(".rr-url");
  inputs[inputs.length - 1].focus();
});

attachListHandlers(closeRulesListEl);
attachListHandlers(ignoreRulesListEl);

// --- closeThreshold / saveFolder (unchanged behavior, auto-save) ---------

function normalizeNumberField(el) {
  let value = el.value;
  try {
    value = parseInt(value);
    if (isNaN(value)) value = el.min;
    if (value < el.min) value = el.min;
  } catch (e) {
    value = el.min;
  }
  return value;
}

closeThresholdEl.addEventListener("change", () => {
  markDirty();
});

saveFolderEl.addEventListener("change", () => {
  markDirty();
});

// --- discard-changes snapshot -------------------------------------------
// Captures the last known persisted state (on load, and again after every
// successful save) so "Discard changes" can restore it without a reload.

let lastSavedState = null;

function snapshotSavedState() {
  lastSavedState = {
    closeThreshold: normalizeNumberField(closeThresholdEl),
    saveFolder: saveFolderEl.value,
    closeRules: structuredClone(closeRules),
    ignoreRules: structuredClone(ignoreRules),
  };
}

resetbtn.addEventListener("click", () => {
  if (!lastSavedState) return;
  if (isDirty && !window.confirm("Discard all unsaved changes?")) return;

  closeThresholdEl.value = lastSavedState.closeThreshold;
  saveFolderEl.value = lastSavedState.saveFolder;
  closeRules = structuredClone(lastSavedState.closeRules);
  ignoreRules = structuredClone(lastSavedState.ignoreRules);

  renderCloseRules();
  renderIgnoreRules();
  markClean();
  flashStatus("Changes discarded", false);
});

bannerResetBtn.addEventListener("click", () => resetbtn.click());

// --- save / status ----------------------------------------------------

let statusTimeout = null;
function flashStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "var(--danger)" : "var(--ok)";
  statusEl.classList.add("show");
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusEl.classList.remove("show");
  }, 1800);
}

async function saveAll() {
  if (!validateAll()) {
    if (sectionHasErrors(closeRulesSection)) {
      setSectionExpanded(closeRulesSection, closeRulesToggle, true);
    }
    if (sectionHasErrors(ignoreRulesSection)) {
      setSectionExpanded(ignoreRulesSection, ignoreRulesToggle, true);
    }
    flashStatus("Fix the highlighted rules before saving", true);
    return;
  }

  const closeSerialized = serializeCloseRules(closeRules);
  const ignoreSerialized = serializeIgnoreRules(ignoreRules);

  await Promise.all([
    storage.set("closeThreshold", normalizeNumberField(closeThresholdEl)),
    storage.set("saveFolder", saveFolderEl.value),
    storage.set(
      "intervalrules_time_ms_and_container_regex",
      closeSerialized.left,
    ),
    storage.set("intervalrules_url_regex", closeSerialized.right),
    storage.set("intervalrules_save_folder", closeSerialized.folders),
    storage.set("intervalrules_no_container", closeSerialized.noContainer),
    storage.set("ignorerules_container_regex", ignoreSerialized.left),
    storage.set("ignorerules_url_regex", ignoreSerialized.right),
    storage.set("ignorerules_no_container", ignoreSerialized.noContainer),
  ]);

  browser.runtime.sendMessage({ cmd: "storageChanged" });
  markClean();
  snapshotSavedState();
  flashStatus("Saved", false);
}

savebtn.addEventListener("click", saveAll);

// --- import / export config as JSON ---------------------------------------

const CONFIG_FORMAT_VERSION = 1;

function buildExportObject() {
  return {
    version: CONFIG_FORMAT_VERSION,
    closeThreshold: normalizeNumberField(closeThresholdEl),
    saveFolder: saveFolderEl.value,
    closeRules: closeRules.map((r) => ({
      value: r.value,
      unitMs: r.unitMs,
      container: r.container,
      noContainer: !!r.noContainer,
      url: r.url,
      saveFolder: r.saveFolder || "",
    })),
    ignoreRules: ignoreRules.map((r) => ({
      container: r.container,
      noContainer: !!r.noContainer,
      url: r.url,
    })),
  };
}

function flashImportExportMsg(text, isError) {
  importExportMsgEl.textContent = text;
  importExportMsgEl.classList.toggle("error", !!isError);
}

exportBtn.addEventListener("click", () => {
  const json = JSON.stringify(buildExportObject(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "auto-close-tabs-config.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  flashImportExportMsg("Config exported.", false);
});

importBtn.addEventListener("click", () => {
  importFileEl.click();
});

importFileEl.addEventListener("change", async () => {
  const file = importFileEl.files && importFileEl.files[0];
  importFileEl.value = ""; // allow re-selecting the same file later
  if (!file) return;

  let data;
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch (e) {
    flashImportExportMsg("That file isn't valid JSON.", true);
    return;
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray(data.closeRules) ||
    !Array.isArray(data.ignoreRules)
  ) {
    flashImportExportMsg("That file doesn't look like a valid config.", true);
    return;
  }

  const validUnit = (ms) => TIME_UNITS.some((u) => u.ms === ms);
  // configs exported by older versions have no flag: keep the old meaning
  const importNoContainer = (r) =>
    typeof r.noContainer === "boolean"
      ? r.noContainer
      : !(typeof r.container === "string" && r.container !== "");

  closeRules = data.closeRules
    .filter((r) => r && typeof r.url === "string")
    .map((r) => ({
      value: Number.isInteger(r.value) && r.value >= 1 ? r.value : 10,
      unitMs: validUnit(r.unitMs) ? r.unitMs : 60000,
      container: typeof r.container === "string" ? r.container : "",
      noContainer: importNoContainer(r),
      url: r.url,
      // folder ids are profile-specific; unknown ids fall back to the default
      saveFolder: normalizeRuleSaveFolder(r.saveFolder),
    }));

  ignoreRules = data.ignoreRules
    .filter((r) => r && typeof r.url === "string")
    .map((r) => ({
      container: typeof r.container === "string" ? r.container : "",
      noContainer: importNoContainer(r),
      url: r.url,
    }));

  if (typeof data.closeThreshold === "number") {
    closeThresholdEl.value = Math.max(0, Math.round(data.closeThreshold));
  }
  if (typeof data.saveFolder === "string") {
    // only apply if it's a real option in the select (bookmark folder ids
    // are user/profile-specific and may not exist here)
    const hasOption = [...saveFolderEl.options].some(
      (o) => o.value === data.saveFolder,
    );
    if (hasOption) saveFolderEl.value = data.saveFolder;
  }

  renderCloseRules();
  renderIgnoreRules();
  setSectionExpanded(closeRulesSection, closeRulesToggle, true);
  setSectionExpanded(ignoreRulesSection, ignoreRulesToggle, true);
  markDirty();
  flashImportExportMsg(
    "Config imported — review and click Save changes to apply.",
    false,
  );
});

// --- suggestions from currently open tabs ---------------------------------

// Builds a simple "any page on this domain" regex per unique hostname
// among currently open tabs, and appends them to the URL datalist so they
// show up in the browser's native autocomplete alongside the static ones.
async function loadOpenTabSuggestions() {
  const datalist = document.getElementById("urlRegexSuggestions");
  if (!datalist) return;

  let tabs = [];
  try {
    tabs = await browser.tabs.query({});
  } catch (e) {
    console.error(e);
    return;
  }

  // cookieStoreId -> container name. Tabs whose cookieStoreId is not a known
  // container (default store, private windows, containers disabled) count as
  // "no container", the same way background.js treats them.
  const containerNames = new Map();
  try {
    const identities = await browser.contextualIdentities.query({});
    for (const ci of identities || []) {
      containerNames.set(ci.cookieStoreId, ci.name);
    }
  } catch (e) {
    // containers not available
  }

  const hostnames = new Set();
  const found = [];
  for (const t of tabs) {
    if (!t.url) continue;
    let u;
    try {
      u = new URL(t.url);
    } catch (e) {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    found.push({
      url: t.url,
      container: containerNames.has(t.cookieStoreId)
        ? containerNames.get(t.cookieStoreId)
        : null,
    });
    const host = u.hostname.startsWith("www.")
      ? u.hostname.slice(4)
      : u.hostname;
    hostnames.add(host);
  }
  openTabs = found;

  [...hostnames].sort().forEach((host) => {
    const escaped = host.replace(/\./g, "\\.");
    const opt = document.createElement("option");
    opt.value = `^https?:\\/\\/(www\\.)?${escaped}\\/.*`;
    opt.textContent = `open tab: ${host}`;
    datalist.appendChild(opt);
  });

  refreshAllMatchHints();
}

// --- load ---------------------------------------------------------------

async function onLoad() {
  refreshAutostartStatus();

  try {
    await initSaveFolderSelect();
  } catch (e) {
    console.error(e);
  }

  loadOpenTabSuggestions();

  try {
    const closeThreshold = await storage.get(
      "number",
      "closeThreshold",
      undefined,
    );
    const saveFolder = await storage.get("string", "saveFolder", undefined);

    if (typeof closeThreshold !== "undefined") {
      closeThresholdEl.value = closeThreshold;
    }
    if (typeof saveFolder !== "undefined") {
      saveFolderEl.value = saveFolder;
    }

    closeRules = parseCloseRulesStorage(
      await storage.get(
        "string",
        "intervalrules_time_ms_and_container_regex",
        "",
      ),
      await storage.get("string", "intervalrules_url_regex", ""),
      await storage.get("string", "intervalrules_save_folder", ""),
      await storage.get("string", "intervalrules_no_container", ""),
    );
    ignoreRules = parseIgnoreRulesStorage(
      await storage.get("string", "ignorerules_container_regex", ""),
      await storage.get("string", "ignorerules_url_regex", ""),
      await storage.get("string", "ignorerules_no_container", ""),
    );
  } catch (e) {
    console.error(e);
  }

  renderCloseRules();
  renderIgnoreRules();
  isLoading = false;
  snapshotSavedState();
}

document.addEventListener("DOMContentLoaded", onLoad);
