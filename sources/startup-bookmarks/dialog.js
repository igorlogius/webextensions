/* global browser */

import * as storage from "./storage.js";
import { recGetFolders } from "./bookmarks.js";

const folders = document.getElementById("folder");
const testbtn = document.getElementById("test");

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

["folder"].map((id) => {
  browser.storage.local
    .get(id)
    .then((obj) => {
      let el = document.getElementById(id);
      let val = obj[id];

      if (typeof val !== "undefined") {
        if (el.type === "checkbox") {
          el.checked = val;
        } else {
          el.value = val;
        }
      }
    })
    .catch(console.error);

  let el = document.getElementById(id);
  el.addEventListener("input", onChange);
});

async function initSelect() {
  const nodes = await browser.bookmarks.getTree();
  let out = new Map();
  let depth = 1;
  for (const node of nodes) {
    out = new Map([...out, ...recGetFolders(node, depth)]);
  }
  let tmp = await storage.get("string", "folder", "");
  let last_val = "";
  for (const [k, v] of out) {
    folders.add(new Option("-".repeat(v.depth) + " " + v.title, k));
    if (k === tmp) {
      last_val = k;
    }
  }
  folders.value = last_val;
}

async function onLoad() {
  await initSelect();

  if (folders.value !== "") {
    testbtn.disabled = false;
  } else {
    testbtn.disabled = true;
  }

  folders.addEventListener("input", function () {
    if (folders.value !== "") {
      testbtn.disabled = false;
    } else {
      testbtn.disabled = true;
    }
  });
  testbtn.addEventListener("click", function () {
    // send msg to background script
    browser.runtime.sendMessage({ cmd: "test" });
  });
}

document.addEventListener("DOMContentLoaded", onLoad);
