/* global browser */

let allTabs = [];
let consideredTabsIds = new Set();

const manifest = browser.runtime.getManifest();
const extname = manifest.name;

function notify(title, message = "", iconUrl = "icon.png") {
  return browser.notifications.create("" + Date.now(), {
    type: "basic",
    iconUrl,
    title,
    message,
  });
}

function highlightTabsByWindowId(winId2tabIdxMap) {
  winId2tabIdxMap.forEach((value, key /*,map*/) => {
    browser.tabs.highlight({
      windowId: key,
      tabs: [...value], // convert from Set to array
      populate: false,
    });
  });
}

function highlight(tabs) {
  if (tabs.length < 1) {
    notify(extname, "no tabs matched, selection was not changed");
    return;
  }
  let winId2tabIdxMap = new Map();
  tabs.forEach((t) => {
    if (!winId2tabIdxMap.has(t.windowId)) {
      winId2tabIdxMap.set(t.windowId, []);
    }
    winId2tabIdxMap.get(t.windowId).push(t.index);
  });
  highlightTabsByWindowId(winId2tabIdxMap);
}

function getDescendentTabs(ancestorTabId, max_relation_depth = -1) {
  let out = [];
  for (const t of allTabs) {
    // ref. openerTabId is only present if the opener tab
    // still exists and is in the same window.
    if (t.openerTabId === ancestorTabId) {
      if (consideredTabsIds.has(t.id)) {
        out.push(t);
      }
      if (max_relation_depth !== 1) {
        const tmp = getDescendentTabs(t.id, max_relation_depth - 1);
        out = [...out, ...tmp];
      }
    }
  }
  return out;
}

async function getAncestorTabs(ancestorTabId, max_relation_depth = -1) {
  let out = [];
  const tabId2tabMap = new Map();
  allTabs.forEach((t) => {
    tabId2tabMap.set(t.id, t);
  });

  let ancestorTab = await browser.tabs.get(ancestorTabId);
  if (consideredTabsIds.has(ancestorTab.id)) {
    out.push(ancestorTab);
  }

  let tmp;
  while (
    typeof ancestorTab.openerTabId === "number" &&
    max_relation_depth !== 1 &&
    tabId2tabMap.has(ancestorTab.openerTabId)
  ) {
    tmp = tabId2tabMap.get(ancestorTab.openerTabId);
    if (consideredTabsIds.has(tmp.id)) {
      out.push(tmp);
    }
    ancestorTab = tmp;
  }
  return out;
}

// -------------

browser.menus.create({
  id: "All",
  title: "All",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Invert Selection",
  title: "Invert Selection",
  contexts: ["tab"],
});

// -------------

browser.menus.create({
  id: "Directional",
  title: "Directional",
  type: "separator",
  contexts: ["tab"],
});
browser.menus.create({
  id: "Relationship",
  title: "Relationship",
  type: "separator",
  contexts: ["tab"],
});
browser.menus.create({
  id: "URL Property",
  title: "URL Property",
  type: "separator",
  contexts: ["tab"],
});
browser.menus.create({
  id: "State",
  title: "State",
  type: "separator",
  contexts: ["tab"],
});

// -------------

browser.menus.create({
  id: "Same Container",
  title: "Same Container",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Same Group",
  title: "Same Group",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Bookmarked",
  title: "Bookmarked",
  contexts: ["tab"],
});

browser.menus.create({
  id: "UserScripts",
  title: "UserScripts",
  contexts: ["tab"],
});

browser.menus.create({
  type: "separator",
  contexts: ["tab"],
});

// Relationship

browser.menus.create({
  id: "Descendents",
  title: "Descendents",
  parentId: "Relationship",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Siblings",
  title: "Siblings",
  parentId: "Relationship",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Children",
  title: "Children",
  parentId: "Relationship",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Parent",
  title: "Parent",
  parentId: "Relationship",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Ancestors",
  title: "Ancestors",
  parentId: "Relationship",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Same URL",
  title: "Same URL",
  parentId: "URL Property",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Same Domain",
  title: "Same Domain",
  parentId: "URL Property",
  contexts: ["tab"],
});

// Positional

browser.menus.create({
  id: "To the Left",
  title: "To the Left",
  parentId: "Directional",
  contexts: ["tab"],
});

browser.menus.create({
  id: "To the Right",
  title: "To the Right",
  parentId: "Directional",
  contexts: ["tab"],
});

// URL Property
browser.menus.create({
  id: "Pinned",
  title: "Pinned",
  parentId: "State",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Muted",
  title: "Muted",
  parentId: "State",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Loading",
  title: "Loading",
  parentId: "State",
  contexts: ["tab"],
});

browser.menus.create({
  id: "Audible",
  title: "Audible",
  parentId: "State",
  contexts: ["tab"],
});

const run = {
  All: async (/*info, tab*/) => {
    const tabs = await browser.tabs.query({
      currentWindow: true,
      hidden: false,
    });
    highlight(tabs);
  },
  "Invert Selection": async (info, tab) => {
    // Previously highlighted tabs not included in tabs will stop being highlighted.
    // The first tab in tabs will become active.
    // ref. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/highlight
    const tabs = await browser.tabs.query({
      highlighted: false,
      currentWindow: true,
      hidden: false,
    });
    highlight(tabs);
  },

  "Same Container": async (info, tab) => {
    if (tab.cookieStoreId) {
      let query = {
        currentWindow: true,
        hidden: false,
        cookieStoreId: tab.cookieStoreId,
      };
      if (multipleHighlighted) {
        // more than one TabIsHighlighted
        // only run the scripts on the highlighted tabs
        // and the ones still highlighted match the script
        query["highlighted"] = true;
      }
      const tabs = (await browser.tabs.query(query))
        // order clicked tabs to the front
        .sort((a, b) => (a.id === tab.id ? -1 : b.id === tab.id ? 1 : 0));
      highlight(tabs);
    }
  },
  "Same Group": async (info, tab) => {
    if (tab.groupId) {
      let query = {
        currentWindow: true,
        hidden: false,
        groupId: tab.groupId,
      };
      const tabs = (await browser.tabs.query(query))
        // order clicked tabs to the front
        .sort((a, b) => (a.id === tab.id ? -1 : b.id === tab.id ? 1 : 0));
      highlight(tabs);
    }
  },
  Descendents: async (info, tab) => {
    allTabs = await browser.tabs.query({
      currentWindow: true,
      hidden: false,
    });

    consideredTabsIds = new Set(allTabs.map((t) => t.id));
    highlight(getDescendentTabs(tab.id).filter((t) => t.id !== tab.id));
  },
  Siblings: async (info, tab) => {
    allTabs = await browser.tabs.query({
      hidden: false,
      currentWindow: true,
    });
    consideredTabsIds = new Set(allTabs.map((t) => t.id));
    highlight(
      getDescendentTabs(tab.openerTabId, 1).filter((t) => t.id !== tab.id),
    );
  },
  Children: async (info, tab) => {
    allTabs = await browser.tabs.query({
      hidden: false,
      currentWindow: true,
    });
    consideredTabsIds = new Set(allTabs.map((t) => t.id));
    highlight(getDescendentTabs(tab.id, 1));
  },
  Parent: async (info, tab) => {
    let query = {
        hidden: false,
        currentWindow: true,
    };
    const tabs = (await browser.tabs.query(query)).filter(
      (t) => t.id === tab.openerTabId,
    );
    highlight(tabs);
  },
  Ancestors: async (info, tab) => {
    allTabs = await browser.tabs.query({
      hidden: false,
      currentWindow: true,
    });
    consideredTabsIds = new Set(allTabs.map((t) => t.id));
    highlight(await getAncestorTabs(tab.id, -1));
  },
  "Same URL": async (info, tab) => {
    let query = {
        hidden: false,
        currentWindow: true,
        url: tab.url,
      };
    const tabs = await browser.tabs.query(query);
    highlight(tabs);
  },
  "Same Domain": async (info, tab) => {
    const hostname = new URL(tab.url).hostname;
    let query = {
        hidden: false,
        currentWindow: true,
        url: "*://" + hostname + "/*",
      };
    const tabs = (await browser.tabs.query(query)).sort((a, b) =>
      a.id === tab.id ? -1 : b.id === tab.id ? 1 : 0,
    );
    highlight(tabs);
  },
  "To the Left": async (info, tab) => {
    let query = {
        hidden: false,
        currentWindow: true,
      };
    const tabs = (await browser.tabs.query(query))
      .filter((t) => {
        return t.index < tab.index;
      })
      .sort((a, b) => b.index - a.index);
    highlight(tabs);
  },
  "To the Right": async (info, tab) => {
    let query = {
        hidden: false,
        currentWindow: true,
      };
    const tabs = (await browser.tabs.query(query))
      .filter((t) => {
        return t.index > tab.index;
      })
      .sort((a, b) => a.index - b.index);
    highlight(tabs);
  },
  Pinned: async (/*info, tab*/) => {
    let query = {
        hidden: false,
        currentWindow: true,
        pinned: true,
      };
    const tabs = await browser.tabs.query(query);
    highlight(tabs);
  },
  Muted: async (/*info, tab*/) => {
    let query = {
        hidden: false,
        currentWindow: true,
        muted: true,
      };
    const tabs = await browser.tabs.query(query);
    highlight(tabs);
  },
  Loading: async (info, tab) => {
    let query = {
        hidden: false,
        currentWindow: true,
      };
    const tabs = (await browser.tabs.query(query))
      .filter((t) => t.status === "loading")
      .sort((a, b) => (a.id === tab.id ? -1 : b.id === tab.id ? 1 : 0));
    highlight(tabs);
  },
  Audible: async (info, tab) => {
    let query = {
        hidden: false,
        currentWindow: true,
        audible: true,
      };
    const tabs = (await browser.tabs.query(query)).sort((a, b) =>
      a.id === tab.id ? -1 : b.id === tab.id ? 1 : 0,
    );
    highlight(tabs);
  },
  Bookmarked: async (info, tab) => {
    const bookmarkedURLs = new Set(
      (await browser.bookmarks.search({}))
        .filter((m) => typeof m.url === "string")
        .map((m) => m.url.trim()),
    );
    const tabs = [];
    for (const t of await browser.tabs.query({ currentWindow: true })) {
      console.debug(t.url, bookmarkedURLs.has(t.url));
      if (bookmarkedURLs.has(t.url)) {
        tabs.push(t);
      }
    }
    highlight(tabs);
  },
  UserScripts: async (info, tab) => {
    let store;
    try {
      store = await browser.storage.local.get("selectors");
    } catch (e) {
      console.error("access to script storage failed");
      return;
    }

    if (typeof store === "undefined") {
      console.error("script store is undefined");
    }

    if (typeof store.selectors === "undefined") {
      console.error("selectors are undefined");
    }

    if (typeof store.selectors.forEach !== "function") {
      console.error("selectors not iterable");
      return;
    }

    let query = {
      hidden: false,
      currentWindow: true,
      url: "<all_urls>",
    };

    const tabs = await browser.tabs.query(query);

    const tabsToHL = [];
    let hltab = false;
    for (const t of tabs) {
      hltab = false;

      for (const selector of store.selectors) {
        // check if enabled
        if (typeof selector.enabled === "boolean") {
          if (selector.enabled === true) {
            // check code
            if (typeof selector.code === "string") {
              if (selector.code !== "") {
                try {
                  //new Function(selector.code);
                  let res = await browser.tabs.executeScript(t.id, {
                    code:
                      `(function() {
                                const clkTab = {
                                    "id": ${tab.id},
                                    "url": "${tab.url}",
                                    "active": ${tab.active},
                                    "attention": ${tab.attention},
                                    "audible": ${tab.audible},
                                    "autoDiscardable": ${tab.autoDiscardable},
                                    "cookieStoreId": "${tab.cookieStoreId}",
                                    "discarded": ${tab.discarded},
                                    "favIconUrl": "${tab.favIconUrl}",
                                    "height": ${tab.height},
                                    "hidden": ${tab.hidden},
                                    "highlighted": ${tab.highlight},
                                    "incognito": ${tab.incognito},
                                    "index": ${tab.index},
                                    "isArticle": ${tab.isArticle},
                                    "isInReaderMode": ${tab.isInReaderMode},
                                    "lastAccessed": ${tab.lastAccessed},
                                    "openerTabId": ${tab.openerTabId},
                                    "pinned": ${tab.pinned},
                                    "sessionId": "${tab.sessionId}",
                                    "status": "${tab.status}",
                                    "successorTabId": ${tab.successorTabId},
                                    "title": "${tab.title}",
                                    "width": ${tab.width},
                                    "windowId": ${tab.windowId}
                                };
                                const cmpTab= {
                                    "id": ${t.id},
                                    "url": "${t.url}",
                                    "active": ${t.active},
                                    "attention": ${t.attention},
                                    "audible": ${t.audible},
                                    "autoDiscardable": ${t.autoDiscardable},
                                    "cookieStoreId": "${t.cookieStoreId}",
                                    "discarded": ${t.discarded},
                                    "favIconUrl": "${t.favIconUrl}",
                                    "height": ${t.height},
                                    "hidden": ${t.hidden},
                                    "highlighted": ${t.highlight},
                                    "incognito": ${t.incognito},
                                    "index": ${t.index},
                                    "isArticle": ${t.isArticle},
                                    "isInReaderMode": ${t.isInReaderMode},
                                    "lastAccessed": ${t.lastAccessed},
                                    "openerTabId": ${t.openerTabId},
                                    "pinned": ${t.pinned},
                                    "sessionId": "${t.sessionId}",
                                    "status": "${t.status}",
                                    "successorTabId": ${t.successorTabId},
                                    "title": "${t.title}",
                                    "width": ${t.width},
                                    "windowId": ${t.windowId}
                                };
                                ` +
                      selector.code +
                      "}());",
                  });
                  if (res.length > 0) {
                    res = res[0];
                  }
                  if (typeof res === "boolean" && res === true) {
                    hltab = true;
                  } else {
                    hltab = false;
                    break;
                  }
                } catch (e) {
                  console.error(e);
                }
              }
            }
          }
        }
      } // for selector
      if (hltab) {
        tabsToHL.push(t);
      }
    } // for tab

    highlight(tabsToHL);
  }, // onclick
};

browser.menus.onClicked.addListener(async (info /*, tab*/) => {
  const tab = (
    await browser.tabs.query({ currentWindow: true, active: true })
  )[0];
  run[info.menuItemId](null, tab);
});

browser.commands.onCommand.addListener(async (command) => {
  const tab = (
    await browser.tabs.query({ currentWindow: true, active: true })
  )[0];
  run[command](null, tab);
});

// EOF
