/* global browser */

let containerCleanupTimer = null;
let toolbarAction = "";
let tcdeldelay = 5000; // ms, configurable via options (stored as seconds)
let emojis = [];
let emojisoffset = 0;
let usecolor = "turquoise";

const FALLBACK_EMOJIS = ["🌀", "🌟", "🚀", "🎲", "🦄"];

async function getFromStorage(type, id, fallback) {
  let tmp = await browser.storage.local.get(id);
  if (typeof tmp[id] === type) {
    return tmp[id];
  }
  await setToStorage(id, fallback);
  return fallback;
}

async function setToStorage(id, value) {
  let obj = {};
  obj[id] = value;
  return browser.storage.local.set(obj);
}

browser.menus.create({
  title: "Open Temp Container",
  contexts: ["link", "selection", "tab", "bookmark"],
  onclick: async (clickdata, tab) => {
    const openAsActive = !clickdata.modifiers.includes("Ctrl");

    if (clickdata.linkUrl) {
      // link
      createTempContainerTab(clickdata.linkUrl, openAsActive);
    } else if (clickdata.selectionText) {
      const ret = await browser.tabs.executeScript({
        code: `
          selection = getSelection();
          out = new Set([...document.links]
           .filter((anchor) => (
                    selection.containsNode(anchor, true)
                    && typeof anchor.href === 'string'
                    && anchor.href.trim() !== ''
                )
            ).map((link) => link.href.trim() ));
          `,
      });

      const links = ret[0];

      for (const link of links) {
        createTempContainerTab(link, false);
      }
    } else if (clickdata.bookmarkId) {
      // bookmark or bookmark folder
      const bms = await browser.bookmarks.get(clickdata.bookmarkId);
      if (bms.length > 0) {
        const bm = bms[0];
        if (bm.url) {
          createTempContainerTab(bm.url);
        } else {
          for (const c of await browser.bookmarks.getChildren(
            clickdata.bookmarkId,
          )) {
            if (c.url) {
              createTempContainerTab(c.url, openAsActive);
            }
          }
        }
      }
    } else if (clickdata.frameUrl) {
      // frame
      createTempContainerTab(clickdata.frameUrl, openAsActive);
    } else if (clickdata.srcUrl) {
      // image or something with a src
      createTempContainerTab(clickdata.srcUrl);
    } else {
      // if tab.id is part of the highlighted group,
      // open the highlighted group in temp containers
      let hltabs = await browser.tabs.query({
        currentWindow: true,
        highlighted: true,
      });
      let hltids = hltabs.map((t) => t.id);
      if (hltids.includes(tab.id)) {
        for (const hlt of hltabs) {
          createTempContainerTab(hlt.url, openAsActive);
        }
      } else {
        // if the user clicked on a tab outside the highlighted group,
        // lets assume he only wants to open that tab
        createTempContainerTab(tab.url, openAsActive);
      }
    }
  },
});

// delayed container cleanup
async function onTabRemoved() {
  clearTimeout(containerCleanupTimer);
  containerCleanupTimer = setTimeout(async () => {
    const containerWithTabs = new Set(
      (await browser.tabs.query({})).map((t) => t.cookieStoreId),
    );
    const containers = await browser.contextualIdentities.query({});
    containers.forEach((c) => {
      if (
        !containerWithTabs.has(c.cookieStoreId) &&
        c.name.startsWith("Temp")
      ) {
        browser.contextualIdentities.remove(c.cookieStoreId);
      }
    });
  }, tcdeldelay);
}

async function createTempContainerTab(url, activ = true) {
  let container = await createContainer();
  let tabs = await browser.tabs.query({ currentWindow: true, active: true });
  const index = tabs.length > 0 ? tabs[0].index + 1 : -1;

  let obj = {
    active: activ,
    index: index,
    cookieStoreId: container.cookieStoreId,
  };
  if (typeof url === "string" && url.startsWith("http")) {
    obj["url"] = url;
  }
  return browser.tabs.create(obj);
}

async function openNewTabInExistingContainer(cookieStoreId) {
  let tabs = await browser.tabs.query({ currentWindow: true, active: true });
  const index = tabs.length > 0 ? tabs[0].index + 1 : -1;
  browser.tabs.create({
    active: true,
    index: index,
    cookieStoreId: cookieStoreId,
  });
}

function onBAClicked(tab) {
  if (toolbarAction === "newtab") {
    createTempContainerTab();
  } else {
    if (tab.url.startsWith("http")) {
      createTempContainerTab(tab.url, true);
    } else {
      createTempContainerTab();
    }
  }
}

async function createContainer() {
  const now = "" + Date.now();
  const pick =
    emojis.length > 0
      ? emojis[emojisoffset++ % emojis.length]
      : FALLBACK_EMOJIS[emojisoffset++ % FALLBACK_EMOJIS.length];
  let container = await browser.contextualIdentities.create({
    name: "Temp" + pick + now.split("").reverse().join(""),
    color: usecolor,
    icon: "circle",
  });
  return container;
}

async function onStorageChange() {
  toolbarAction = await getFromStorage("string", "toolbarAction", "reopen");
  usecolor = await getFromStorage("string", "usecolors", "turquoise");
  const delaySec = await getFromStorage("number", "tcdeldelaysec", 5);
  tcdeldelay = delaySec * 1000;
}

async function onCommand(command) {
  switch (command) {
    case "opennewtab":
      createTempContainerTab("about:newtab");
      break;
    case "openinsame":
      // get container of currently active tab
      // create new tab with container id
      const tabs = await browser.tabs.query({
        currentWindow: true,
        active: true,
      });
      if (tabs.length > 0) {
        const atab = tabs[0];
        openNewTabInExistingContainer(atab.cookieStoreId);
      }
      break;
  }
}

(async () => {
  // init vars
  await onStorageChange();

  try {
    let tmp = await fetch("emojis.json");
    if (!tmp.ok) {
      throw new Error("emojis.json fetch failed: " + tmp.status);
    }
    const loaded = await tmp.json();
    if (Array.isArray(loaded) && loaded.length > 0) {
      emojis = loaded;
    } else {
      throw new Error("emojis.json was empty or malformed");
    }
  } catch (e) {
    console.error(
      "Open Temp Container: falling back to built-in emoji set –",
      e,
    );
    emojis = FALLBACK_EMOJIS.slice();
  }
  emojis = emojis
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
  emojisoffset = Math.floor(Math.random() * emojis.length);

  // trigger inital cleanup, for browser re-start
  setTimeout(onTabRemoved, tcdeldelay);

  // register listeners
  browser.browserAction.onClicked.addListener(onBAClicked);
  browser.commands.onCommand.addListener(onCommand);
  browser.storage.onChanged.addListener(onStorageChange);
  browser.tabs.onRemoved.addListener(onTabRemoved);
})();
