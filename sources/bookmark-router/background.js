/* global browser */

import * as storage from "./storage.js";
import { recGetFolders } from "./bookmarks.js";

const manifest = browser.runtime.getManifest();
const extname = manifest.name;

let bookmarkFoldersCache;
let delayTimerId;
let notifications = false;

function notify(title, message = "", iconUrl = "icon.png") {
  if (notifications) {
    return browser.notifications.create("" + Date.now(), {
      type: "basic",
      iconUrl,
      title,
      message,
    });
  }
}

async function updateBookmarkFoldersCache() {
  const nodes = await browser.bookmarks.getTree();
  let out = new Map();
  let depth = 1;
  for (const node of nodes) {
    out = new Map([...out, ...recGetFolders(node, depth)]);
  }
  bookmarkFoldersCache = out;
  return bookmarkFoldersCache;
}

function delay_updateBookmarkFoldesCache() {
  clearTimeout(delayTimerId);
  delayTimerId = setTimeout(updateBookmarkFoldersCache, 2000);
}

function onBAClicked() {
  browser.runtime.openOptionsPage();
}

// send the cachedFolders to the options page
// guarded so the options page never receives `undefined` on first load
async function onMessage(/*data, sender*/) {
  if (typeof bookmarkFoldersCache === "undefined") {
    await updateBookmarkFoldersCache();
  }
  return bookmarkFoldersCache;
}

// compile a regex safely; returns null (and logs) instead of throwing
// on a malformed pattern, so one bad rule can't break the others
function safeRegExp(pattern) {
  try {
    return new RegExp(pattern);
  } catch (e) {
    console.warn(extname + ": invalid url_regex '" + pattern + "':", e);
    return null;
  }
}

async function onBookmarkCreated(id, bookmark) {
  // when a folder is created, only update the FolderCache
  if (typeof bookmark.url !== "string") {
    delay_updateBookmarkFoldesCache();
    return;
  }

  // a bookmark is created ... lets see if any routing is required

  let store = {};

  try {
    store = await browser.storage.local.get("selectors");
    if (typeof store === "undefined") {
      store = {};
    }
  } catch (e) {
    console.error("error", "access to rules storage failed");
    store = {};
  }

  if (typeof store.selectors === "undefined") {
    store.selectors = [];
  }

  for (let selector of store.selectors) {
    // check activ
    if (selector.activ !== true) {
      continue;
    }

    // check url regex
    if (typeof selector.url_regex !== "string") {
      continue;
    }
    const pattern = selector.url_regex.trim();
    if (pattern === "") {
      continue;
    }

    const re = safeRegExp(pattern);
    if (re === null || !re.test(bookmark.url)) {
      continue;
    }

    if (typeof selector.bookmarkId !== "string" || selector.bookmarkId === "") {
      continue;
    }

    // attempt the move; if the target folder was since deleted (or any
    // other error occurs) fall through and let the next matching rule try
    try {
      await browser.bookmarks.move(id, { parentId: selector.bookmarkId });
    } catch (e) {
      console.warn(
        extname + ": failed to move bookmark to '" + selector.bookmarkId + "':",
        e,
      );
      notify(extname, "Couldn't move bookmark - target folder missing?");
      continue;
    }

    try {
      const bm = (await browser.bookmarks.get(selector.bookmarkId))[0];
      notify(extname, "Moved to '" + bm.title + "'");
    } catch (e) {
      notify(extname, "Moved bookmark");
    }
    return;
  } // for
}

function onBookmarkChanged(id, changeInfo) {
  if (!changeInfo.url) {
    // If the item is a folder, url is omitted <=> folder renamed
    delay_updateBookmarkFoldesCache();
  }
}

async function onStorageChanged(changes, area) {
  if (
    area === "local" &&
    Object.prototype.hasOwnProperty.call(changes, "notifications")
  ) {
    notifications = await storage.get("boolean", "notifications", true);
  }
}

// open option
browser.browserAction.onClicked.addListener(onBAClicked);

// option page opened
browser.runtime.onMessage.addListener(onMessage);

// events to update the folder Cache
browser.runtime.onStartup.addListener(delay_updateBookmarkFoldesCache);
browser.runtime.onInstalled.addListener(delay_updateBookmarkFoldesCache);
browser.bookmarks.onRemoved.addListener(delay_updateBookmarkFoldesCache);
browser.bookmarks.onChanged.addListener(onBookmarkChanged);
browser.bookmarks.onCreated.addListener(onBookmarkCreated);
browser.storage.onChanged.addListener(onStorageChanged);

(async () => {
  notifications = await storage.get("boolean", "notifications", true);
  // populate the cache immediately rather than waiting for onStartup/onInstalled,
  // so the options page always has folders to show
  await updateBookmarkFoldersCache();
})();
