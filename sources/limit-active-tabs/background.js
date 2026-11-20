/* global browser */

import * as storage from "./storage.js";

(async () => {
  const excluded = new Set();
  let tid = null;

  let maxactivtabs = await storage.get("number", "maxactivtabs", 3);
  let includepins = await storage.get("boolean", "includepins", false);
  let regexList = await getRegexList();

  async function getRegexList() {
    let tmp = await storage.get("string", "listmatchers", "");

    let l = [];

    tmp.split("\n").forEach((line) => {
      line = line.trim();
      if (line === "") {
        return;
      }

      try {
        l.push(new RegExp(line));
      } catch (e) {
        console.warn("invalid url regex : " + line);
        return;
      }
    });

    return l;
  }

  function isRegexExcluded(url) {
    for (let i = 0; i < regexList.length; i++) {
      if (regexList[i].test(url)) {
        return true;
      }
    }
    return false;
  }

  async function onStorageChange(/*changes, area*/) {
    regexList = await getRegexList();
    includepins = await storage.get("boolean", "includepins", false);
    maxactivtabs = await storage.get("number", "maxactivtabs", 3);
  }

  async function doUnload() {
    let qry = {
      url: "*://*/*",
      currentWindow: true,
      discarded: false,
    };
    if (!includepins) {
      qry["pinned"] = false;
    }

    const tabs = await browser.tabs.query(qry);

    // remove excluded and order tabs (by last accessed time
    let tabIds = tabs
      .filter((t) => !excluded.has(t.id))
      .filter((t) => !isRegexExcluded(t.url))
      .sort((a, b) => {
        return b.lastAccessed - a.lastAccessed;
      })
      .map((t) => t.id);

    // remove user defined number of last accessed tabs
    if (tabIds.length > maxactivtabs) {
      tabIds = tabIds.slice(maxactivtabs);
      browser.tabs.discard(tabIds);
    }
  }

  async function onClicked(/*tab ,clickData*/) {
    const tabs = await browser.tabs.query({
      currentWindow: true,
      highlighted: true,
    });
    for (const tab of tabs) {
      if (excluded.has(tab.id)) {
        excluded.delete(tab.id);
        browser.browserAction.setBadgeText({ tabId: tab.id, text: "" });
      } else {
        excluded.add(tab.id);
        browser.browserAction.setBadgeText({ tabId: tab.id, text: "off" });
      }
    }
  }

  function onRemoved(tabId /*,removeInfo*/) {
    if (excluded.has(tabId)) {
      excluded.delete(tabId);
    }
  }

  function delay_unload() {
    clearTimeout(tid);
    tid = setTimeout(doUnload, 2000);
  }

  // default state is disabled
  browser.browserAction.disable();

  // add listeners
  browser.browserAction.onClicked.addListener(onClicked);
  browser.storage.onChanged.addListener(onStorageChange);
  browser.tabs.onRemoved.addListener(onRemoved);
  browser.tabs.onUpdated.addListener(
    (tabId, changeInfo, tab) => {
      // set badge icon
      if (changeInfo.status === "complete") {
        if (excluded.has(tabId)) {
          browser.browserAction.setBadgeText({ tabId: tabId, text: "off" });
        } else {
          browser.browserAction.setBadgeText({ tabId: tabId, text: "" });
        }
        browser.browserAction.enable(tabId);
      } else {
        browser.browserAction.setBadgeText({ tabId: tabId, text: "" });
        browser.browserAction.disable(tabId);
      }

      //
      if (
        typeof changeInfo.url === "string" &&
        /^https?:/.test(changeInfo.url)
      ) {
        delay_unload();
      }
    },
    { properties: ["status", "url"] },
  );
})();
