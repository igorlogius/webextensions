/* global browser */

let last_visible = true;

let failed_urls = [];

const DEFAULTS = {
  collapseGroup: true,
  loadTabs: true,
  replaceExisting: true,
};

async function getSettings() {
  return browser.storage.local.get(DEFAULTS);
}

// Colors supported by browser.tabGroups.update()
const GROUP_COLORS = [
  "blue",
  "cyan",
  "grey",
  "green",
  "pink",
  "purple",
  "red",
  "yellow",
  "orange",
];

// Simple, stable string hash (djb2) so the same folder name always
// maps to the same color.
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // force unsigned
}

function colorForName(name) {
  const idx = hashString(name) % GROUP_COLORS.length;
  return GROUP_COLORS[idx];
}

function isValidURL(str) {
  try {
    const newUrl = new URL(str);
    return newUrl.protocol === "http:" || newUrl.protocol === "https:";
  } catch (err) {
    //console.error(err);
    return false;
  }
}

// Canonical form of a URL for comparing bookmarks with open tabs:
// unwraps reader-mode URLs and normalizes the rest the way the browser does
// ("https://example.com" and "https://example.com/" are the same page).
function normalizeUrl(str) {
  if (typeof str !== "string") {
    return str;
  }
  try {
    if (str.startsWith("about:reader?url=")) {
      str = decodeURIComponent(new URL(str).searchParams.get("url"));
    }
    return new URL(str).href;
  } catch (e) {
    return str;
  }
}

// Reorder the tabs of a group so they follow wantedIds (bookmark order).
// Tabs of the group that are not in wantedIds keep their relative order
// and end up behind the others.
async function reorderGroup(groupId, wantedIds) {
  const groupTabs = await browser.tabs.query({ groupId });
  if (groupTabs.length < 2) {
    return;
  }
  groupTabs.sort((a, b) => a.index - b.index);
  const inGroup = new Set(groupTabs.map((t) => t.id));
  const ordered = [...new Set(wantedIds)].filter((id) => inGroup.has(id));
  const wanted = new Set(ordered);
  const rest = groupTabs.filter((t) => !wanted.has(t.id)).map((t) => t.id);
  const finalOrder = [...ordered, ...rest];
  if (finalOrder.every((id, i) => id === groupTabs[i].id)) {
    return; // already in the right order
  }
  // A tab moved to the end of a group drops out of it, so never move to the
  // end: move the tabs one by one in reverse order to the first position of
  // the group. The last one moved (the first bookmark) ends up first.
  const startIndex = groupTabs[0].index;
  for (const id of [...finalOrder].reverse()) {
    await browser.tabs.move(id, { index: startIndex });
  }
}

browser.menus.onShown.addListener(async (info, tab) => {
  if (info.bookmarkId) {
    // prevent needless check
    const [btNode] = await browser.bookmarks.get(info.bookmarkId); // no idea why this returns an array
    let curr_visible = typeof btNode.url !== "string"; // only show on folders
    if (last_visible !== curr_visible) {
      // prevent needless update+refresh
      last_visible = curr_visible;
      await browser.menus.update("obatg", {
        visible: curr_visible,
      });
      browser.menus.refresh();
    }
  }
});

browser.menus.create({
  id: "obatg",
  title: "Open &Tabgroup",
  contexts: ["bookmark"],
  onclick: async (info, tab) => {
    const [btNode] = await browser.bookmarks.get(info.bookmarkId);
    const settings = await getSettings();

    let [existingGroup] = await browser.tabGroups.query({
      title: btNode.title,
    });
    // URL -> tab id for tabs already open in the existing group
    // (only used when adding to it)
    const knownUrls = new Map();
    if (existingGroup) {
      const existingTabs = await browser.tabs.query({
        groupId: existingGroup.id,
      });
      if (settings.replaceExisting) {
        // Close the old group so we always end up with a single,
        // freshly-opened group.
        try {
          await browser.tabs.remove(existingTabs.map((t) => t.id));
        } catch (e) {
          //console.error(e);
          // noop
        }
        existingGroup = undefined;
      } else {
        // Keep the group and only add what is missing.
        for (const t of existingTabs) {
          const u = normalizeUrl(t.url);
          if (!knownUrls.has(u)) {
            knownUrls.set(u, t.id);
          }
        }
      }
    }

    const createdTabs = [];
    // tab ids in bookmark order (new tabs and already-open ones)
    const orderedIds = [];
    failed_urls = [];
    for (const c of await browser.bookmarks.getChildren(btNode.id)) {
      if (typeof c.url === "string") {
        let c_url = c.url;
        if (c_url.startsWith("about:reader?url=")) {
          c_url = decodeURIComponent(new URL(c_url).searchParams.get("url"));
        }
        if (isValidURL(c_url)) {
          const key = normalizeUrl(c_url);
          if (existingGroup && knownUrls.has(key)) {
            // already open in the group (loaded or discarded), don't open
            // it again
            orderedIds.push(knownUrls.get(key));
            continue;
          }
          try {
            const tabProps = { url: c_url, active: false };
            if (!settings.loadTabs) {
              // Discarded tabs need a title, since they won't be loaded
              // to derive one from the page itself.
              tabProps.discarded = true;
              tabProps.title = new URL(c_url).hostname || c_url;
            }
            const newTab = await browser.tabs.create(tabProps);
            createdTabs.push({ id: newTab.id, url: c_url });
            knownUrls.set(key, newTab.id);
            orderedIds.push(newTab.id);
            continue;
          } catch (e) {
            //console.error(e);
            // noop
          }
        }
        failed_urls.push(c.url);
      }
      // no a bookmark but a bookmark folder
    }
    let groupId = existingGroup ? existingGroup.id : null;
    if (createdTabs.length > 0) {
      try {
        const tabIds = createdTabs.map((t) => t.id);
        if (existingGroup) {
          // add to the existing group, leave its title/color/collapsed as is
          await browser.tabs.group({ tabIds, groupId: existingGroup.id });
        } else {
          groupId = await browser.tabs.group({ tabIds });
          await browser.tabGroups.update(groupId, {
            title: btNode.title,
            collapsed: settings.collapseGroup,
            color: colorForName(btNode.title),
          });
        }
      } catch (e) {
        //console.error(e);
        // Grouping failed (e.g. unsupported); tabs are still open ungrouped.
        groupId = null;
      }
    }

    // Align the tab order in the group with the bookmark folder
    if (groupId !== null) {
      try {
        await reorderGroup(groupId, orderedIds);
      } catch (e) {
        //console.error(e);
        // noop, the order is just not perfect
      }
    }

    if (failed_urls.length > 0) {
      await browser.tabs.create({
        url: "/errors.html",
        active: true,
      });
    }
  },
});

browser.runtime.onMessage.addListener((data, sender) => {
  return Promise.resolve(failed_urls);
});
