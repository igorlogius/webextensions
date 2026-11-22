/* global browser */

import * as storage from "./storage.js";

(async () => {
  const temporary = browser.runtime.id.endsWith("@temporary-addon"); // debugging?
  const manifest = browser.runtime.getManifest();
  const extname = manifest.name;
  let manually_disabled = false;
  let mode = false;
  let regexList = [];

  async function getMode() {
    return await storage.get("boolean", "mode", false);
  }

  async function getRegexList() {
    let out = [];
    let tmp = await storage.get("string", "matchers", "");

    tmp.split("\n").forEach((line) => {
      line = line.trim();
      if (line !== "" && !line.startsWith("#")) {
        try {
          line = new RegExp(line.trim());
          out.push(line);
        } catch (e) {
          console.error(e);
        }
      }
    });
    return out;
  }

  function matchesRegEx(url) {
    for (let i = 0; i < regexList.length; i++) {
      if (regexList[i].test(url)) {
        return true;
      }
    }
    return false;
  }

  function updateBadge() {
    if (!manually_disabled) {
      browser.browserAction.setBadgeText({ text: "on" });
      browser.browserAction.setBadgeBackgroundColor({
        color: [0, 115, 0, 115],
      });
      browser.browserAction.setTitle({
        title: `${extname}: ON (click to disable)`,
      });
    } else {
      browser.browserAction.setBadgeText({ text: "off" });
      browser.browserAction.setBadgeBackgroundColor({
        color: [115, 0, 0, 115],
      });
      browser.browserAction.setTitle({
        title: `${extname}: OFF (click to enable)`,
      });
    }
  }

  async function onStorageChange(/*changes, area*/) {
    manually_disabled = await storage.get(
      "boolean",
      "manually_disabled",
      false,
    );
    updateBadge();
    mode = await getMode();
    regexList = await getRegexList();
  }

  await onStorageChange();

  // -------------------------------

  let wasActive = new Set();

  browser.tabs.onUpdated.addListener(
    (tabId, changeInfo, tab) => {
      // ignore
      if (
        !(
          tab.discarded ||
          tab.active ||
          tab.hidden ||
          wasActive.has(tabId) ||
          manually_disabled ||
          !changeInfo.url.startsWith("http")
        )
      ) {
        const mre = matchesRegEx(tab.url);

        if (
          (mode && mre) || // blacklist(true) => matches are not allowed to load
          (!mode && !mre) // whitelist(false) => matches are allowed to load <=> no match => not allowed
        ) {
          browser.tabs.discard(tabId);
          // console.debug("discarded", tab.url);
        }
      }
    },
    { properties: ["url"] },
  );

  browser.tabs.onActivated.addListener((activeInfo) => {
    if (!wasActive.has(activeInfo.tabId)) {
      wasActive.add(activeInfo.tabId);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (wasActive.has(tabId)) {
      wasActive.delete(tabId);
    }
  });

  browser.storage.onChanged.addListener(onStorageChange);
  browser.browserAction.onClicked.addListener(() => {
    manually_disabled = !manually_disabled;
    updateBadge();
    storage.set("manually_disabled", manually_disabled);
  });
})();

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // nothing to do, the welcome page is shown by install.js
  } else {
    // Migrate old data (only if there is old data and it hasn't been migrated yet)
    let oldSelectors = await storage.get("object", "selectors", null);
    let existingMatchers = await storage.get("string", "matchers", "");
    if (
      Array.isArray(oldSelectors) &&
      oldSelectors.length > 0 &&
      existingMatchers === ""
    ) {
      let migrated = oldSelectors.map((e) => e.url_regex).join("\n");
      await storage.set("matchers", migrated);
      await browser.storage.local.remove("selectors");
    }
  }
});
