/* global browser */

let closeThreshold = 7;
let saveFolder = "unfiled_____";
let setIntervalIds = [];
let autostart = false;
let ignoreRules = [];
let closeActive = false;
let closeAudible = false;
let closePinned = false;

// Track when each tab was last activated (switched to) ourselves,
// because Firefox updates tab.lastAccessed on user interactions too,
// which prevents active tabs from ever appearing idle.
const tabActivatedAt = new Map();

const asyncFilter = async (arr, predicate) => {
  const results = await Promise.all(arr.map(predicate));
  return arr.filter((_v, index) => results[index]);
};

function updateBadge(text, color) {
  browser.browserAction.setBadgeText({
    text,
  });
  browser.browserAction.setBadgeBackgroundColor({
    color,
  });
}

async function setToStorage(id, value) {
  let obj = {};
  obj[id] = value;
  return browser.storage.local.set(obj);
}

async function getFromStorage(type, id, fallback) {
  let tmp = await browser.storage.local.get(id);
  if (typeof tmp[id] === type) {
    return tmp[id];
  } else {
    setToStorage(id, fallback);
    return fallback;
  }
}

async function rebuildIgnoreRules(
  ignorerulesStr_container_regexs,
  ignorerulesStr_url_regexs,
) {
  ignoreRules = [];

  const container_regexs = ignorerulesStr_container_regexs.split("\n");
  const url_regexs = ignorerulesStr_url_regexs.split("\n");

  for (let i = 0; i < container_regexs.length && i < url_regexs.length; i++) {
    try {
      left = container_regexs[i].trim();
      right = url_regexs[i].trim();

      if (!left.startsWith("#") && !right.startsWith("#")) {
        const containerNameMatcher = left === "" ? null : new RegExp(left);
        const urlMatcher = right === "" ? null : new RegExp(right);
        if (urlMatcher !== null) {
          ignoreRules.push({ containerNameMatcher, urlMatcher });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
}

async function rebuildIntervalHandlers(
  intervalrulesStr_time_ms_and_container_regexs,
  intervalrulesStr_url_regexs,
) {
  // now lets rebuild and start the new interval handlers

  const time_ms_and_container_regexs =
    intervalrulesStr_time_ms_and_container_regexs.split("\n");
  const url_regexs = intervalrulesStr_url_regexs.split("\n");

  for (
    let i = 0;
    i < time_ms_and_container_regexs.length && i < url_regexs.length;
    i++
  ) {
    try {
      let left = time_ms_and_container_regexs[i].trim();
      let right = url_regexs[i].trim();

      if (
        !left.startsWith("#") &&
        !right.startsWith("#") &&
        right !== "" &&
        left !== ""
      ) {
        left_parts = left.split(",");
        if (left_parts.length < 2) {
          continue;
        }

        const minIdleTimeMilliSecs = parseInt(left_parts[0].trim());

        left = left_parts.slice(1).join(",");

        const containerNameMatcher = left === "" ? null : new RegExp(left);
        const urlMatcher = right === "" ? null : new RegExp(right);

        setIntervalIds.push(
          setInterval(() => {
            tabCleanUp({
              minIdleTimeMilliSecs,
              containerNameMatcher,
              urlMatcher,
              //consider_hasText,
            });
          }, minIdleTimeMilliSecs),
        );
      }
    } catch (e) {
      console.error(e);
    }
  }
}

async function getContainerNameFromCookieStoreId(csid) {
  try {
    const contextualIdentity = await browser.contextualIdentities.get(csid);
    return contextualIdentity.name;
  } catch (e) {
    // not inside a container
  }
  return null;
}

async function tabCleanUp(input) {
  if (!autostart) {
    return;
  }

  // to check idle time
  const epoch_now = new Date().getTime();

  const query = {
    // care only about normal windows
    windowType: "normal",
  };
  if (!closeActive) {
    query.active = false;
  }
  if (!closeAudible) {
    query.audible = false;
  }
  if (!closePinned) {
    query.pinned = false;
  }

  let all_tabs = (
    await asyncFilter(
      await browser.tabs.query(query),
      async (t) => {
        // filter ignored tabs
        const cn = await getContainerNameFromCookieStoreId(t.cookieStoreId);
        for (const el of ignoreRules) {
          if (el.containerNameMatcher === null) {
            if (cn === null) {
              if (el.urlMatcher.test(t.url)) {
                return false;
              }
            }
            continue;
          }
          if (cn === null) {
            continue;
          }
          // both are not null, so lets check
          if (el.containerNameMatcher.test(cn)) {
            if (el.urlMatcher.test(t.url)) {
              return false;
            }
          }
        }
        return true;
      },
    )
  ).sort((a, b) => {
    a.lastAccessed - b.lastAccessed;
  });

  //console.debug(all_tabs.map( t => t.cookieStoreId + "_" + t.url ));

  let max_nb_of_tabs_to_close = all_tabs.length - closeThreshold;

  if (max_nb_of_tabs_to_close < 1) {
    return;
  }

  for (const t of all_tabs) {
    // stop when we reach the closeThreshold
    if (max_nb_of_tabs_to_close < 1) {
      continue;
    }

    const cn = await getContainerNameFromCookieStoreId(t.cookieStoreId);
    // check the container
    if (input.containerNameMatcher !== null) {
      if (cn !== null) {
        if (!input.containerNameMatcher.test(cn)) {
          continue;
        }
      } else {
        // cn := null
        continue;
      }
    } else {
      // containerNameMatcher === null
      if (cn !== null) {
        continue;
      }
      // cn === containerNameMatcher
    }

    // check the URL
    if (input.urlMatcher !== null) {
      if (!input.urlMatcher.test(t.url)) {
        continue;
      }
    }

    // check the idle aka. last accessed time of the tab
    // For active tabs, use our own tracked activation time since Firefox
    // updates lastAccessed on in-tab interactions (mouse, keyboard, scroll),
    // which would prevent active tabs from ever appearing idle.
    const lastActive = t.active
      ? (tabActivatedAt.get(t.id) || t.lastAccessed)
      : t.lastAccessed;
    const delta = epoch_now - lastActive;
    if (delta < input.minIdleTimeMilliSecs) {
      continue;
    }

    try {
      if (typeof saveFolder === "string" && saveFolder !== "") {
        let createdetails = {
          title: t.title,
          url: t.url,
          parentId: saveFolder,
        };
        browser.bookmarks.create(createdetails);
      }
    } catch (e) {
      console.error(e);
    }
    await browser.tabs.remove(t.id);
    max_nb_of_tabs_to_close--;
  }
}

async function onBAClicked(tab) {
  setToStorage("autostart", !autostart);
  onStorageChanged();
}

async function onStorageChanged() {
  autostart = await getFromStorage("boolean", "autostart", false);
  saveFolder = await getFromStorage("string", "saveFolder", "unfiled_____");
  closeThreshold = await getFromStorage(
    "number",
    "closeThreshold",
    closeThreshold,
  );
  closeActive = await getFromStorage("boolean", "closeActive", false);
  closeAudible = await getFromStorage("boolean", "closeAudible", false);
  closePinned = await getFromStorage("boolean", "closePinned", false);

  if (autostart) {
    updateBadge("on", "green");

    // stop all running intervals
    setIntervalIds.forEach((id) => {
      clearInterval(id);
    });
    setIntervalIds = [];

    rebuildIgnoreRules(
      await getFromStorage("string", "ignorerules_container_regex", ""),
      await getFromStorage("string", "ignorerules_url_regex", ""),
    );
    rebuildIntervalHandlers(
      await getFromStorage(
        "string",
        "intervalrules_time_ms_and_container_regex",
        "",
      ),
      await getFromStorage("string", "intervalrules_url_regex", ""),
    );
  } else {
    updateBadge("off", "red");
  }
}

(async () => {
  // Seed activation times for all existing tabs
  const existingTabs = await browser.tabs.query({});
  for (const t of existingTabs) {
    tabActivatedAt.set(t.id, t.lastAccessed);
  }

  // Track tab activations ourselves
  browser.tabs.onActivated.addListener(({ tabId }) => {
    tabActivatedAt.set(tabId, Date.now());
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    tabActivatedAt.delete(tabId);
  });
  browser.tabs.onCreated.addListener((tab) => {
    tabActivatedAt.set(tab.id, Date.now());
  });

  await onStorageChanged();
  browser.browserAction.onClicked.addListener(onBAClicked);
  browser.runtime.onMessage.addListener((data, sender) => {
    if (data.cmd === "storageChanged") {
      onStorageChanged();
    }
  });
})();

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    browser.runtime.openOptionsPage();
  }
});
