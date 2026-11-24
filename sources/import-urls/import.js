/* global browser */

import { recGetFolders } from "./bookmarks.js";
import { sleep } from "./utils.js";

const DEFAULT_REGEX =
  "https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\\.[a-zA-Z][a-zA-Z0-9]{0,5}\\b[-a-zA-Z0-9@:%_+\\.~#?&//=]*";

const requiredPermissionB = { permissions: ["bookmarks"] };
const requiredPermissionA = { permissions: ["clipboardRead"] };

// Elements
const rawtext = document.getElementById("rawtext");
const dropzone = document.getElementById("dropzone");
const impbtn = document.getElementById("impbtn");
const pastebtn = document.getElementById("pastebtn");
const clearrawbtn = document.getElementById("clearrawbtn");
const extREinput = document.getElementById("extractregex");
const resetregexbtn = document.getElementById("resetregexbtn");
const impcbbtn = document.getElementById("impcbbtn");
const extractstatus = document.getElementById("extractstatus");

const reviewstep = document.getElementById("reviewstep");
const actionstep = document.getElementById("actionstep");
const countbadge = document.getElementById("countbadge");
const selectallbtn = document.getElementById("selectallbtn");
const selectnonebtn = document.getElementById("selectnonebtn");
const dedupe = document.getElementById("dedupe");
const urllist = document.getElementById("urllist");

const urlsopen = document.getElementById("urlsopen");
const openLoad = document.getElementById("openLoad");
const openDelay = document.getElementById("openDelay");
const groupTabs = document.getElementById("groupTabs");
const groupMode = document.getElementById("groupMode");
const groupNewFields = document.getElementById("groupNewFields");
const groupName = document.getElementById("groupName");
const groupColor = document.getElementById("groupColor");
const groupExistingFields = document.getElementById("groupExistingFields");
const existingGroupSelect = document.getElementById("existingGroupSelect");
const refreshGroupsBtn = document.getElementById("refreshGroupsBtn");
const tabGroupsSupported = typeof browser.tabs.group === "function";

const folders = document.getElementById("folders");
const addbookmarksbtn = document.getElementById("addbookmarksbtn");
const bookmarkrow = document.getElementById("bookmarkrow");
const permissionrow = document.getElementById("permissionrow");
const reqBMPer = document.getElementById("reqBookmarkPermission");
const actionstatus = document.getElementById("actionstatus");

// State: `entries` preserves every match in extraction order (with duplicates).
// `deselectedIds` tracks which entries the user has unchecked.
let entries = []; // { id, url }
let nextId = 1;
let deselectedIds = new Set();

function showStatus(el, type, msg) {
  el.textContent = msg;
  el.className = "status visible " + type;
}

function clearStatus(el) {
  el.textContent = "";
  el.className = "status";
}

function visibleEntries() {
  if (!dedupe.checked) return entries;
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    if (seen.has(e.url)) continue;
    seen.add(e.url);
    out.push(e);
  }
  return out;
}

function selectedUrls() {
  return visibleEntries()
    .filter((e) => !deselectedIds.has(e.id))
    .map((e) => e.url);
}

function renderList() {
  const visible = visibleEntries();
  urllist.innerHTML = "";
  for (const e of visible) {
    const li = document.createElement("li");
    const selected = !deselectedIds.has(e.id);
    if (!selected) li.classList.add("deselected");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selected;
    cb.addEventListener("change", () => {
      if (cb.checked) deselectedIds.delete(e.id);
      else deselectedIds.add(e.id);
      li.classList.toggle("deselected", !cb.checked);
      updateCounts();
    });

    const span = document.createElement("span");
    span.className = "url-text";
    span.textContent = e.url;
    span.title = e.url;

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "remove subtle";
    rm.title = "Remove";
    rm.textContent = "\u00d7";
    rm.addEventListener("click", () => {
      entries = entries.filter((entry) => entry.id !== e.id);
      deselectedIds.delete(e.id);
      renderList();
      syncStepAvailability();
    });

    li.append(cb, span, rm);
    urllist.appendChild(li);
  }
  updateCounts();
}

function updateCounts() {
  const visible = visibleEntries();
  const selectedCount = visible.filter((e) => !deselectedIds.has(e.id)).length;
  countbadge.textContent = `${selectedCount} of ${visible.length} selected`;
  urlsopen.disabled = selectedCount === 0;
  addbookmarksbtn.disabled = selectedCount === 0 || folders.value === "";
}

function syncStepAvailability() {
  const hasEntries = entries.length > 0;
  reviewstep.dataset.disabled = hasEntries ? "false" : "true";
  actionstep.dataset.disabled = hasEntries ? "false" : "true";
  if (!hasEntries) {
    urllist.innerHTML = "";
    countbadge.textContent = "0 selected";
  }
}

selectallbtn.addEventListener("click", () => {
  deselectedIds.clear();
  renderList();
});

selectnonebtn.addEventListener("click", () => {
  for (const e of visibleEntries()) deselectedIds.add(e.id);
  renderList();
});

dedupe.addEventListener("change", () => {
  browser.storage.local.set({ dedupe: dedupe.checked });
  renderList();
});

// --- Step 1: gather text ---

function loadFileText(file) {
  const reader = new FileReader();
  reader.onload = () => {
    rawtext.value = reader.result;
  };
  reader.onerror = () => {
    showStatus(extractstatus, "error", "Could not read that file.");
  };
  reader.readAsText(file);
}

impbtn.addEventListener("change", function () {
  const file = this.files[0];
  if (file) loadFileText(file);
});

pastebtn.addEventListener("click", async () => {
  try {
    if (!(await browser.permissions.request(requiredPermissionA))) {
      showStatus(extractstatus, "error", "Clipboard permission not granted.");
      return;
    }
    const text = await navigator.clipboard.readText();
    rawtext.value = text;
    clearStatus(extractstatus);
  } catch (e) {
    console.error(e);
    showStatus(extractstatus, "error", "Couldn't read the clipboard.");
  }
});

clearrawbtn.addEventListener("click", () => {
  rawtext.value = "";
});

["dragenter", "dragover"].forEach((evtName) => {
  dropzone.addEventListener(evtName, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  });
});
["dragleave", "drop"].forEach((evtName) => {
  dropzone.addEventListener(evtName, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
  });
});
dropzone.addEventListener("drop", (e) => {
  const file =
    e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) loadFileText(file);
});

resetregexbtn.addEventListener("click", () => {
  extREinput.value = DEFAULT_REGEX;
  browser.storage.local.set({ extractregex: DEFAULT_REGEX });
});

extREinput.addEventListener("input", () => {
  browser.storage.local.set({ extractregex: extREinput.value.trim() });
});

function extractUrls(str) {
  let regex;
  try {
    regex = new RegExp(extREinput.value, "gm");
  } catch (e) {
    showStatus(
      extractstatus,
      "error",
      "That extraction pattern isn't a valid regex.",
    );
    return;
  }

  const matches = [];
  let m;
  while ((m = regex.exec(str)) !== null) {
    if (m.index === regex.lastIndex) regex.lastIndex++;
    matches.push(m[0]);
  }

  entries = matches.map((url) => ({ id: nextId++, url }));
  deselectedIds = new Set();
  renderList();
  syncStepAvailability();

  if (entries.length === 0) {
    showStatus(extractstatus, "error", "No URLs found in that text.");
  } else {
    const uniqueCount = new Set(matches).size;
    const dupeCount = matches.length - uniqueCount;
    const dupeNote =
      dupeCount > 0
        ? ` (${dupeCount} duplicate${dupeCount === 1 ? "" : "s"})`
        : "";
    showStatus(
      extractstatus,
      "success",
      `Found ${matches.length} URL${matches.length === 1 ? "" : "s"}${dupeNote}.`,
    );
  }
}

impcbbtn.addEventListener("click", () => {
  extractUrls(rawtext.value);
});

// --- Step 2/3: bookmarks permission + folders ---

async function initFolderSelect() {
  folders.innerHTML = '<option value="">Bookmark folder&hellip;</option>';
  folders.disabled = false;
  bookmarkrow.style.display = "";
  permissionrow.style.display = "none";

  const nodes = await browser.bookmarks.getTree();
  let out = new Map();
  for (const node of nodes) {
    out = new Map([...out, ...recGetFolders(node, 1)]);
  }
  for (const [k, v] of out) {
    folders.add(new Option("-".repeat(v.depth) + " " + v.title, k));
  }
}

reqBMPer.addEventListener("click", async () => {
  if (!(await browser.permissions.request(requiredPermissionB))) {
    showStatus(actionstatus, "error", "Bookmark permission not granted.");
    return;
  }
  await initFolderSelect();
});

folders.addEventListener("change", () => {
  updateCounts();
});

addbookmarksbtn.addEventListener("click", async () => {
  const urls = selectedUrls();
  if (folders.value === "" || urls.length === 0) return;
  for (const url of urls) {
    await browser.bookmarks.create({ parentId: folders.value, url });
  }
  showStatus(
    actionstatus,
    "success",
    `Added ${urls.length} bookmark${urls.length === 1 ? "" : "s"}.`,
  );
  folders.value = "";
  updateCounts();
});

// --- Step 3: open tabs (optionally as a tab group) ---

async function populateExistingGroups() {
  if (!tabGroupsSupported) return;
  const prevValue = existingGroupSelect.value;
  existingGroupSelect.innerHTML =
    '<option value="">Select a group&hellip;</option>';
  try {
    const win = await browser.windows.getCurrent();
    const groups = await browser.tabGroups.query({ windowId: win.id });
    for (const g of groups) {
      const label =
        g.title && g.title.trim() ? g.title : `(untitled, ${g.color})`;
      existingGroupSelect.add(new Option(label, String(g.id)));
    }
    if ([...existingGroupSelect.options].some((o) => o.value === prevValue)) {
      existingGroupSelect.value = prevValue;
    }
  } catch (e) {
    console.error(e);
  }
}

function syncGroupModeFields() {
  const useExisting = groupMode.value === "existing";
  groupNewFields.style.display = useExisting ? "none" : "";
  groupExistingFields.style.display = useExisting ? "" : "none";
}

if (!tabGroupsSupported) {
  groupTabs.disabled = true;
  groupTabs.title = "Tab groups aren't supported in this browser version.";
} else {
  groupTabs.addEventListener("change", () => {
    const on = groupTabs.checked;
    groupMode.disabled = !on;
    groupName.disabled = !on || groupMode.value === "existing";
    groupColor.disabled = !on || groupMode.value === "existing";
    existingGroupSelect.disabled = !on || groupMode.value !== "existing";
    if (on) populateExistingGroups();
    browser.storage.local.set({ groupTabs: on });
  });

  groupMode.addEventListener("change", () => {
    syncGroupModeFields();
    const on = groupTabs.checked;
    groupName.disabled = !on || groupMode.value === "existing";
    groupColor.disabled = !on || groupMode.value === "existing";
    existingGroupSelect.disabled = !on || groupMode.value !== "existing";
    if (on && groupMode.value === "existing") populateExistingGroups();
    browser.storage.local.set({ groupMode: groupMode.value });
  });

  refreshGroupsBtn.addEventListener("click", populateExistingGroups);

  groupName.addEventListener("input", onPersistedChange);
  groupColor.addEventListener("change", onPersistedChange);
}

urlsopen.addEventListener("click", async () => {
  const urls = selectedUrls();
  if (urls.length === 0) return;

  if (urls.length > 25) {
    const ok = confirm(`This will open ${urls.length} tabs. Continue?`);
    if (!ok) return;
  }

  const index_offset = (await browser.tabs.query({ currentWindow: true }))
    .length;
  const discarded = !openLoad.checked;
  const delay = Number(openDelay.value) || 0;
  const shouldGroup = tabGroupsSupported && groupTabs.checked;
  const useExistingGroup = shouldGroup && groupMode.value === "existing";

  if (useExistingGroup && !existingGroupSelect.value) {
    showStatus(actionstatus, "error", "Pick an existing tab group first.");
    return;
  }

  let count = 0;
  const createdTabIds = [];
  for (const url of urls) {
    const tab = await browser.tabs.create({
      active: false,
      discarded,
      url,
      index: index_offset + count,
    });
    createdTabIds.push(tab.id);
    count++;
    if (!discarded && delay > 0) {
      await sleep(delay * 1000);
    }
  }

  let groupNote = "";
  if (shouldGroup && createdTabIds.length > 0) {
    try {
      if (useExistingGroup) {
        const groupId = Number(existingGroupSelect.value);
        await browser.tabs.group({ tabIds: createdTabIds, groupId });
        groupNote = " into the selected tab group";
      } else {
        const groupId = await browser.tabs.group({ tabIds: createdTabIds });
        const updateProps = {};
        if (groupName.value.trim()) updateProps.title = groupName.value.trim();
        if (groupColor.value) updateProps.color = groupColor.value;
        if (Object.keys(updateProps).length > 0) {
          await browser.tabGroups.update(groupId, updateProps);
        }
        groupNote = " in a new tab group";
      }
    } catch (e) {
      console.error(e);
      showStatus(
        actionstatus,
        "error",
        `Opened ${count} tab${count === 1 ? "" : "s"}, but couldn't add them to a tab group (it may no longer exist).`,
      );
      return;
    }
  }

  showStatus(
    actionstatus,
    "success",
    `Opened ${count} tab${count === 1 ? "" : "s"}${groupNote}.`,
  );
});

// --- Persisted fields (openLoad / openDelay / dedupe / extractregex) ---

function onPersistedChange(evt) {
  const id = evt.target.id;
  const el = evt.target;
  let value = el.type === "checkbox" ? el.checked : el.value;
  if (typeof value === "string") value = value.trim();
  browser.storage.local.set({ [id]: value });
}

async function onLoad() {
  if (await browser.permissions.contains(requiredPermissionB)) {
    await initFolderSelect();
  }

  const persistedFields = [
    "extractregex",
    "openLoad",
    "openDelay",
    "dedupe",
    "groupTabs",
    "groupMode",
    "groupName",
    "groupColor",
  ];
  const stored = await browser.storage.local.get(persistedFields);

  if (typeof stored.extractregex === "string") {
    extREinput.value = stored.extractregex;
  } else {
    extREinput.value = DEFAULT_REGEX;
  }
  if (typeof stored.openLoad === "boolean") openLoad.checked = stored.openLoad;
  if (typeof stored.openDelay !== "undefined")
    openDelay.value = stored.openDelay;
  if (typeof stored.dedupe === "boolean") dedupe.checked = stored.dedupe;
  if (tabGroupsSupported) {
    if (typeof stored.groupTabs === "boolean")
      groupTabs.checked = stored.groupTabs;
    if (typeof stored.groupMode === "string")
      groupMode.value = stored.groupMode;
    if (typeof stored.groupName === "string")
      groupName.value = stored.groupName;
    if (typeof stored.groupColor === "string")
      groupColor.value = stored.groupColor;
    groupMode.disabled = !groupTabs.checked;
    groupName.disabled = !groupTabs.checked || groupMode.value === "existing";
    groupColor.disabled = !groupTabs.checked || groupMode.value === "existing";
    existingGroupSelect.disabled =
      !groupTabs.checked || groupMode.value !== "existing";
    syncGroupModeFields();
    if (groupTabs.checked) populateExistingGroups();
  }

  openLoad.addEventListener("change", onPersistedChange);
  openDelay.addEventListener("input", onPersistedChange);

  syncStepAvailability();
}

document.addEventListener("DOMContentLoaded", onLoad);
