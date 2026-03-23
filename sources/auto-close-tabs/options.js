/* global browser */

const saveFolder = document.getElementById("saveFolder");

function recGetFolders(node, depth = 0) {
  let out = new Map();
  if (typeof node.url !== "string") {
    if (node.id !== "root________") {
      out.set(node.id, { depth: depth, title: node.title });
    }
    if (node.children) {
      for (let child of node.children) {
        out = new Map([...out, ...recGetFolders(child, depth + 1)]);
      }
    }
  }
  return out;
}

async function initSaveFolderSelect() {
  const nodes = await browser.bookmarks.getTree();
  let out = new Map();
  let depth = 1;
  for (const node of nodes) {
    out = new Map([...out, ...recGetFolders(node, depth)]);
  }
  for (const [k, v] of out) {
    saveFolder.add(new Option("-".repeat(v.depth) + " " + v.title, k));
  }
}

function onChange(evt) {
  let id = evt.target.id;
  let el = document.getElementById(id);

  let value = el.type === "checkbox" ? el.checked : el.value;
  let obj = {};

  if (el.type === "number") {
    try {
      value = parseInt(value);
      if (isNaN(value)) {
        value = el.min;
      }
      if (value < el.min) {
        value = el.min;
      }
    } catch (e) {
      value = el.min;
    }
  }

  obj[id] = value;
  browser.storage.local.set(obj).catch(console.error);
}

async function onLoad() {
  try {
    await initSaveFolderSelect();
  } catch (e) {
    console.error(e);
  }

  [
    "closeThreshold",
    "saveFolder",
    "closeActive",
    "closeAudible",
    "closePinned",
    "intervalrules_url_regex",
    "intervalrules_time_ms_and_container_regex",
    "ignorerules_url_regex",
    "ignorerules_container_regex",
  ].map(async (id) => {
    try {
      const obj = await browser.storage.local.get(id);
      let el = document.getElementById(id);
      let val = obj[id];

      if (typeof val !== "undefined") {
        if (el.type === "checkbox") {
          el.checked = val;
        } else {
          el.value = val;
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  document.getElementById("savebtn").addEventListener("click", () => {
    [
      "closeThreshold",
      "saveFolder",
      "closeActive",
      "closeAudible",
      "closePinned",
      "intervalrules_url_regex",
      "intervalrules_time_ms_and_container_regex",
      "ignorerules_url_regex",
      "ignorerules_container_regex",
    ].forEach((id) => {
      let el = document.getElementById(id);

      let value = el.type === "checkbox" ? el.checked : el.value;
      let obj = {};

      if (el.type === "number") {
        try {
          value = parseInt(value);
          if (isNaN(value)) {
            value = el.min;
          }
          if (value < el.min) {
            value = el.min;
          }
        } catch (e) {
          value = el.min;
        }
      }

      obj[id] = value;
      browser.storage.local.set(obj).catch(console.error);
    });

    browser.runtime.sendMessage({ cmd: "storageChanged" });
  });
}

document.addEventListener("DOMContentLoaded", onLoad);
