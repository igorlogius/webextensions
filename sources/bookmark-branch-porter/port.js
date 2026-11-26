/* global browser */

import { recGetFolders } from "./bookmarks.js";

const $ = (id) => document.getElementById(id);

const exportFolder = $("exportfolder");
const importFolder = $("importfolder");
const input = $("input");
const output = $("output");

const state = {
  mode: null, // "export" | "import"
  format: "json",
  steps: ["mode"],
  index: 0,
  busy: false,
};

const importStats = { bookmarks: 0, folders: 0 };

const STEP_LABELS = {
  mode: "Action",
  branch: "Branch",
  format: "Format",
  data: "Data",
  target: "Target",
  result: "Result",
};

/* ---------- Bookmark logic ---------- */

async function importJSON(node, parentId, noroot) {
  if (node.url) {
    await browser.bookmarks.create({
      index: node.index,
      parentId: parentId,
      title: node.title,
      type: "bookmark",
      url: node.url,
      /* not allowed: ref. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/bookmarks/CreateDetails
      dateAdded: node.dateAdded ? node.dateAdded : Date.now(),
      */
    });
    importStats.bookmarks++;
  } else {
    if (node.children && node.children.length > 0) {
      if (noroot) {
        for (let child of node.children) {
          await importJSON(child, parentId, false);
        }
      } else {
        const nBM = await browser.bookmarks.create({
          index: node.index,
          parentId: parentId,
          title: node.title,
          type: "folder",
        });
        importStats.folders++;
        for (let child of node.children) {
          await importJSON(child, nBM.id, false);
        }
      }
    }
  }
}

async function importData(bookmarkId, data, noroot) {
  // add new childen
  return importJSON(data, bookmarkId, noroot);
}

function rec2HtmlStr(bmTreeNode, level = 1) {
  let out = "";
  let tmp = "";
  let title = typeof bmTreeNode.title === "string" ? bmTreeNode.title : "";
  if (typeof bmTreeNode.url === "string") {
    out =
      out +
      "\t".repeat(level) +
      '<DT><A HREF="' +
      bmTreeNode.url +
      '">' +
      title +
      "</A>" +
      "\n";
  } else if (Array.isArray(bmTreeNode.children)) {
    tmp = "\t".repeat(level) + "<DT><H3>" + title + "</H3>" + "\n";
    if (bmTreeNode.children.length > 0) {
      out = out + tmp;
      out = out + "\t".repeat(level) + "<DL><p>" + "\n";
      for (const child of bmTreeNode.children) {
        out = out + rec2HtmlStr(child, level + 1);
      }
      out = out + "\t".repeat(level) + "</DL><p>" + "\n";
    }
  }
  if (level === 1) {
    return (
      "<!DOCTYPE NETSCAPE-Bookmark-file-1>" +
      "\n" +
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">' +
      "\n" +
      '<meta http-equiv="Content-Security-Policy"' +
      "\n" +
      "      content=\"default-src 'self'; script-src 'none'; img-src data: *; object-src 'none'\"></meta>" +
      "\n" +
      "<TITLE>Bookmarks</TITLE>" +
      "\n" +
      "<H1>Bookmarks Menu</H1>" +
      "\n" +
      "\n" +
      "<DL><p>" +
      "\n" +
      out +
      "</DL>"
    );
  }
  return out;
}

function recParseHtmlNode(dlNode) {
  let out = {
    title: dlNode.previousElementSibling.innerText,
    children: [],
  };
  for (const tmp of dlNode.querySelectorAll(":scope > dt > a")) {
    out.children.push({
      title: tmp.innerText,
      url: tmp.href,
    });
  }
  for (const tmp of dlNode.querySelectorAll(":scope > dt > dl")) {
    out.children.push(recParseHtmlNode(tmp));
  }
  return out;
}

function htmlDoc2Json(doc) {
  let out = {
    title: "",
    children: [],
  };
  for (const dl of doc.querySelectorAll("body > dl > dt > dl")) {
    out.children.push(recParseHtmlNode(dl));
  }
  if (out.children.length === 1) {
    return out.children[0];
  }
  return out;
}

/* ---------- Folder lists ---------- */

async function populateFolders() {
  const nodes = await browser.bookmarks.getTree();
  let out = new Map();
  for (const node of nodes) {
    out = new Map([...out, ...recGetFolders(node, 1)]);
  }
  // reset + fill is synchronous, so concurrent calls cannot duplicate options
  for (const sel of [exportFolder, importFolder]) {
    const previous = sel.value;
    sel.length = 1;
    for (const [k, v] of out) {
      sel.add(new Option("-".repeat(v.depth) + " " + v.title, k));
    }
    sel.value = previous;
    if (sel.selectedIndex === -1) {
      sel.selectedIndex = 0;
    }
  }
}

function folderLabel(sel) {
  if (sel.value === "") {
    return sel === exportFolder ? "Entire Bookmark Tree" : "";
  }
  return sel.options[sel.selectedIndex].text.replace(/^-+\s*/, "");
}

/* ---------- Helpers ---------- */

function setMessage(text, status) {
  const el = $("message");
  el.innerText = text;
  if (status) {
    el.setAttribute("data-status", status);
  } else {
    el.removeAttribute("data-status");
  }
}

function cleanFileName(name) {
  return (
    name
      .replace(/[\\/:*?"<>|\s]+/g, "_")
      .replace(/^[_.]+|[_.]+$/g, "")
      .slice(0, 100) || "bookmarks"
  );
}

function sniffFormat(text) {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[") ? "json" : "html";
}

function setFormat(format) {
  state.format = format;
  document.querySelectorAll(".format-toggle button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.format === format));
  });
  renderNav();
}

/* ---------- Wizard ---------- */

function buildSteps(mode) {
  const steps = ["mode"];
  if (mode === "export") {
    steps.push("branch", "format", "result");
  } else {
    steps.push("data", "target", "result");
  }
  return steps;
}

function currentStep() {
  return state.steps[state.index];
}

function canAdvance(step) {
  switch (step) {
    case "data":
      return input.value.trim() !== "";
    case "target":
      return importFolder.value !== "";
    default:
      return true;
  }
}

function recapText(step) {
  if (state.steps[state.index + 1] !== "result") {
    return "";
  }
  const fmt = state.format.toUpperCase();
  if (state.mode === "export") {
    return "Export “" + folderLabel(exportFolder) + "” as " + fmt;
  }
  return "Import " + fmt + " into “" + folderLabel(importFolder) + "”";
}

function renderProgress(current) {
  const list = $("progress");
  list.hidden = current === "mode";
  list.textContent = "";
  state.steps.forEach((step, i) => {
    const li = document.createElement("li");
    if (i < state.index) {
      li.className = "done";
    }
    if (i === state.index) {
      li.setAttribute("aria-current", "step");
    }
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.textContent = i < state.index ? "✓" : String(i + 1);
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = STEP_LABELS[step];
    li.append(dot, label);
    list.append(li);
  });
}

function renderNav() {
  const current = currentStep();
  const back = $("back");
  const next = $("next");
  $("nav").hidden = current === "mode";
  $("recap").textContent = recapText(current);
  back.disabled = state.busy;

  const upcoming = state.steps[state.index + 1];
  if (current === "result") {
    next.textContent = "Start over";
    next.className = "btn btn-ghost";
    next.disabled = state.busy;
  } else if (upcoming === "result") {
    next.textContent = state.mode === "export" ? "Export" : "Import";
    next.className =
      "btn " + (state.mode === "export" ? "btn-export" : "btn-import");
    next.disabled = !canAdvance(current);
  } else {
    next.textContent = "Next";
    next.className = "btn btn-next";
    next.disabled = !canAdvance(current);
  }
}

function render(focus = true) {
  const current = currentStep();
  document.querySelectorAll(".panel").forEach((p) => {
    p.hidden = p.dataset.step !== current;
  });
  renderProgress(current);
  renderNav();
  if (focus) {
    const title = document.querySelector(
      '.panel[data-step="' + current + '"] .panel-title',
    );
    if (title) {
      title.focus();
    }
  }
}

function reset() {
  state.mode = null;
  state.steps = ["mode"];
  state.index = 0;
  state.busy = false;
  input.value = "";
  output.value = "";
  exportFolder.value = "";
  importFolder.value = "";
  $("noroot").checked = false;
  $("exportdata").hidden = true;
  setMessage("", null);
  setFormat("json");
  render();
}

function chooseMode(mode) {
  state.mode = mode;
  state.steps = buildSteps(mode);
  state.index = 1;
  render();
}

async function goNext() {
  const current = currentStep();
  if (state.busy) {
    return;
  }
  if (current === "result") {
    reset();
    return;
  }
  if (!canAdvance(current)) {
    return;
  }
  state.index++;
  render();
  if (currentStep() === "result") {
    await runAction();
  }
}

function goBack() {
  if (state.busy || state.index === 0) {
    return;
  }
  state.index--;
  render();
}

async function runAction() {
  const isExport = state.mode === "export";
  state.busy = true;
  $("exportdata").hidden = true;
  $("result-title").textContent = isExport ? "Exporting" : "Importing";
  setMessage(isExport ? "Exporting…" : "Importing…", "busy");
  renderNav();
  try {
    if (isExport) {
      await doExport();
    } else {
      await doImport();
    }
  } catch (e) {
    console.error(e);
    setMessage((isExport ? "Export failed: " : "Import failed: ") + e, "error");
    $("result-title").textContent = "Something went wrong";
  } finally {
    state.busy = false;
    renderNav();
  }
}

async function doExport() {
  const bmId = exportFolder.value;
  const tmp =
    bmId === ""
      ? (await browser.bookmarks.getTree())[0]
      : (await browser.bookmarks.getSubTree(bmId))[0];
  output.value =
    state.format === "html" ? rec2HtmlStr(tmp) : JSON.stringify(tmp, null, 4);
  const base =
    exportFolder.value === "" ? "bookmarks" : folderLabel(exportFolder);
  $("filename").value =
    cleanFileName(base) + "-" + new Date().toISOString().slice(0, 10);
  $("fileext").textContent = "." + state.format;
  $("exportdata").hidden = false;
  $("result-title").textContent = "Export finished";
  setMessage("Done. Copy the data below or save it as a file.", "ok");
}

async function doImport() {
  const bmId = importFolder.value;
  if (bmId === "") {
    throw new Error("select a folder first");
  }
  let data;
  if (state.format === "json") {
    data = JSON.parse(input.value);
  } else {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(input.value, "text/html");
    data = htmlDoc2Json(htmlDoc);
  }
  importStats.bookmarks = 0;
  importStats.folders = 0;
  await importData(bmId, data, $("noroot").checked);
  $("result-title").textContent = "Import finished";
  setMessage(
    "Added " +
      importStats.bookmarks +
      " bookmark(s) and " +
      importStats.folders +
      " folder(s). Check the results, then you can close this tab.",
    "ok",
  );
}

/* ---------- File open / save / copy ---------- */

function initFileActions() {
  const fileInput = $("fileinput");

  $("doopen").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = ""; // allow re-selecting the same file
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      input.value = text;
      setFormat(sniffFormat(text));
    } catch (e) {
      console.error(e);
      input.value = "";
      renderNav();
    }
  });

  input.addEventListener("input", () => {
    if (input.value.trim() !== "") {
      setFormat(sniffFormat(input.value));
    } else {
      renderNav();
    }
  });

  $("doclear").addEventListener("click", () => {
    input.value = "";
    renderNav();
    input.focus();
  });

  $("docopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(output.value);
    } catch (e) {
      output.select();
      document.execCommand("copy");
    }
    setMessage("Copied to clipboard.", "ok");
  });

  $("dosave").addEventListener("click", () => {
    const text = output.value;
    if (text.trim() === "") {
      setMessage("Nothing to save.", "error");
      return;
    }
    const format = state.format;
    let typed = $("filename").value.trim();
    // drop an extension the user typed themselves, it is added automatically
    typed = typed.replace(new RegExp("\\." + format + "$", "i"), "");
    const name = cleanFileName(typed) + "." + format;
    const blob = new Blob([text], {
      type: format === "json" ? "application/json" : "text/html",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMessage("Saved as " + name, "ok");
  });
}

/* ---------- Init ---------- */

async function onDOMContentLoaded() {
  try {
    await populateFolders();
  } catch (e) {
    console.error(e);
  }

  document.querySelectorAll(".choice").forEach((btn) => {
    btn.addEventListener("click", () => chooseMode(btn.dataset.mode));
  });
  document.querySelectorAll(".format-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => setFormat(btn.dataset.format));
  });
  exportFolder.addEventListener("change", renderNav);
  importFolder.addEventListener("change", renderNav);
  $("back").addEventListener("click", goBack);
  $("next").addEventListener("click", goNext);

  initFileActions();
  render(false);
}

document.addEventListener("DOMContentLoaded", onDOMContentLoaded);
