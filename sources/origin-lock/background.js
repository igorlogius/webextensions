/* global browser */

(async () => {
  const storage = await import("./storage.js");
  let list;
  let mode;

  browser.browserAction.disable();

  //const temporary = browser.runtime.id.endsWith('@temporary-addon'); // debugging?
  const manifest = browser.runtime.getManifest();
  const extname = manifest.name;

  async function onBeforeRequest(details) {
    const tab = await browser.tabs.get(details.tabId);
    const tab_url = new URL(tab.url);
    const req_url = new URL(details.url);
    //console.debug(tab.url, details.url);

    if (!tab.url.startsWith("about:") && tab_url.origin !== req_url.origin) {
      if (mode) {
        // blacklist / deny list => only listed will be opened in a new tab
        if (list.has(tab_url.origin)) {
          browser.tabs.create({
            active: true,
            url: details.url,
          });
          return { cancel: true };
        }
      } else {
        // whitelist / allow list => only not listed will be opened in a new tab
        if (!list.has(tab_url.origin)) {
          browser.tabs.create({
            active: true,
            url: details.url,
          });
          return { cancel: true };
        }
      }
    }
  }

  function onUpdated(tabId, changeInfo, tab) {
    if (changeInfo.status === "complete") {
      if (typeof tab.url && "string" && /^https?:/.test(tab.url)) {
        browser.browserAction.enable(tab.id);

        const domain = new URL(tab.url);
        if (list.has(domain.origin)) {
          browser.browserAction.setBadgeText({ tabId: tab.id, text: "✓" });
        } else {
          browser.browserAction.setBadgeText({ tabId: tab.id, text: "☓" });
        }
      } else {
        browser.browserAction.setBadgeText({ tabId: tab.id, text: "" });
        browser.browserAction.disable(tab.id);
      }
    }
  }

  async function onStorageChanged(changes /*, area */) {
    const changedItems = Object.keys(changes);
    if (changedItems.includes("mode")) {
      if (changes["mode"].newValue !== changes["mode"].oldValue) {
        mode = changes["mode"].newValue;
        if (mode) {
          // blacklist
          browser.browserAction.setBadgeBackgroundColor({ color: "black" });
        } else {
          // whitelist
          browser.browserAction.setBadgeBackgroundColor({ color: "white" });
        }

        const notify_message =
          (mode ? "Black" : "White") +
          "list mode enabled\nAdded domains " +
          (mode
            ? "are forced to open different origins in a new tab"
            : "are allowed to open different origins in the same tab");
        const nID = await browser.notifications.create(extname, {
          type: "basic",
          iconUrl: "icon.png",
          title: extname,
          message: notify_message,
        });

        setTimeout(() => {
          browser.notifications.clear(nID);
        }, 5 * 1000);
      }
    }
    if (changedItems.includes("list")) {
      list = new Set(await storage.get("object", "list", []));
    }
  }

  async function onTabActivated(info) {
    const tab = await browser.tabs.get(info.tabId);
    if (typeof tab.url === "string" && /^https?:/.test(tab.url)) {
      const url = new URL(tab.url);

      if (list.has(url.origin)) {
        // included
        browser.browserAction.setBadgeText({ tabId: tab.id, text: "✓" });
      } else {
        // excluded
        browser.browserAction.setBadgeText({ tabId: tab.id, text: "☓" });
      }
    } else {
      browser.browserAction.setBadgeText({ tabId: tab.id, text: "" });
      browser.browserAction.disable(tab.id);
    }
  }

  async function onBAClicked(tab, clickData) {
    if (clickData.button === 1) {
      mode = !mode;
      browser.storage.local.set({ mode: mode });
    } else {
      addOrigin2List(tab);
    }
  }

  async function addOrigin2List(activeTab) {
    const activeURL = new URL(activeTab.url);

    let notify_message = '"' + activeURL.origin + '" ';
    if (list.has(activeURL.origin)) {
      list.delete(activeURL.origin);
      notify_message += "removed from";
      browser.browserAction.setBadgeText({ tabId: activeTab.id, text: "☓" });
    } else {
      list.add(activeURL.origin);
      browser.browserAction.setBadgeText({ tabId: activeTab.id, text: "✓" });
      notify_message += "added to";
    }
    notify_message += " list";

    const nID = await browser.notifications.create(extname, {
      type: "basic",
      iconUrl: "icon.png",
      title: extname,
      message: notify_message,
    });

    setTimeout(() => {
      browser.notifications.clear(nID);
    }, 5 * 1000);

    saveList();
  }

  async function saveList() {
    return browser.storage.local.set({ list: [...list] });
  }

  // init
  list = new Set(await storage.get("object", "list", []));
  mode = await storage.get("boolean", "mode", true); // false := whitelist

  if (mode) {
    // blacklist
    browser.browserAction.setBadgeBackgroundColor({ color: "black" });
  } else {
    // whitelist
    browser.browserAction.setBadgeBackgroundColor({ color: "white" });
  }

  // register listeners
  browser.tabs.onUpdated.addListener(onUpdated, {
    urls: ["<all_urls>"],
    properties: ["status"],
  });
  browser.storage.onChanged.addListener(onStorageChanged);
  browser.tabs.onActivated.addListener(onTabActivated);
  browser.browserAction.onClicked.addListener(onBAClicked);

  browser.webRequest.onBeforeRequest.addListener(
    onBeforeRequest,
    { urls: ["<all_urls>"], types: ["main_frame"] },
    ["blocking"]
  );

  browser.commands.onCommand.addListener((command) => {
    if (command === "switch-mode") {
      mode = !mode;
      browser.storage.local.set({ mode: mode });
    }
  });

  browser.menus.create({
    title: "Switch Mode",
    contexts: ["browser_action"],
    onclick: function () {
      mode = !mode;
      browser.storage.local.set({ mode: mode });
    },
  });
})();
