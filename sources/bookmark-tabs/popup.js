/* global browser */

import * as storage from "./storage.js";
import { recGetFolders } from "./bookmarks.js";
import { onChange } from "./form.js";

["noTimestampSubfolder", "saveFolder", "closeAfterSave"].map((id) => {
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
      el.addEventListener("input", onChange);
    })
    .catch(console.error);
});

let folders = document.getElementById("saveFolder");

async function initSelect() {
  //console.debug("initSelect");
  const nodes = await browser.bookmarks.getTree();
  let out = new Map();
  let depth = 1;
  for (const node of nodes) {
    out = new Map([...out, ...recGetFolders(node, depth)]);
  }
  let tmp = await storage.get("string", "saveFolder", "unfiled_____");
  let last_val = "";
  for (const [k, v] of out) {
    //console.debug(v.title, k, tmp);
    //folders.add(new Option("-".repeat(v.depth) + " " + v.title, k));
    //folders.add(new Option(v.title + " (L" + (v.depth - 1) + ")", k));
    const o = new Option(v.title, k);
    folders.add(o);
    if (k === tmp) {
      //o.selected = true;
      last_val = k;
    } /*else{
        o.selected = false;
    }*/
  }
  folders.value = last_val;
}

async function onLoad() {
  await initSelect();

  document.getElementById("savebtn").addEventListener("click", async (el) => {
    await browser.runtime.sendMessage({
      cmd: "bookmark-tabs",
      postfix: document.getElementById("postfix").value,
    });
    window.close();
  });

  document.getElementById("postfix").addEventListener("keyup", async (el) => {
    if (el.key === "Enter") {
      await browser.runtime.sendMessage({
        cmd: "bookmark-tabs",
        postfix: document.getElementById("postfix").value,
      });
      window.close();
    }
  });

  setTimeout(() => {
    document.getElementById("postfix").focus();
  }, 1000);
}

document.addEventListener("DOMContentLoaded", onLoad);
