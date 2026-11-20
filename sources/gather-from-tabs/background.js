/* global browser */

import * as storage from "./storage.js";
import { copyToClipboardAsHTML, iconBlink } from "./tabsinfos.js";
import { getTabs, saveToFile, downloadAsFiles, openWindow } from "./helper.js";

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    let tmp = await fetch(browser.runtime.getURL("settings.json"));
    tmp = await tmp.json();
    browser.storage.local.set({ selectors: tmp });
  }
  await updateMenus();
});

browser.browserAction.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

async function updateMenus() {
  await browser.menus.removeAll();

  browser.menus.create({
    id: "copy_as_text",
    title: "Copy as Text",
    contexts: ["tab", "page"],
  });

  browser.menus.create({
    id: "copy_as_html",
    title: "Copy as HTML",
    contexts: ["tab", "page"],
  });

  browser.menus.create({
    id: "save_as_file",
    title: "Save Output to File",
    contexts: ["tab", "page"],
  });

  browser.menus.create({
    id: "download_as_files",
    title: "Download as Files",
    contexts: ["tab", "page"],
  });

  browser.menus.create({
    id: "open_window",
    title: "Open Window",
    contexts: ["tab", "page"],
  });

  browser.menus.create({
    id: "run_only",
    title: "Run Only (ignore output)",
    contexts: ["tab", "page"],
  });

  browser.menus.create({
    contexts: ["tab", "page"],
    type: "separator",
  });

  browser.menus.create({
    title: "Configure",
    contexts: ["tab", "page"],
    onclick: async (info) => {
      browser.runtime.openOptionsPage();
    },
  });

  const res = await browser.storage.local.get("selectors");

  for (const menu_parent of [
    "copy_as_html",
    "copy_as_text",
    "save_as_file",
    "download_as_files",
    "open_window",
    "run_only",
  ]) {
    res.selectors.forEach((sel) => {
      const mtitle = sel.code.split("\n")[0].trim();

      browser.menus.create({
        title: mtitle,
        contexts: ["tab", "page"],
        parentId: menu_parent,
        onclick: async (info, tab) => {
          let tmp = "";
          let out = [];
          let tabs = [];

          if (typeof info.frameId === "undefined") {
            tabs = await browser.tabs.query({
              highlighted: true,
              currentWindow: true,
              url: "<all_urls>",
              discarded: false,
              status: "complete",
            });

            if (tabs.length < 1) {
              tabs = [tab];
            } else if (!tabs.map((t) => t.id).includes(tab.id)) {
              tabs = [tab];
            }
          } else {
            tabs = [tab];
          }

          for (const tab of tabs) {
            try {
              tmp = await browser.tabs.executeScript(tab.id, {
                code: `${sel.code}`,
              });

              tmp = tmp[0];
            } catch (e) {
              tmp = e.toString() + " " + tab.url + "\n";
            }

            //out = tmp + out;

            if (typeof tmp === "string") {
              out.push(tmp);
            } else if (Array.isArray(tmp)) {
              out = out.concat(tmp);
            }
          }

          try {
            switch (menu_parent) {
              case "copy_as_text":
                navigator.clipboard.writeText(out.join(""));
                break;
              case "copy_as_html":
                copyToClipboardAsHTML(out.join(""));
                break;
              case "save_as_file":
                saveToFile(out.join(""), "");
                break;
              // >>>  assumes url string array
              case "download_as_files":
                downloadAsFiles(out);
                break;
              case "open_window":
                openWindow(out);
                break;
              // <<<  assumes url string array
              case "run_only":
                break;
            }
            iconBlink();
          } catch (e) {
            // noop
          }
        },
      });
    });
  }
}

browser.browserAction.setBadgeBackgroundColor({ color: "#00000000" });

browser.storage.onChanged.addListener(updateMenus);

async function onCommand(cmd) {
  const shortcutconfig = await storage.get("object", "shortcutconfig", null);

  if (shortcutconfig === null) {
    return;
  }

  const selectors = await storage.get("object", "selectors", []);

  let tmp;
  let out = [];

  const tabs = await getTabs(shortcutconfig[cmd].scope);

  for (const tab of tabs) {
    try {
      tmp = await browser.tabs.executeScript(tab.id, {
        code: `${selectors[shortcutconfig[cmd].format].code}`,
      });
      tmp = tmp[0];
    } catch (e) {
      tmp = e.toString() + " " + tab.url + "\n";
    }
    //out = tmp + out;
    out.push(tmp);
  }

  switch (shortcutconfig[cmd].action) {
    case "ct": // copy text
      navigator.clipboard.writeText(out.join(""));
      break;
    case "ch": // copy html
      copyToClipboardAsHTML(out.join(""));
      break;
    case "s": // save to file
      saveToFile(out.join(""), "");
      break;
    case "dl": // do nothing
      downloadAsFiles(out);
      break;
    case "ow":
      openWindow(out);
      break;
    case "dn": // do nothing
      // do nothing
      break;
  }
  iconBlink();
}

browser.browserAction.setBadgeBackgroundColor({ color: "#00000000" });

browser.commands.onCommand.addListener(onCommand);

updateMenus();
